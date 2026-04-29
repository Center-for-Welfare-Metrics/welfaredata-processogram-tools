# NavState — Hierarchical navigation state

## What it does

`NavState` stores the current navigation state of the viewer: the active depth,
the focused region, the history stack used by `drillUp()`, and the singleton
levels skipped by the most recent resolved drill-down.

```ts
export interface NavState {
  level: number;
  focusedId: string | null;
  history: NavHistoryEntry[];
  skippedLevels: string[];
}
```

## Fields

### `level: number`

Current hierarchy level.

| Value | Meaning |
|---|---|
| `-1` | ROOT — overview, no focused region |
| `0` | `ps` — Production System |
| `1` | `lf` — Life Fate |
| `2` | `ph` — Phase |
| `3` | `ci` — Circumstance |

### `focusedId: string | null`

ID of the region currently in focus. It is `null` at ROOT.

### `history: NavHistoryEntry[]`

Stack of previously visited visual states. Each entry stores a snapshot of the
navigation state before a resolved drill-down transition.

```ts
interface NavHistoryEntry {
  id: string | null;
  level: number;
  camera: { scale: number; translateX: number; translateY: number };
}
```

Intermediate singleton levels are not pushed as separate history entries.

### `skippedLevels: string[]`

Array of region IDs skipped automatically during the most recent resolved
drill-down.

| Aspect | Value |
|---|---|
| Type | `string[]` |
| Purpose | Preserve the conceptual singleton levels crossed automatically by navigation |
| Order | Outermost skipped level → innermost skipped level |
| Empty state | `[]` when no singleton skip happened |

`skippedLevels` is used by the breadcrumb layer so the UI can preserve the full
conceptual path even when the camera jumps directly to a deeper visual target.

## When `skippedLevels` is populated

`skippedLevels` is written by `drillDown()` after `resolveSkipTarget()` runs.

```ts
const { finalId, skipped } = resolveSkipTarget(regionId, regions);
nav.focusedId = finalId;
nav.skippedLevels = skipped;
```

That means it is populated immediately after a drill-down transition that
crosses one or more singleton levels.

## When `skippedLevels` is cleared

At runtime, `skippedLevels` becomes `[]` in two important cases:

1. When `drillUp()` reaches ROOT and `restoreSkippedLevels()` in `main.ts`
   restores the root state, which has no focused region.
2. During the reset flow, where `onReset()` explicitly sets
   `nav.skippedLevels = []` after calling `resetView()`.

If `drillUp()` returns to a previously visited focused region that already had a
stored skipped chain, `main.ts` restores that skipped chain from
`skippedLevelsByFocusId` instead of clearing it.

## Example state transitions

### 1. Initial ROOT state

```ts
{ level: -1, focusedId: null, history: [], skippedLevels: [] }
```

### 2. Drill-down with singleton skip

Suppose the hierarchy is:

```
Feedlot--ps
  └── market_animal--lf
        └── holding--ph
              ├── pen-a--ci
              └── pen-b--ci
```

Clicking `Feedlot--ps` resolves directly to `holding--ph`.

```ts
{
  level: 2,
  focusedId: "holding--ph",
  history: [
    { id: null, level: -1, camera: { scale: 0.5, translateX: 200, translateY: 50 } }
  ],
  skippedLevels: ["market_animal--lf", "holding--ph"]
}
```

### 3. Drill-down without singleton skip

```ts
{
  level: 3,
  focusedId: "pen-a--ci",
  history: [
    { id: null, level: -1, camera: { scale: 0.5, translateX: 200, translateY: 50 } },
    { id: "holding--ph", level: 2, camera: { scale: 1.8, translateX: -320, translateY: -140 } }
  ],
  skippedLevels: []
}
```

### 4. Drill-up back to ROOT

```ts
{ level: -1, focusedId: null, history: [], skippedLevels: [] }
```

## Where it is used

| Module | Read / Write | Fields used |
|---|---|---|
| `navigation.ts` | Read + Write | `level`, `focusedId`, `history`, `skippedLevels` |
| `main.ts` | Read + Write | Initializes, stores, restores, and clears skip metadata |
| `hitmap.ts` | Read | `level`, `focusedId` |
| `renderer.ts` | Read | `focusedId` |
| `hud.ts` | Read | `level`, `focusedId` |

## Architectural decisions

### Why is ROOT represented by `level = -1`?

ROOT is not a real SVG hierarchy level. It represents the absence of a focused
region, so `-1` is a practical sentinel value.

### Why is `NavState` mutable?

Navigation updates happen in synchronous UI flows. Mutating the same state
object keeps the code simple and avoids unnecessary state object churn.

### Why is `skippedLevels` separate from `history`?

`history` represents visited visual states. `skippedLevels` represents
conceptual levels crossed automatically by singleton skip. Keeping them
separate allows `drillUp()` to remain correct while the breadcrumb still shows
the full conceptual path.

### Why is camera stored as a plain snapshot?

```ts
camera: { scale: camera.scale, translateX: camera.translateX, translateY: camera.translateY }
```

If the code stored the live `camera` object by reference, the saved history
entry would drift as the camera continued moving. A plain snapshot preserves the
exact visual state that should be restored later.
