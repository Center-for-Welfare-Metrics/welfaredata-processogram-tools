# drillDown() — Enter a region with singleton skip

## What it does

`drillDown()` resolves the effective navigation target for a click, stores the
previous visual state in history, updates `NavState`, requests the appropriate
dynamic tile, and computes the next target camera.

```ts
export function drillDown(
  regionId: string,
  nav: NavState,
  regions: Map<string, Region>,
  camera: Camera,
  target: Camera,
  canvasW: number,
  canvasH: number,
  onTileNeeded: (id: string) => void
): void
```

## Why it exists

Drill-down is the main navigation action of the viewer. The user clicks a
visible region and expects the engine to focus the next meaningful level. The
function coordinates every piece of that transition in one place: target
resolution, history snapshot, state mutation, tile request, and camera target.

## How it works

### Step 1 — Resolve the effective target before mutating state

The function starts by calling `resolveSkipTarget()`.

```ts
const { finalId, skipped } = resolveSkipTarget(regionId, regions);
```

This happens before any history write or camera calculation. If the clicked
region is followed by a chain of singleton levels, `finalId` becomes the final
resolved region and `skipped` contains the skipped IDs in outermost-to-
innermost order.

If no singleton skip is needed:

- `finalId === regionId`
- `skipped === []`

### Step 2 — Look up and validate the resolved region

```ts
const nextRegion = regions.get(finalId);
if (!nextRegion) return;

if (!nextRegion.bbox ||
    nextRegion.bbox.width < 0.1 ||
    nextRegion.bbox.height < 0.1) {
  console.warn('[drillDown] bbox inválido para:', finalId);
  return;
}
```

The bbox validation applies to the resolved target, not necessarily the clicked
ID.

### Step 3 — Push one history snapshot

```ts
nav.history.push({
  id: nav.focusedId,
  level: nav.level,
  camera: {
    scale: camera.scale,
    translateX: camera.translateX,
    translateY: camera.translateY
  }
});
```

Only one snapshot is pushed per resolved transition. Intermediate singleton
levels are not stored as visited visual states.

### Step 4 — Update `NavState`

```ts
nav.level = nextRegion.level;
nav.focusedId = finalId;
nav.skippedLevels = skipped;
```

This is the point where singleton skip becomes visible in state:

- `finalId` becomes the real focus
- `skipped` is stored in `nav.skippedLevels`

### Step 5 — Request the resolved dynamic tile

```ts
onTileNeeded(finalId);
```

The rasterizer is asked for the final resolved region only.

### Step 6 — Compute the target camera

```ts
const newCam = bboxToCamera(nextRegion.bbox, canvasW, canvasH);
target.setTransform(
  newCam.scale,
  newCam.translateX,
  newCam.translateY
);
```

The camera is also computed from the resolved target, so the animation lands on
the same region that became the new focus.

## Singleton skip integration

Singleton skip is fully integrated into `drillDown()`.

At the beginning of the function:

- `resolveSkipTarget()` is called before any state mutation
- `finalId` replaces the original clicked ID as the navigation target
- `skipped` is written to `nav.skippedLevels`

This allows the breadcrumb to preserve conceptual levels even when the camera
and focus jump directly to a deeper node.

## Parameters

| Parameter | Type | Meaning |
|---|---|---|
| `regionId` | `string` | The region ID received from the click flow |
| `nav` | `NavState` | Mutable navigation state |
| `regions` | `Map<string, Region>` | Parsed region map |
| `camera` | `Camera` | Current camera, used for the history snapshot |
| `target` | `Camera` | Target camera updated for the next animation |
| `canvasW` | `number` | Canvas width |
| `canvasH` | `number` | Canvas height |
| `onTileNeeded` | `(id: string) => void` | Callback that requests the dynamic tile for the resolved target |

## Return value

`void` — the function mutates `nav` and `target` in place.

## Example usage

```ts
function onDrillDown(regionId: string): void {
  drillDown(regionId, nav, regions, camera, target,
    window.innerWidth, window.innerHeight, onTileNeeded);
  isAnimating = true;
  needsRedraw = true;
}
```

## Dependencies

| Direction | Module | Relationship |
|---|---|---|
| Imports | `camera.ts` | Uses `bboxToCamera()` to compute the target camera |
| Imports | `types.ts` | Uses `NavState`, `Region`, and `Camera`-related types |
| Uses | `resolveSkipTarget()` | Resolves singleton chains before any state mutation |
| Called by | `main.ts` | Triggered through the `onDrillDown()` callback |

## Architectural decisions

### Why resolve singleton skip inside `drillDown()`?

The parser should describe hierarchy, not presentation. The click handler
should only report the clicked region. `drillDown()` is the correct place to
apply the product rule that singleton levels should be skipped during
navigation.

### Why is `skippedLevels` not pushed into history?

History represents visited visual states. Singleton levels crossed
automatically were not shown as standalone visual states, so storing them as
history entries would make `drillUp()` stop in places the user never actually
visited.

### Why is `onTileNeeded` still a callback?

Dynamic tile generation remains owned by `main.ts`, where the rasterizer
configuration and caches live. `drillDown()` only signals which resolved region
needs a tile.
