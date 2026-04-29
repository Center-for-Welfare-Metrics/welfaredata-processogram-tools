# drillUp() — Restore the previous visited visual state

## What it does

`drillUp()` restores the navigation state and target camera from the most
recent history snapshot.

```ts
export function drillUp(nav: NavState, target: Camera): void {
  if (nav.history.length === 0) return;

  const prev = nav.history.pop()!;
  nav.level = prev.level;
  nav.focusedId = prev.id;
  target.setTransform(
    prev.camera.scale,
    prev.camera.translateX,
    prev.camera.translateY
  );
}
```

## Why it exists

Drill-up is the inverse of drill-down. It lets the user go back to the last
visited visual context, including the exact camera snapshot that was stored
before the previous transition.

## How it works

### Step 1 — Check whether history exists

```ts
if (nav.history.length === 0) return;
```

At ROOT the history stack is empty, so `drillUp()` becomes a no-op.

### Step 2 — Pop the most recent snapshot

```ts
const prev = nav.history.pop()!;
```

The popped object contains the previous focus, level, and camera values.

### Step 3 — Restore navigation state

```ts
nav.level = prev.level;
nav.focusedId = prev.id;
```

### Step 4 — Restore target camera

```ts
target.setTransform(
  prev.camera.scale,
  prev.camera.translateX,
  prev.camera.translateY
);
```

The animation loop then moves the live camera back toward this restored target.

## Interaction with singleton skip

Singleton skip does not add intermediate entries to `history`. That means a
single `drillUp()` always returns to the previous visited visual state, not to
every conceptual level that may have been crossed automatically.

Example:

```text
ROOT
  click Feedlot--ps
  resolveSkipTarget() -> holding--ph
```

If that transition skipped `market_animal--lf`, the history stack still stores
only the pre-click state. One `drillUp()` returns to that state directly.

`drillUp()` itself does not recompute `nav.skippedLevels`. In the current
runtime flow, `main.ts` calls `restoreSkippedLevels()` after `drillUp()` so the
breadcrumb state matches the restored focus. When the restored focus is ROOT,
`nav.skippedLevels` becomes `[]`.

## Parameters

| Parameter | Type | Meaning |
|---|---|---|
| `nav` | `NavState` | Mutable navigation state |
| `target` | `Camera` | Camera target restored from the saved history entry |

## Return value

`void` — the function mutates `nav` and `target` in place, or does nothing when
history is empty.

## Example usage

```ts
function onDrillUp(): void {
  drillUp(nav, target);
  restoreSkippedLevels();
  isAnimating = true;
  needsRedraw = true;
}
```

## Dependencies

| Direction | Module | Relationship |
|---|---|---|
| Imports | `types.ts` | Uses `NavState` and camera snapshot data |
| Called by | `main.ts` | Triggered through the `onDrillUp()` callback |

## Architectural decisions

### Why restore an exact camera snapshot instead of recalculating it?

The user may have panned or zoomed before drilling down. Restoring the saved
camera snapshot preserves that precise visual context.

### Why use `pop()` instead of reading history without removing it?

The navigation model is stack-based. Once a previous state has been restored,
it should no longer remain at the top of the stack.
