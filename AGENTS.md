# AGENTS.md — WelfareData Canvas Navigator

This file orients AI agents (Claude Code, Codex, Cursor, and similar tools) operating
in this repository. Read it fully before making any changes or suggestions.

---

## Project identity

This repository contains the **WelfareData Canvas Navigator** — a standalone TypeScript
rendering and navigation engine for processogram SVGs. It is a prototype being developed
for integration into the WelfareData-New platform (separate repository).

**What it is not:**
- It is not the WelfareData-New platform (Next.js + Express + MongoDB). That lives at
  `Center-for-Welfare-Metrics/WelfareData-New`.
- It is not a general-purpose SVG viewer.
- It is not a design tool or export pipeline.

---

## Repository structure

```
/
├── README.md                          Entry point — overview, status, commands, links
├── AGENTS.md                          This file
├── index.html                         Vite entry point for the standalone prototype
├── package.json                       Scripts: dev, build, preview. No runtime dependencies.
├── tsconfig.json                      TypeScript strict mode config
│
├── src/                               Canvas Navigator engine (TypeScript)
│   ├── main.ts                        Orchestrator: shared state, rAF loop, breadcrumb rendering
│   ├── parser.ts                      Extracts regions (Map<string, Region>), svgWidth, svgHeight
│   ├── audit.ts                       Detects suspicious IDs (background wrappers, non-standard patterns)
│   ├── camera.ts                      Zoom/pan state, Dirty Flag, cached inverseMatrix, setTransform()
│   ├── hitmap.ts                      4 OffscreenCanvas layers (one per level), Int32Array O(1), IndexedDB
│   ├── rasterizer.ts                  Low tier (1x) and adaptive mid tier (4–8x)
│   ├── renderer.ts                    Draws frames: root mode and focused mode
│   ├── navigation.ts                  Drill-down, drill-up, reset, breadcrumb, singleton skip
│   ├── events.ts                      Mouse, keyboard, resize handlers
│   ├── hud.ts                         Debug overlay (FPS, level, focus, scale, tier)
│   └── types.ts                       Shared interfaces and constants
│
├── tools/                             Standalone tools — no build step required
│   ├── svg-preflight.html             Pre-delivery SVG checker for Jean (open in any browser)
│   └── README.md                      Preflight tool documentation — checks and severity levels
│
├── docs/                              Project documentation
│   ├── documentation-map.md           Hierarchy and authority of all documents — start here
│   ├── svg-preparation-requirements.md  Technical SVG requirements — source of truth for SVG rules
│   ├── architecture-decisions/
│   │   └── adr-001-*.md               Architectural decisions — active, deprecated, pending systems
│   └── handover/
│       └── innovation-ops-brief.md    Onboarding brief for non-technical project members
│
└── public/                            Static assets — SVG test files
```

---

## Commands

```bash
npm install          # Install dev dependencies (typescript, vite — no runtime deps)
npm run dev          # Start Vite dev server at http://localhost:5173
npm run build        # tsc + vite build — production output
npm run preview      # Preview production build locally
```

The engine has **zero runtime dependencies**. It is pure TypeScript using the Canvas 2D API
and browser-native APIs (OffscreenCanvas, IndexedDB, requestAnimationFrame, fetch).

---

## Source of truth hierarchy

When documents conflict, follow this order. Higher number = lower authority.

| Priority | Document | Covers |
|---|---|---|
| 1 (highest) | `docs/svg-preparation-requirements.md` | SVG technical rules for Canvas Navigator compatibility |
| 2 | `docs/architecture-decisions/adr-001-*.md` | Architectural decisions — which systems are active or deprecated |
| 3 | Issue #1 (GitHub) | Phase 1 acceptance criteria, test matrix, SVG status |
| 4 | Processogram Development Manual (Google Doc) | Visual and conceptual design guidance |
| 5 (lowest) | Legacy Technical Documentation (Google Doc) | Historical only — do not use as technical authority |

**`docs/svg-preparation-requirements.md` always wins on SVG technical rules.**
If any other document says something different about SVG structure, naming, or export,
the requirements file takes precedence.

---

## Three-layer rule — critical

This is the most important conceptual boundary in the project. Never conflate these layers:

