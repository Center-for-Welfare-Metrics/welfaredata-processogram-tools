# WelfareData Canvas Navigator

> Interactive navigation engine for WelfareData processograms — Canvas 2D rendering, O(1) hit-testing, 60fps rAF loop.

---

## What is this

The **WelfareData Canvas Navigator** is a standalone TypeScript rendering engine that powers interactive navigation of processogram SVGs on [welfaredata.org](https://welfaredata.org).

**Processograms** are scientific diagrams produced by the [Welfare Footprint Institute](https://www.welfarefootprint.org) that map the living conditions of farmed animals across production systems. Each processogram is organized in a four-level semantic hierarchy:

```
Production System (--ps)
└── Life-Fate (--lf)
    └── Phase (--ph)
        └── Component / Indicator (--ci)
```

The `--ci` level is the leaf-level clickable object — the most granular navigable unit. A `--ci` can represent a physical component (cage, drinker, conveyor), a condition indicator, an individually visible animal, a representative group of animals, or an action scene — depending on the processogram context.

---

## Why it exists

The legacy navigation system (built by Herikle, running on Vercel) uses DOM SVG rendering via `react-inlinesvg` + GSAP + `element.closest()`. On complex processograms with hundreds of elements, this causes **Interaction to Next Paint (INP) of ~800ms** — unacceptable for a research tool where users frequently navigate deep hierarchies.

The Canvas Navigator replaces this with:

- **Canvas 2D rendering** — the SVG is never injected into the DOM. It is rasterized via `OffscreenCanvas` and drawn with `drawImage()`.
- **Color-based hit-testing** — four invisible Int32Array layers (one per hierarchy level) allow O(1) pixel lookup with no DOM traversal.
- **rAF loop at 60fps** — camera with Dirty Flag pattern; only redraws when state changes.
- **IndexedDB cache** — hit-map is built once per SVG (keyed by SHA-1), then cached locally. Subsequent visits load instantly. Note: initial hitmap construction for large or complex SVGs may take up to 500ms on first load — this cost is amortized by the cache on all subsequent visits.
- **Zero DOM SVG in the runtime navigation and rendering path** — no `querySelectorAll`, no `closest()`, no `getBBox()`, no `viewBox` attribute manipulation during navigation. DOM APIs are used only during SVG parsing and preprocessing.

---

## Current status — Phase 1 (June 2026)

Phase 1 validates that the Canvas Navigator correctly loads, renders and navigates the priority WelfareData SVGs without requiring ad hoc structural changes to the SVG files.

| SVG | Version | Status | Notes |
|---|---|---|---|
| Cattle | v20 | ✅ PASS | Navigation behavior reference |
| Hatchery | v30 | ✅ PASS | Structural reference — cleanest SVG |
| Laying Hens | v27 | ⚠️ PARTIAL | Pending Jean's fix: width/height in mm, 1 ID on `<path>` |
| Pig | v20 | ❌ FAIL | Pending Jean's fix: 271 underscore suffixes, 10 IDs on `<path>`/`<rect>`, transforms on `--lf` groups |
| Broilers | v14 | ⚠️ PARTIAL | Pending Jean's fix: missing width/height, 89 underscore suffixes, `--ps` on root `<svg>`, 8 duration labels as `--ci` |

**Current milestone:** Stabilization and legacy motor removal — week of Jun 23. Integration spike delivered week of Jun 16. See [Issue #1](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/1) for full state and video evidence.

---

## Architecture overview

```
src/
├── main.ts          Orchestrator — shared state, rAF loop, breadcrumb rendering
├── parser.ts        Extracts regions (Map<string, Region>), svgWidth, svgHeight from SVG text
├── audit.ts         Detects suspicious IDs (background wrappers, non-standard patterns)
├── camera.ts        Zoom/pan state, Dirty Flag, cached inverseMatrix, atomic setTransform()
├── hitmap.ts        Builds 4 OffscreenCanvas layers (one per level), Int32Array O(1) lookup, IndexedDB cache
├── rasterizer.ts    Pre-rasterizes low tier (1x) and adaptive mid tier (4–8x based on smallest --ci)
├── renderer.ts      Draws frames: root mode (low/mid tier) and focused mode (dim + dynamic tile)
├── navigation.ts    Drill-down, drill-up, reset, breadcrumb, singleton level skip
├── events.ts        Mouse, keyboard, resize handlers
├── hud.ts           Debug overlay (FPS, level, focus, scale, tier)
└── types.ts         Shared interfaces and constants
```

### Key architectural decisions

| Decision | Rationale |
|---|---|
| Canvas 2D over DOM SVG | DOM SVG INP ~800ms on large processograms. Canvas rendering is GPU-accelerated and decoupled from DOM layout. |
| 4 separate hit layers | One Int32Array per hierarchy level prevents pixel overwrites between levels. Each layer only paints regions at its level. |
| Adaptive mid tier | Mid tier multiplier calculated as `min(window.innerWidth / smallestCiBbox, 8)`, clamped 4–8x. Avoids fixed-scale artifacts on SVGs with very small `--ci` elements. |
| Dirty Flag on camera | `setTransform()` is the sole atomic mutation point. `needsRedraw` prevents redundant `drawImage()` calls per frame. |
| IndexedDB by SHA-1 | Hit-map construction is expensive (~500ms for large SVGs). Caching by content hash means second visit is instant. |
| Base64 export (not binary) | Prevents CDP out-of-memory errors when Puppeteer transfers large ArrayBuffers via the DevTools protocol. |

Full architectural rationale is documented in [ADR-001](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/blob/main/docs/architecture-decisions/adr-001-current-system-direction.md).

---

## Quick start

### Requirements

- Node.js (any modern LTS)
- A modern browser (Chrome, Firefox, or Safari)
- No runtime dependencies — the engine is pure TypeScript + Canvas 2D API

### Commands

```bash
# Install dev dependencies
npm install

# Start development server (Vite, hot reload)
npm run dev

# Production build (tsc + vite build)
npm run build

# Preview production build locally
npm run preview
```

The dev server opens at `http://localhost:5173` by default. Drop an SVG file into the viewer to test navigation.

---

## SVG preflight tool

Before delivering any processogram SVG, run it through the preflight checker.

```
tools/svg-preflight.html
```

1. Open `tools/svg-preflight.html` in any browser (double-click the file — no server needed).
2. Drag the SVG onto the drop zone, or click to browse.
3. The tool runs 15 checks automatically and displays a report.
4. Click **Download report (.txt)** to save results.

**Delivery rule (mandatory from June 2026):**
- `ERROR` — must be fixed before delivery. These break the Canvas Navigator.
- `WARNING` — may deliver, but explain in your message whether each warning is intentional or pending fix.

See [tools/README.md](./tools/README.md) for the full list of checks and severity definitions.

---

## SVG requirements

SVG files must follow the technical requirements in [`docs/svg-preparation-requirements.md`](./docs/svg-preparation-requirements.md) to work correctly with the Canvas Navigator.

Critical rules at a glance:

| Rule | Correct | Incorrect |
|---|---|---|
| Navigable IDs | `shed_a--ps`, `room_01--lf`, `hen--ci-01` | `shed_a_ps`, `room_01__lf` |
| Numeric suffix | `pig--ci-01`, `hen--ci-02` | `pig--ci_01` (underscore — motor ignores it) |
| Width/height | `width="1718"` (plain pixels) | `width="153mm"` (units break normalization) |
| Element type | `<g id="animal--ci-01">` | `<path id="animal--ci-01">` (must be `<g>`) |
| Transforms | Not allowed on semantic groups | `<g id="sow--lf" transform="...">` |
| Hierarchy | `--ci` nested inside `--ph` inside `--lf` inside `--ps` | Flat or inverted nesting |

**Structural reference:** Hatchery v30 — zero preflight errors, correct naming throughout.
**Navigation reference:** Cattle v20 — validated drill-down, singleton skip, breadcrumb.

---

## Engine fixes applied (Phase 1)

| Fix | Problem | Status |
|---|---|---|
| Fix 1 — SVG loading normalization | SVGs with `viewBox` but no explicit `width`/`height` loaded at browser default (300×150px). Now normalized before Blob creation. | ✅ Resolved |
| Fix 2a — Adaptive mid tier | Fixed 4x multiplier replaced by `min(window.innerWidth / smallestCiBbox, 8)` clamped 4–8x. | ✅ Resolved |
| Fix 2b — On-demand rasterization (ViewBox Shifting) | Attempted to rasterize focused elements at vector quality by shifting `viewBox`. Discarded — SVG renders all elements within viewBox coordinates, not only the focused one. Neighboring elements appeared in the tile. Isolating one element would require hiding N–1 elements (~50–200ms delay). | ❌ Discarded |

---

## Features not in Phase 1

| Feature | Status | Notes |
|---|---|---|
| Hover highlight | Not implemented | Canvas 2D structural limitation. Four approaches tested (Path2D clip, Blob cache CSS, SVG clone, bbox compositing) — all cause visible rectangles, OOM, or first-hover delay. Nice-to-have post-Phase 1. |
| AI descriptions | Partially integrated | The SidePanel already fetches and displays descriptions stored in the database per element ID. Generating new descriptions via Gemini 2.5-Flash requires a new API key — pending Wladimir. Not a blocker for navigation. |
| Light/dark theming | Roadmap | See [Issue #3](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/3). Three-layer principle must be respected: visual art, semantic structure, and interaction geometry are separate concerns. |

---

## Documentation

| Document | Purpose | When to use |
|---|---|---|
| [docs/documentation-map.md](./docs/documentation-map.md) | Hierarchy and authority of all project documents | Start here when unsure which document to consult |
| [docs/svg-preparation-requirements.md](./docs/svg-preparation-requirements.md) | Technical SVG requirements for Canvas Navigator compatibility | Preparing, revising, or exporting any processogram SVG |
| [docs/architecture-decisions/adr-001-*](./docs/architecture-decisions/) | Architectural decisions — which systems are active, deprecated, or pending | Understanding why a technical decision was made |
| [docs/handover/innovation-ops-brief.md](./docs/handover/innovation-ops-brief.md) | Project handover brief — history, state, responsibilities, milestones | Onboarding a new team member |
| [AGENTS.md](./AGENTS.md) | AI agent orientation — what agents can and cannot do | Running AI-assisted reviews or edits in this repository |
| [Issue #1 — Phase 1 Validation](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/1) | Test matrix, video evidence, blockers, SVG status | Tracking Phase 1 results and blockers |
| [Issue #2 — Post-Phase-1 UX](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/2) | Post-Phase-1 roadmap — configurable parameters, UX layer | Planning future UX features |
| [Issue #3 — Themeable SVG](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/3) | Light/dark mode pipeline and SVG theming strategy | Planning theme support |
| [tools/README.md](./tools/README.md) | SVG preflight tool — checks, severity levels, usage | Understanding what the preflight checks |

---

## Live prototype

[https://welfaredata-prototype.ulsyy6.easypanel.host/](https://welfaredata-prototype.ulsyy6.easypanel.host/)

The prototype runs the Canvas Navigator standalone with the validated SVGs. Use it to verify navigation behavior, breadcrumb, singleton skip, and tier switching before integration.

---

## Integration

The Canvas Navigator is being integrated into **WelfareData-New** — the full platform (Next.js 16 + React 19 + Express 5 + MongoDB + Google Cloud Storage + Gemini 2.5-Flash).

**Repository:** [Center-for-Welfare-Metrics/WelfareData-New](https://github.com/Center-for-Welfare-Metrics/WelfareData-New)

**Integration delivered — week of Jun 16:**
- Canvas Navigator ported to `frontend/src/lib/canvas-navigator/`
- React adapter hook at `frontend/src/components/processogram/navigator/useCanvasNavigator.ts`
- Node selection, drill-down, drill-up, breadcrumb, and Home all working
- Selected node ID and name exposed to the React interface via `onNodeSelected` callback
- SidePanel displays motor label and fetches element descriptions by ID
- Canvas reframes correctly when SidePanel opens and closes

**Stabilization (Jun 23) — completed:**
- ✅ Legacy motor files and packages removed (Commit 2)
- ✅ Diagnostic console.log statements removed
- ✅ Camera animation speed centralized in `CAMERA_CONFIG.lerpFactor`
- ✅ Log-lerp applied for perceptually symmetric zoom — zoom-in and zoom-out now feel equivalent
- ✅ Camera drift fixed — scale and translation advance the same fractional progress per frame

**Pending Wladimir's input:**
- ⏳ Final lerpFactor value — three speed options sent for comparison (0.08 / 0.05 / 0.01)

**Post-stabilization:**
- AI-generated descriptions — requires Gemini API Key; Wladimir generates when ready
- Full side panel, admin features, visual parameters — post-spike scope
- Hover highlight — Canvas 2D structural limitation, post-Phase 1

---

## People

| Person | Role | Responsibility |
|---|---|---|
| Gabriel | Developer (freelance) | Canvas Navigator engine, WelfareData-New integration, documentation, coordination with Jean |
| Jean | SVG Designer | Processogram SVG creation and correction. Uses Inkscape and Adobe Illustrator. |
| Wladimir | Product owner (WFI) | Architectural and product decisions, Gemini API Key, coordination with Herikle for domain handoff |
| Herikle | Legacy system developer | One pending action: disconnect `app.welfaredata.org` from his Vercel account when the new system is ready |

---

## License

Private — Welfare Footprint Institute. Not open source.
