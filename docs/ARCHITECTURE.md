# ARCHITECTURE.md — Overview of the WelfareData Canvas Navigator

## What it is

The WelfareData Canvas Navigator is an interactive SVG processogram viewer
implemented on top of Canvas 2D. The user loads an SVG whose regions encode a
hierarchy and can navigate through that hierarchy with drill-down, drill-up,
breadcrumb navigation, smooth camera animation, and pixel-perfect hit-testing.

## Data flow diagram

```
SVG File (upload or drag and drop)
  │
  ▼
parseSvg()                              [parser.ts]
  ├─ regions: Map<string, Region>       → navigable region map
  ├─ svgWidth, svgHeight                → canonical SVG dimensions
  └─ suspiciousIds                      → ID audit output (via auditRegions())
  │
  ▼
loadSvgImage()                          [main.ts]
  └─ svgImage: HTMLImageElement         → image used for rasterization
  │
  ▼
buildRasterCache()                      [rasterizer.ts]
  ├─ low: HTMLCanvasElement (1×)        → normal zoom tier
  └─ mid: HTMLCanvasElement (4×)        → near zoom tier
  │
  ▼
hitmap.build()                          [hitmap.ts]
  ├─ computeHash(svgText) → SHA-1 cache key
  ├─ loadFromCache(hash)  → IndexedDB lookup
  │   └─ cache hit: restore layers      → skip rasterization
  ├─ fallbackToRasterize() → 4 HitLayers (Int32Array id grids)
  └─ saveToCache(hash)    → persist to IndexedDB
  │
  ▼
setupCanvas() + setupEvents()           [main.ts, events.ts]
  └─ Canvas fullscreen + handlers
  │
  ▼
╔═══════════════════════════════════════════════════════════════╗
║                    rAF LOOP (60fps)                          ║
║                                                               ║
║  ┌──────────────────────────────────────────────────────┐    ║
║  │  animateCamera(camera, target)        [camera.ts]    │    ║
║  │  └─ camera.setTransform() — lerp or snap             │    ║
║  └──────────────────────────────────────────────────────┘    ║
║                         │                                     ║
║                         ▼                                     ║
║  ┌──────────────────────────────────────────────────────┐    ║
║  │  renderer.render()                    [renderer.ts]  │    ║
║  │  ├─ root mode: drawImage(low or mid)                │    ║
║  │  └─ focused mode: dim + dynamicTile                 │    ║
║  └──────────────────────────────────────────────────────┘    ║
║                         │                                     ║
║                         ▼                                     ║
║  ┌──────────────────────────────────────────────────────┐    ║
║  │  hud.updateIfNeeded()                 [hud.ts]       │    ║
║  │  └─ FPS, level, focus, scale, tier                   │    ║
║  └──────────────────────────────────────────────────────┘    ║
╚═══════════════════════════════════════════════════════════════╝
          │
          │  (user events)
          ▼
  ┌─────────────────────────────────────────────────────────┐
  │  mousemove → hitmap.getRegionAt() → tooltip             │
  │  click     → hitmap.getRegionAt()                       │
  │             ├─ region found      → drillDown()          │
  │             │                      ├─ resolveSkipTarget() before camera target
  │             │                      └─ renderBreadcrumb() → update DOM overlay
  │             └─ empty area        → drillUp() → renderBreadcrumb() │
  │  ESC       → drillUp() → renderBreadcrumb()            │
  │  R         → resetView() → renderBreadcrumb()          │
  │  resize    → resize canvas + needsRedraw                │
  └─────────────────────────────────────────────────────────┘
```

## Modules and responsibilities

| Module | File | Responsibility |
|---|---|---|
| **Parser** | `parser.ts` | Extract regions, dimensions, and hierarchy from the SVG |
| **Audit** | `audit.ts` | Detect suspicious IDs such as background wrappers |
| **Camera** | `camera.ts` | Hold zoom/pan state, dirty flag logic, and interpolation |
| **HitMap** | `hitmap.ts` | Pixel-perfect hit-testing through ID grids and IndexedDB cache |
| **Renderer** | `renderer.ts` | Draw frames to the main canvas |
| **Rasterizer** | `rasterizer.ts` | Pre-rasterize tiers and build dynamic tiles |
| **Navigation** | `navigation.ts` | Drill-down, drill-up, reset, breadcrumb building, and singleton skip resolution |
| **Events** | `events.ts` | Mouse, keyboard, and resize handlers |
| **HUD** | `hud.ts` | Debug overlay with FPS, level, focus, and tier |
| **Types** | `types.ts` | Shared interfaces and constants |
| **Main** | `main.ts` | Runtime orchestration, shared state, breadcrumb rendering, and render loop |

## Main architectural decisions

### 1. Why Canvas 2D instead of DOM SVG?

**Problem**: large processograms can contain thousands of SVG elements. Moving
that structure directly in the DOM is slow because layout, painting, and DOM
hit-testing all stay on the hot path.

**Solution**: rasterize the SVG into bitmap tiers and render through Canvas 2D.
That turns the hot path into fast image drawing plus matrix transforms.

**Trade-off**: individual SVG nodes are no longer styled live with CSS. The
system compensates with dynamic tiles and focused rendering.

### 2. Why color-based hit-testing with precomputed ID grids?

**Problem with bbox-only hit-testing**: bounding boxes are rectangular, but the
real SVG geometry is often irregular.

**Solution**: each region is painted with a unique color during build time, and
the resulting pixels are converted into `Int32Array` ID grids. Runtime lookups
are then direct array reads.

