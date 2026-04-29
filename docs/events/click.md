# events — click handler

## What it does

The `click` handler translates a canvas click into a navigation action:

- **Click on a valid region** (`nav.level < 3`) → `onDrillDown(regionId)`
- **Click on empty space** → `onDrillUp()`
- **Click at maximum depth** (`ci`) → no drill-down

## Why it exists

Click is the main entry point into the hierarchical navigation model. The event
handler is intentionally small: it decides whether a region was clicked and
delegates the actual navigation transition to the callbacks owned by `main.ts`.

## How it works

```text
Canvas click
  │
  ├─ getBoundingClientRect() -> CSS-space canvas coordinates
  ├─ hitmap.getRegionAt(canvasX, canvasY, camera, nav)
  │    └─ returns regionId | null
  │
  ├─ if regionId exists and nav.level < 3
  │    └─ onDrillDown(regionId)
  │          └─ drillDown() resolves singleton skip internally
  │
  └─ if regionId is null
       ├─ hitmap.hasRegionAt(...)
       └─ if false
            └─ onDrillUp()
```

### Coordinate handling

The handler converts `clientX` and `clientY` into canvas CSS coordinates using
`getBoundingClientRect()`. The hitmap then converts those values into world
coordinates through the inverse camera transform.

### Maximum-depth guard

The condition `nav.level < 3` prevents drill-down beyond `ci`, the deepest
navigation level.

### Singleton skip behavior

The click handler does **not** decide which levels are skipped. It only forwards
the clicked `regionId` to `onDrillDown()`. The singleton resolution happens
inside `navigation.ts`, where `drillDown()` calls `resolveSkipTarget()` before
mutating any state.

### Ambiguous click guard

If `getRegionAt()` returns `null` but `hasRegionAt()` returns `true`, the click
landed on a pixel where something exists visually but no exact region can be
resolved. In that case the handler does not trigger `drillUp()`, preventing
accidental navigation out of the current level.

## Source shape

```ts
canvas.addEventListener('click', (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;
  const regionId = hitmap.getRegionAt(canvasX, canvasY, camera, nav);

  if (regionId && nav.level < 3) {
    onDrillDown(regionId);
  } else if (!regionId) {
    const hasAny = hitmap.hasRegionAt(canvasX, canvasY, camera, nav);
    if (!hasAny) {
      onDrillUp();
    }
  }
});
```

## Parameters involved

| Parameter | Role in the handler |
|---|---|
| `canvas` | Event target and coordinate reference |
| `hitmap` | Resolves region hits and empty-space checks |
| `camera` | Passed to the hitmap for coordinate transforms |
| `nav` | Supplies the current depth guard |
| `onDrillDown` | Receives the clicked region ID |
| `onDrillUp` | Receives empty-space navigation requests |

## Example

```text
State: nav.level = 0, focusedId = "Feedlot--ps"
User clicks a region whose effective path contains singleton levels

-> hitmap.getRegionAt(...) = "market_animal--lf"
-> onDrillDown("market_animal--lf")
-> drillDown() resolves the final target and updates nav.skippedLevels
```

## Dependencies

| Module | Function | Use |
|---|---|---|
| `hitmap.ts` | `getRegionAt()` | Identifies the clicked region |
| `hitmap.ts` | `hasRegionAt()` | Distinguishes empty space from ambiguous clicks |
| `navigation.ts` | `drillDown()` | Applies singleton skip after the click has been classified |

## Architectural decisions

1. **Two hitmap checks** — one exact lookup and one boolean fallback let the
   handler distinguish empty clicks from ambiguous pixels.

2. **Depth guard in the event layer** — the click handler blocks impossible
   drill-down actions before they reach navigation.

3. **Singleton skip stays out of the event layer** — events decide *what was
   clicked*; navigation decides *how that click should be presented*.