```
Layer 1 — Visual art
  What Jean draws: colors, fills, strokes, shapes, composition, perspective.
  Owner: Jean (SVG designer).
  Agents must not make decisions about visual art.

Layer 2 — Semantic structure
  The --ps / --lf / --ph / --ci hierarchy and ID naming.
  Owner: Wladimir / Welfare Footprint Institute (WFI).
  Agents must not decide which elements get which semantic level,
  what a Life-Fate represents biologically, or how phases are grouped.

Layer 3 — Interaction geometry
  What the engine uses for hit-testing: group boundaries, document order,
  transform absence, pixel coverage.
  Owner: Gabriel / motor code.
  Agents can review and suggest fixes at this layer only.
```

**Practical consequence:** if a `--ci` element has poor clickability because it is thin
or small, the correct solutions are:
- Increase the visible stroke width (Layer 1 change — Jean's decision)
- Restructure the group so all visual geometry is inside it (Layer 1 + Layer 3)
- In a future motor update: add invisible hit-area geometry (Layer 3 — not yet implemented)

**What is never correct:** adding artificial fills or invisible shapes to satisfy the
engine without Jean's explicit involvement. This conflates Layer 1 and Layer 3 and
makes future theme conversion (light/dark) significantly harder.

---

## SVG conventions

These rules are enforced by the preflight tool (`tools/svg-preflight.html`) and
documented in `docs/svg-preparation-requirements.md`. Agents reviewing SVG files
or documentation must know them.

### ID naming

| Rule | Correct | Incorrect |
|---|---|---|
| Semantic suffix | `shed_a--ps`, `room_01--lf`, `pen_01--ph`, `hen--ci` | `shed_a_ps`, `room__lf` |
| Numeric suffix | `pig--ci-01`, `hen--ci-02` | `pig--ci_01` — underscore before number is invisible to the motor |
| Characters | Letters, numbers, hyphens, underscores only | Spaces, dots, special characters |
| Uniqueness | Every ID unique across the entire SVG | Duplicate IDs — breaks hit-testing |

**The underscore numeric suffix (`--ci_01`) is the most common and most damaging error.**
The motor regex only recognizes the hyphen format. IDs with underscore suffixes are
silently ignored — they load without error but are never clickable.

### Element type

Navigable IDs must be on `<g>` elements only.

```svg
<!-- Correct -->
<g id="animal--ci-01">
  <path fill="#d9d9d9" d="..." />
</g>

<!-- Incorrect — ID on a shape, not a group -->
<path id="animal--ci-01" fill="#d9d9d9" d="..." />
```

### Dimensions

```svg
<!-- Correct — plain pixel numbers -->
<svg width="1718" height="971" viewBox="0 0 1718 971">

<!-- Incorrect — unit suffix breaks normalization -->
<svg width="153mm" height="87mm" viewBox="0 0 581 331">
```

The motor normalizes `width`, `height`, and `viewBox` unconditionally before hit-map
construction. Non-pixel units cause coordinate mismatches between the visual render
and the hit layers.

### Hierarchy nesting

```svg
<!-- Correct — child elements nested inside parent groups -->
<g id="shed_a--ps">
  <g id="room_01--lf">
    <g id="pen_01--ph">
      <g id="animal_01--ci">
        <path ... />
      </g>
    </g>
  </g>
</g>

<!-- Incorrect — flat structure, hierarchy not reflected in nesting -->
<g id="shed_a--ps"> ... </g>
<g id="room_01--lf"> ... </g>
<g id="pen_01--ph"> ... </g>
<g id="animal_01--ci"> ... </g>
```

### Transforms

Transforms on semantic groups (`--ps`, `--lf`, `--ph`, `--ci`) are **prohibited**.
They break coordinate calculations in the hit-map pipeline.

```svg
<!-- Incorrect -->
<g id="sow--lf" transform="translate(120, 45)"> ... </g>

<!-- Correct — remove transform, adjust coordinates in child paths instead -->
<g id="sow--lf"> ... </g>
```

### Document order and hit-testing priority

The engine uses color-based pixel hit-testing. Each pixel belongs to exactly one region —
the one whose color was painted last during hit-map construction. Document order determines
priority: **elements that appear later in the SVG file overwrite earlier ones in the hit-map.**

If an animal `--ci` is visually on top of a pen `--ci`, the animal's group must appear
**after** the pen's group in SVG document order within the same `--ph`.

### Reference SVGs

- **Hatchery v30** — structural reference. Zero preflight errors. Correct naming throughout.
  Use as template for ID conventions and export settings.
- **Cattle v20** — navigation behavior reference. Validated drill-down, singleton skip,
  breadcrumb. Use to verify navigation correctness.

---

## Motor architecture — key decisions

Agents working on `src/` must understand these decisions before suggesting changes.

### Hit-map pipeline (`hitmap.ts`)

- 4 separate `OffscreenCanvas` layers — one per hierarchy level (ps=0, lf=1, ph=2, ci=3)
- Each layer paints only regions at its level with unique RGB colors
- `Int32Array` stores colorIndex → regionId mapping for O(1) lookup
- `shape-rendering: crispEdges !important` injected via `<style>` tag — anti-aliasing
  on hit canvas boundaries creates interpolated pixels that decode to wrong region IDs
- All `<style>` tags removed from the SVG before hit-map construction to prevent
  Inkscape-exported CSS from overriding the injected fill colors
- Hit canvases destroyed after `Int32Array` extraction to free VRAM
- SHA-1 hash of SVG text used as IndexedDB cache key — rebuilds only when SVG changes

### Camera system (`camera.ts`)

- `setTransform()` is the sole atomic mutation point for all camera state
- `needsRedraw` Dirty Flag prevents redundant draws — renderer only fires when flag is set
- `inverseMatrix` getter is cached and invalidated only on `setTransform()`
- All matrix math is zero-allocation (no object creation per frame)

### Tier selection (`rasterizer.ts`, `renderer.ts`)

- **Low tier:** 1x rasterization of full SVG — used at root level and for background rendering
- **Mid tier:** adaptive multiplier `min(window.innerWidth / smallestValidCiBbox, 8)`,
  clamped 4–8x — used when zoomed into a focused element
- `stretchFactor = (svgWidth * camera.scale) / rasterCache.low.width`
- Threshold 1.5: if `stretchFactor > 1.5`, switch to mid tier
- The `smallestValidCiBbox` threshold is 20px — `--ci` elements smaller than this are
  excluded from the multiplier calculation to prevent absurdly large mid-tier canvases

### Navigation (`navigation.ts`)

- Singleton level skip: levels with exactly one child are skipped automatically in the
  drill-down flow. The skipped level remains accessible via breadcrumb.
- Breadcrumb preserves the full path including skipped singleton levels
- `drillDown()` calls `resolveSkipTarget()` before setting camera target
- `drillUp()` pops the breadcrumb stack and resets camera to parent bounds

### Audit (`audit.ts`)

- Separate module — warns about suspicious IDs but never silently ignores them
- `SUSPICIOUS_PATTERNS` regex array — detects background wrappers, non-standard suffixes,
  IDs that could confuse the motor
- Audit warnings are logged to console but do not block navigation

---

## What agents can do

Agents are appropriate for the following tasks in this repository:

**Documentation review:**
- Check consistency between `docs/svg-preparation-requirements.md`, `tools/README.md`,
  `AGENTS.md`, and `README.md` — terminology, rule descriptions, examples
- Detect contradictions between documents (e.g. a rule in one file that conflicts with
  another)
- Verify that preflight check descriptions in `tools/README.md` match the actual checks
  implemented in `tools/svg-preflight.html`
- Standardize terminology: "Life-Fate" (with hyphen), `--ci` (two hyphens), not "Life Fate",
  not "ci" without hyphens
- Flag uses of deprecated terms or patterns from legacy documentation

**Code review (`src/`):**
- Verify that implementation matches documented decisions in ADR-001 and this file
- Check that new code follows existing patterns (Dirty Flag, zero-allocation math,
  OffscreenCanvas usage, IndexedDB key structure)
- Identify regressions against the documented fixes (Fix 1, Fix 2a)
- Verify that `crispEdges` injection and `<style>` removal are present in `hitmap.ts`

**SVG file review (`public/`):**
- Check ID naming conventions (semantic suffix, hyphen before numeric suffix)
- Check for navigable IDs on non-`<g>` elements
- Check for `transform` attributes on semantic groups
- Verify `width`, `height`, `viewBox` consistency
- These checks mirror what `tools/svg-preflight.html` does — the preflight is the
  authoritative checker; agent review is supplementary

**Preflight tool (`tools/svg-preflight.html`):**
- Verify that all checks documented in `tools/README.md` are implemented in the HTML
- Check that check severity levels (error/warning/pass/info) match documentation
- Verify that warning messages do not suggest techniques prohibited by
  `docs/svg-preparation-requirements.md` (e.g. transparent fills, invisible hit-areas)

---

## What agents must NOT do

These boundaries are non-negotiable. When in doubt, stop and ask.

### Semantic decisions about processograms

Do not decide:
- Whether a specific animal should have its own `--ci` ID or be part of a group
- How many `--lf` groups a processogram should have
- What a Life-Fate, Phase, or Component represents biologically or scientifically
- Whether a scene is complex enough to warrant individual animal `--ci` elements
- How to name a new processogram element

These are decisions owned by Wladimir and the Welfare Footprint Institute. They depend
on the WFF (Welfare Footprint Framework) — a scientific framework that agents do not
have context for.

### Visual art decisions

Do not decide:
- Colors, fills, strokes, or shapes in SVG files
- Whether a visual element should be redesigned for better clickability
- How elements should be composed or arranged
- Whether a design change is "minor enough" to make without Jean's involvement

### Invisible hit-areas

Do not suggest adding `fill: none`, `opacity: 0`, or any invisible geometry as a
hit-area solution. This technique is not supported by the current motor — the hitmap
pipeline rewrites all SVG styles before rasterizing, making invisible shapes
unpredictable. It is planned for a future motor update. Until then, the documented
alternatives are: increase visible stroke width, or restructure the group so all
visual geometry is inside the `--ci` group.

### Architecture changes without consultation

Do not propose changes to:
- The 4-layer hit-map structure
- The Dirty Flag camera pattern
- The IndexedDB caching strategy
- The rAF loop structure
- The tier selection thresholds

These decisions are documented in ADR-001 with explicit rationale. Changes require
discussion with Gabriel and Wladimir.

### Bypassing the preflight

Do not approve or accept SVG files that have unresolved `ERROR` results from the
preflight tool. Do not suggest that preflight errors are acceptable because "the
motor handles it" — the motor does not compensate for structural SVG errors.

---

## People and contacts

| Person | Role | What they own |
|---|---|---|
| Gabriel | Developer | Engine code, integration, documentation |
| Jean | SVG Designer | Visual art (Layer 1), SVG export, preflight compliance |
| Wladimir | Product owner (WFI) | Semantic structure (Layer 2), architectural approvals, product decisions |
| Herikle | Legacy system | One pending action: disconnect `app.welfaredata.org` from Vercel |

**Communication rules:**
- Technical decisions → always in writing, referenced in issues or docs
- Messages for Jean → WhatsApp, always English + Portuguese (EN + PT-BR)
- Messages for Wladimir → Upwork or email, formal, with links to issues/docs

---

## Current phase and next milestone

- **Current:** Phase 1 — validating Canvas Navigator against priority SVGs
- **Validated:** Cattle v20 ✅, Hatchery v30 ✅
- **Pending Jean's fixes:** Laying Hens v27 ⚠️, Pig v20 ❌, Broilers v14 ⚠️
- **Next:** Integration spike into WelfareData-New — week of Jun 9
  - Canvas Navigator loaded inside WelfareData-New
  - Node selection with breadcrumb and hierarchy preserved
  - Selected node ID/name exposed to React interface via Custom Events
  - Base SVGs: Cattle v20 + Hatchery v30

See [Issue #1](https://github.com/Center-for-Welfare-Metrics/welfaredata-processogram-tools/issues/1)
for the full test matrix, video evidence, and blocker tracking.

---

## Live prototype

[https://welfaredata-prototype.ulsyy6.easypanel.host/](https://welfaredata-prototype.ulsyy6.easypanel.host/)

Use this to verify navigation behavior before and after making changes to `src/`.
Drop a validated SVG (Cattle v20 or Hatchery v30) to test drill-down, breadcrumb,
singleton skip, and tier switching.