**Trade-off**: the system keeps four extra ID grids in memory, one per level.

### 3. Why use a dirty flag in the camera?

**Problem**: the inverse camera matrix is needed often by hit-testing, but most
frames do not change the camera.

**Solution**: `setTransform()` marks the matrix dirty, and `inverseMatrix`
recomputes only when needed.

**Trade-off**: one extra boolean per camera instance, in exchange for avoiding
unnecessary matrix inversion on static frames.

### 4. Why zero-allocation on the hot path?

**Problem**: `getRegionAt()` and `hasRegionAt()` run on frequent interaction
paths, especially mousemove.

**Solution**: coordinate conversion and hit lookup use only primitive math and
precomputed arrays:

```ts
const m    = camera.inverseMatrix;     // reference, not a copy
const svgX = m.a * canvasX + m.c * canvasY + m.e;  // primitive
const svgY = m.b * canvasX + m.d * canvasY + m.f;  // primitive
const hitX = Math.round(svgX * this.hitScale);     // primitive
const hitY = Math.round(svgY * this.hitScale);     // primitive
const idx  = layer.pixels[hitY * layer.width + hitX]; // direct lookup
```

No objects are allocated and no image reads happen at runtime.

### 5. Why normalize `viewBox`, `width`, and `height`?

**Problem**: different SVG editors export inconsistent coordinate contracts.

**Solution**: parser and hitmap normalize the root SVG contract:
```ts
svgRoot.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
svgRoot.setAttribute('width', String(svgWidth));
svgRoot.setAttribute('height', String(svgHeight));
```

This creates a stable coordinate contract for all downstream modules.

The trade-off is that editor-specific root metadata is normalized away in favor
of a single internal convention.

### 6. Why use `stretchFactor` instead of a fixed scale threshold?

**Problem**: a fixed scale threshold depends on the absolute size of the SVG.

**Solution**: `stretchFactor` measures how much the current tier is being
stretched on screen:

$$
stretchFactor = \frac{svgWidth \times camera.scale}{rasterCache.low.width}
$$

When the factor exceeds `1.5`, the low tier is being stretched enough that the
mid tier should take over.

### 7. Why keep the audit layer separate from the parser?

**Problem**: region extraction and suspicious-ID validation are different
concerns.

**Solution**: `audit.ts` stays independent and receives the parsed region map.

Benefits:

- the audit can evolve independently
- it can be disabled without rewriting parsing
- it remains testable in isolation

### 8. Why persist the ID grids through IndexedDB?

**Problem**: building the hitmap can be expensive for large SVGs.

**Solution**: `build()` follows a cache-first orchestration flow:
1. Compute the SVG SHA-1 hash through `crypto.subtle`
2. Try to load cached layers from IndexedDB (`loadFromCache()`)
3. On cache miss, run full rasterization (`fallbackToRasterize()`)
4. Persist the resulting layers back into IndexedDB (`saveToCache()`)

The `welfaredata-hitmap` IndexedDB store keeps serialized layers keyed by the
SVG SHA-1 hash.

Trade-offs:

- extra local storage usage per SVG
- silent fallback when IndexedDB fails
- SHA-1 is used for change detection, not cryptographic security
- `crypto.subtle` requires a secure context such as HTTPS or localhost

### 9. Why does singleton skip live in the navigation engine?

The SVG keeps the full conceptual hierarchy because that structure is part of
the data model. The navigation engine, however, is responsible for deciding how
to present that hierarchy efficiently.

That leads to a specific rule:

- singleton levels are skipped during navigation when they add no branching
  choice and no meaningful visible change
- those levels are still preserved conceptually through breadcrumb state

This keeps the source SVG semantically complete while removing unnecessary
clicks from the interaction model.

### 10. Why is the breadcrumb reconstructed from `parentId` instead of a separate history?

The breadcrumb is derived dynamically from the region graph through the
`parentId` chain and the current `focusedId`. It is not stored as a second
navigation history.

This decision keeps the breadcrumb consistent with the actual data model even
when the user navigates through drill-down, drill-up, reset, or direct
breadcrumb clicks.

Singleton levels skipped during drill-down remain visible and accessible in the
breadcrumb because that was an explicit product requirement. The UI therefore
preserves the full conceptual path without reintroducing unnecessary clicks in
the primary navigation flow.

## Documentation structure

```
docs/
├── ARCHITECTURE.md          ← this file
├── camera/
│   ├── Camera.md
│   ├── setTransform.md
│   ├── inverseMatrix.md
│   ├── animateCamera.md
│   ├── bboxToCamera.md
│   └── fitToCanvas.md
├── hitmap/
│   ├── HitMap.md
│   ├── build.md
│   ├── fallbackToRasterize.md
│   ├── computeHash.md
│   ├── loadFromCache.md
│   ├── saveToCache.md
│   ├── getRegionAt.md
│   ├── hasRegionAt.md
│   └── indexToColor.md
├── renderer/
│   ├── Renderer.md
│   ├── render.md
│   └── stretchFactor.md
├── audit/
│   └── audit.md
├── parser/
│   ├── parseSvg.md
│   └── Region.md
├── navigation/
│   ├── navigation.md
│   ├── breadcrumb.md
│   ├── resolveSkipTarget.md
│   ├── drillDown.md
│   ├── drillUp.md
│   └── resetView.md
├── rasterizer/
│   ├── buildRasterCache.md
│   └── buildTier.md
├── types/
│   ├── types.md
│   ├── NavState.md
│   └── RasterCache.md
└── main/
    ├── main.md
    ├── handleFile.md
    └── setupCanvas.md
```
