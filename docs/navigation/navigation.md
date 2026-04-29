# Navigation — Hierarchical navigation model

## What it does

The `navigation.ts` module implements the navigation state machine of the canvas
viewer. It handles drill-down, drill-up, reset, breadcrumb construction, and
the singleton-skip resolution that decides which region should actually become
the next focus.

## Why it exists

The SVG stores the full conceptual hierarchy of the processogram, but the UI
still needs a practical navigation model. This module centralizes that model so
that state transitions, camera targets, breadcrumb data, and singleton-skip
behavior all stay consistent.

## The depth model — 4 hierarchy levels

```
Level -1: ROOT (overview, no focused region)
Level  0: ps  (Production System)
Level  1: lf  (Life Fate)
Level  2: ph  (Phase)
Level  3: ci  (Circumstance)
```

The navigation model works like this:

- **Drill-down** moves deeper into the hierarchy
- **Drill-up** restores the previous visited visual state
- **Reset** returns directly to ROOT

When a clicked region leads into a chain of singleton levels, drill-down can
skip intermediate levels and land directly on the first useful branching or
leaf target.

## Navigation flow

1. The click handler passes a `regionId` to `drillDown()`.
2. `drillDown()` calls `resolveSkipTarget()` before mutating any state.
3. The helper returns:
   - `finalId`: the effective navigation target
   - `skipped`: the singleton levels crossed automatically
4. `drillDown()` pushes one history snapshot.
5. `NavState` is updated with the resolved target.
6. `nav.skippedLevels` is stored for breadcrumb rendering.
7. The target camera is computed from the resolved region bbox.

## NavState

```ts
export interface NavState {
  level: number;
  focusedId: string | null;
  history: NavHistoryEntry[];
  skippedLevels: string[];
}
```

| Field | ROOT | Drill-down without skip | Drill-down with skip |
|---|---|---|---|
| `level` | `-1` | next real child level | resolved final level |
| `focusedId` | `null` | clicked child ID | resolved final ID |
| `history` | `[]` | one pushed snapshot | one pushed snapshot |
| `skippedLevels` | `[]` | `[]` | ordered skipped chain |

## Relationship to camera and target

Navigation does not animate the camera directly. Instead it:

1. Computes the next camera via `bboxToCamera()`
2. Writes that result into `target` with `target.setTransform()`
3. Lets the `requestAnimationFrame` loop in `main.ts` move `camera` toward
   `target` through `animateCamera()`

This keeps navigation decisions separate from animation mechanics.

## Public exports

| Function | Description |
|---|---|
| `drillDown()` | Resolves singleton skip, updates navigation state, and computes the next target camera |
| `drillUp()` | Restores the previous visited visual state from history |
| `resetView()` | Returns to ROOT and computes a full-document camera |
| `buildBreadcrumb()` | Reconstructs the visible breadcrumb path, marks skipped items, and supports the breadcrumb overlay documented in [breadcrumb.md](breadcrumb.md) |

## Internal helper

| Helper | Description |
|---|---|
| `resolveSkipTarget()` | Recursively resolves the effective drill-down target when a region has exactly one direct child. See [resolveSkipTarget.md](resolveSkipTarget.md). |

## Dependencies

| Direction | Module | Relationship |
|---|---|---|
| Imports | `types.ts` | Uses `NavState`, `Region`, `BreadcrumbItem`, and `Camera`-related shapes |
| Imports | `camera.ts` | Uses `bboxToCamera()` to compute the next camera target |
| Called by | `main.ts` | Used through `onDrillDown`, `onDrillUp`, `onReset`, and breadcrumb rendering |
| Reached from | `events.ts` | Triggered indirectly through the callbacks registered by `setupEvents()` |

## Architectural decisions

### Why is `NavState` mutated in place?

`NavState` is passed by reference and updated directly inside navigation
functions. That keeps the runtime simple and avoids reducer-style state churn
inside a synchronous rendering loop.

### Why is history a stack?

History models visited visual states, not conceptual nodes. A stack maps
directly to that behavior: `drillDown()` pushes one snapshot, and `drillUp()`
restores the latest one with `pop()`.

### Why does singleton skip belong in navigation instead of the parser?

The parser should describe the SVG as it is. The SVG keeps the full conceptual
hierarchy. The navigation layer decides how to present that hierarchy
efficiently. That is why singleton levels are skipped during navigation but can
still be preserved in the breadcrumb.

### Why is the previous camera stored as a snapshot?

```ts
nav.history.push({
  id: nav.focusedId,
  level: nav.level,
  camera: { scale: camera.scale, translateX: camera.translateX, translateY: camera.translateY }
});
```

The snapshot preserves the exact pan and zoom state that the user saw before
the transition. When `drillUp()` restores that snapshot, the viewer returns to
the same visual context instead of recalculating an approximate position.
