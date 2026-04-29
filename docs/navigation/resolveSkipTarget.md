# resolveSkipTarget() — Resolve the effective drill-down target

## What it does

`resolveSkipTarget()` determines the region that should actually become the
next navigation focus when the user clicks a region. If the clicked region is
followed by one or more intermediate levels that each have exactly one direct
child, the function skips those intermediate levels automatically and returns
the deepest useful target.

```ts
function resolveSkipTarget(
  regionId: string,
  regions: Map<string, Region>
): { finalId: string; skipped: string[] }
```

## Why it exists

This helper exists because the SVG encodes the full conceptual hierarchy, while
the navigation engine decides how that hierarchy should be presented in the UI.
Wladimir established that keeping the complete hierarchy in the SVG is correct,
but forcing the user to click through levels that have only one direct child is
not efficient. Those levels preserve meaning, but they do not create a visible
branching choice. In practice, they add an extra click without changing what
the user can decide next.

`resolveSkipTarget()` implements that product decision at the navigation layer:
the full hierarchy remains encoded in the SVG, but singleton levels are skipped
during navigation and can still be preserved elsewhere, such as the
breadcrumb.

## How it works

### Step 1 — Receive the clicked region ID

The function starts with a `regionId` that came from the current drill-down
interaction.

### Step 2 — Count direct children

It scans the `regions` map and filters by `parentId === regionId`.

```ts
let onlyChildId: string | null = null;

for (const region of regions.values()) {
  if (region.parentId !== regionId) continue;

  if (onlyChildId !== null) {
    return { finalId: regionId, skipped: [] };
  }

  onlyChildId = region.id;
}
```

The logic is intentionally based on direct children only. It does not inspect
grandchildren until recursion happens.

### Step 3 — Apply the base case

If the number of direct children is not exactly one, the current region is
already the effective navigation target.

- No children: return the current `regionId`
- More than one child: return the current `regionId`

```ts
if (onlyChildId === null) {
  return { finalId: regionId, skipped: [] };
}
```

When a second child is found during the loop, the function also returns the
current `regionId` immediately.

### Step 4 — Recurse into the single child

If there is exactly one direct child, the function calls itself again using
that child ID.

```ts
const resolved = resolveSkipTarget(onlyChildId, regions);
```

### Step 5 — Accumulate skipped IDs

The skipped chain is built from outermost to innermost by prepending the single
child before the recursive result.

```ts
return {
  finalId: resolved.finalId,
  skipped: [onlyChildId, ...resolved.skipped],
};
```

If several singleton levels appear in sequence, the recursion accumulates all
of them in order.

## Parameters and return value

### Parameters

| Parameter | Type | Meaning |
|---|---|---|
| `regionId` | `string` | The region currently being evaluated as the next navigation target. |
| `regions` | `Map<string, Region>` | The complete parsed region map. It is used to discover direct children through `parentId`. |

### Return value

| Field | Type | Meaning |
|---|---|---|
| `finalId` | `string` | The actual region that should be used as the drill-down target after singleton resolution. |
| `skipped` | `string[]` | The ordered list of singleton levels that were crossed automatically while resolving `finalId`. |

## Edge cases

### Region has no children

The function returns the same region.

```ts
{ finalId: regionId, skipped: [] }
```

This is the normal base case for leaf nodes.

### Multiple singleton levels in sequence

The recursion continues until it reaches a node with zero or multiple direct
children. Every singleton child encountered on the way is added to the
`skipped` array.

### Recursion reaches a `--ci` level

At the navigation level, a `--ci` region has no direct children. That means the
recursion stops there and returns the `--ci` region itself as `finalId`.

## Relationship to `drillDown()`

`drillDown()` calls `resolveSkipTarget()` at the very beginning, before any
state mutation or camera calculation.

```ts
const { finalId, skipped } = resolveSkipTarget(regionId, regions);
```

From that point on, `drillDown()` uses:

- `finalId` as the actual navigation target
- `finalId` for bbox lookup and target camera calculation
- `finalId` for the dynamic tile request
- `finalId` for `nav.focusedId`
- `skipped` for `nav.skippedLevels`

This is what allows the navigation engine to skip singleton levels during the
transition while still exposing those skipped IDs to the breadcrumb and any
other UI that needs the full conceptual path.

## Dependencies

| Direction | Module | Relationship |
|---|---|---|
| Defined in | `navigation.ts` | Private helper used only inside the navigation module |
| Consumes | `types.ts` | Uses `Region` metadata and `parentId` relationships |
| Called by | `drillDown()` | Resolves the effective drill-down target before state mutation |