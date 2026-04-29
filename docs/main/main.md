# main.ts — Central orchestration

## What it does

`main.ts` is the entry point of the prototype. It owns the module-scoped state,
instantiates the main runtime objects, wires event callbacks to navigation,
controls breadcrumb rendering, and runs the `requestAnimationFrame` loop.

## Why it exists

The viewer needs one orchestration layer that can connect parser output,
navigation state, hit-testing, camera animation, dynamic tiles, and UI updates
without duplicating state ownership across modules.

## Initialization order

Initialization happens in two phases.

### Phase 1 — Static setup on page load

```ts
let nav: NavState = { level: -1, focusedId: null, history: [], skippedLevels: [] };
let camera = new Camera();
let target = new Camera();
let rasterCache: RasterCache = { low: null, mid: null };
const dynamicCache = new Map<string, DynamicTile>();
let regions = new Map<string, Region>();
const skippedLevelsByFocusId = new Map<string, string[]>();
```

### Phase 2 — Dynamic setup after the user loads an SVG

This happens inside `handleFile()`.

## Instantiated modules

| Module | Instance | When | Type |
|---|---|---|---|
| `Camera` | `camera` | Static | Class |
| `Camera` | `target` | Static | Class |
| `Renderer` | `renderer` | In `setupCanvas()` | Class |
| `HitMap` | `hitmap` | In `handleFile()` | Class |
| `Hud` | `hud` | In `handleFile()` | Class |

## How the render loop starts

```ts
lastFrameTime = performance.now();
renderLoop(lastFrameTime);
```

The loop then runs continuously through `requestAnimationFrame()`.

## Core module-scoped variables

| Variable | Type | Why it exists |
|---|---|---|
| `nav` | `NavState` | Shared navigation state for events, renderer, HUD, and breadcrumb logic |
| `camera` | `Camera` | Live mutable camera state |
| `target` | `Camera` | Animation target written by navigation |
| `rasterCache` | `RasterCache` | Low and mid raster tiers used by the renderer |
| `dynamicCache` | `Map<string, DynamicTile>` | On-demand tile cache keyed by region ID |
| `regions` | `Map<string, Region>` | Parsed region graph consumed across the runtime |
| `skippedLevelsByFocusId` | `Map<string, string[]>` | Remembers breadcrumb skip metadata for previously focused regions |
| `needsRedraw` | `boolean` | Dirty flag that prevents redundant rendering |
| `isAnimating` | `boolean` | Controls whether the camera lerp runs |

These variables are global only inside the module. `main.ts` owns them because
it is the integration point for the rest of the system.

## Breadcrumb and singleton skip state

Singleton skip is not handled only at the moment of drill-down. `main.ts`
maintains extra state so the breadcrumb can remain consistent when the user
navigates back or clicks breadcrumb items.

### `rememberSkippedLevels()`

Stores the current `nav.skippedLevels` under the current `focusedId`.

### `restoreSkippedLevels()`

Restores skip metadata for the newly focused region after a `drillUp()` or
breadcrumb navigation step.

- If the new focus is ROOT, `nav.skippedLevels` becomes `[]`
- If the focus has remembered skip metadata, that chain is restored

### `renderBreadcrumb()`

Uses `buildBreadcrumb(nav.focusedId, regions, nav.skippedLevels)` to rebuild
the visible breadcrumb path and mark skipped conceptual levels.

## Navigation callbacks

`main.ts` bridges events and navigation through callbacks.

```ts
function onDrillDown(regionId: string): void {
  drillDown(regionId, nav, regions, camera, target,
    window.innerWidth, window.innerHeight, onTileNeeded);
  rememberSkippedLevels();
  isAnimating = true;
  needsRedraw = true;
  renderBreadcrumb();
}

function onDrillUp(): void {
  drillUp(nav, target);
  restoreSkippedLevels();
  isAnimating = true;
  needsRedraw = true;
  renderBreadcrumb();
}

function onReset(): void {
  resetView(nav, target, svgWidth, svgHeight,
    window.innerWidth, window.innerHeight);
  nav.skippedLevels = [];
  isAnimating = true;
  needsRedraw = true;
  renderBreadcrumb();
}
```

This is where the runtime behavior of `skippedLevels` is completed:

- after `drillDown()`, skipped levels are remembered for the new focus
- after `drillUp()`, skipped levels are restored for the restored focus
- after reset, skipped levels are explicitly cleared

## Render loop behavior

The render loop has three main jobs:

1. track timing for the HUD
2. animate `camera` toward `target` when needed
3. redraw only when the dirty flag requires it

That keeps interaction responsive while avoiding unnecessary work during idle
frames.

## Dependencies

| Direction | Module | Relationship |
|---|---|---|
| Imports | `parser.ts` | Uses `parseSvg()` during file loading |
| Imports | `rasterizer.ts` | Uses `buildRasterCache()` and `buildDynamicTile()` |
| Imports | `camera.ts` | Uses `Camera`, `animateCamera()`, `bboxToCamera()`, and `fitToCanvas()` |
| Imports | `hitmap.ts` | Uses `HitMap` |
| Imports | `navigation.ts` | Uses `drillDown()`, `drillUp()`, `resetView()`, and `buildBreadcrumb()` |
| Imports | `renderer.ts` | Uses `Renderer` |
| Imports | `hud.ts` | Uses `Hud` |
| Imports | `events.ts` | Uses `setupEvents()` |
