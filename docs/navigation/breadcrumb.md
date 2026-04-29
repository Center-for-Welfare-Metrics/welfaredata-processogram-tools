# breadcrumb — Dynamic breadcrumb trail and singleton access

## What it does

The breadcrumb feature exposes the full conceptual navigation path as a DOM
overlay above the canvas. It combines four pieces of the runtime:

- `BreadcrumbItem` in `types.ts` describes one visible breadcrumb node
- `buildBreadcrumb()` in `navigation.ts` reconstructs the ordered path from
  the focused region back to the root
- `renderBreadcrumb()` in `main.ts` turns that path into clickable DOM nodes
- `#breadcrumb` in `index.html` provides the fixed overlay container above the
  canvas

The result is a breadcrumb trail that stays consistent with the parsed region
graph, marks singleton levels skipped automatically by navigation, and keeps
those skipped conceptual levels accessible.

## Why it exists

The navigation engine skips singleton levels when they do not create a
meaningful branching choice, but the SVG still encodes those levels because
they are part of the real conceptual hierarchy. Wladimir explicitly required
that the full conceptual path remain visible and accessible in the UI.

The breadcrumb satisfies that requirement without forcing unnecessary clicks in
the main navigation flow.

## BreadcrumbItem

`BreadcrumbItem` represents one node in the breadcrumb trail.

```ts
export interface BreadcrumbItem {
  id: string;
  label: string;
  level: number;
  isSkipped: boolean;
}
```

### What it represents

Each item corresponds to one level in the parsed navigation hierarchy, ordered
from the outermost visible ancestor to the current focused node.

### Fields

| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | Region ID used for navigation and stored on the breadcrumb item as a DOM data attribute |
| `label` | `string` | Human-readable name shown in the UI, derived from the region ID by removing the hierarchy suffix and replacing `_` or `-` with spaces |
| `level` | `number` | Hierarchy depth: `0 = ps`, `1 = lf`, `2 = ph`, `3 = ci` |
| `isSkipped` | `boolean` | Marks a conceptual level crossed automatically by singleton skip; the UI styles it differently but keeps it clickable |

## buildBreadcrumb()

### What it does

`buildBreadcrumb()` reconstructs the full navigation path from the current
focused node up to the root and returns it as an ordered `BreadcrumbItem[]`
from root to current node.

```ts
export function buildBreadcrumb(
  focusedId: string | null,
  regions: Map<string, Region>,
  skippedLevels: string[]
): BreadcrumbItem[]
```

### Why it exists

The breadcrumb is not maintained as a second navigation history. Instead it is
derived from the region graph itself through each region's `parentId`. That
keeps the breadcrumb consistent with the data model regardless of whether the
user arrived through drill-down, drill-up, reset, or a breadcrumb click.

### How it works

1. If `focusedId` is `null`, return `[]` immediately.
2. Start from the current `focusedId`.
3. Read the current region from the `regions` map.
4. Derive a clean label by removing the trailing hierarchy suffix such as
   `--ps`, `--lf`, `--ph`, or `--ci`, then replacing `_` and `-` with spaces.
5. Create one `BreadcrumbItem` and insert it at the beginning of the result
   array with `unshift()`.
6. Mark `isSkipped` by checking whether the current region ID appears in the
   `skippedLevels` array.
7. Move to `region.parentId` and repeat until there is no parent.

Because the function prepends each item, the returned array is always ordered
from root to current node.

### Parameters

| Parameter | Type | Meaning |
|---|---|---|
| `focusedId` | `string \| null` | Region currently in focus, or `null` at root |
| `regions` | `Map<string, Region>` | Parsed region map used to walk the `parentId` chain |
| `skippedLevels` | `string[]` | Ordered IDs crossed automatically by the most recent resolved drill-down |

### Return value

| Return | Type | Meaning |
|---|---|---|
| result | `BreadcrumbItem[]` | Ordered breadcrumb path from root to the current focused region |

### Edge cases

#### `focusedId` is `null`

The function returns an empty array immediately and does not inspect the map.

#### Current region has no parent

Traversal stops when `parentId === null`. That region is the root of the
visible path.

#### Region lookup fails

If a `focusedId` or intermediate `parentId` is missing from the map, the
current traversal stops and returns the path accumulated so far.

## renderBreadcrumb()

### What it does

`renderBreadcrumb()` reads the current navigation state from module scope,
calls `buildBreadcrumb()`, and updates the `#breadcrumb` DOM overlay so the UI
matches the current focused path.

```ts
function renderBreadcrumb(): void
```

### Visibility logic

When `buildBreadcrumb()` returns `[]`, the function hides the element and
clears its children:

```ts
breadcrumbEl.style.display = 'none';
breadcrumbEl.replaceChildren();
```

This is the expected state at root level, after reset, and during cleanup.

When the returned array contains items, the function rebuilds the contents and
shows the container with `display = 'flex'`.

### Item rendering

The DOM structure is assembled dynamically:

- one `span` per `BreadcrumbItem`
- one separator `span` containing `›` between adjacent items
- `data-region-id` stored on each breadcrumb item span
- `.is-skipped` applied when `item.isSkipped === true`
- `.is-active` applied to the last item, which is the current focused node

This makes the overlay purely derived UI: no breadcrumb nodes persist between
renders.

### Click handling

Every breadcrumb item registers its own click handler. The first operation is:

```ts
e.stopPropagation();
```

This is critical because the breadcrumb is rendered on top of the canvas. The
canvas must not receive a click that was intended for breadcrumb navigation.

After stopping propagation, the handler follows two paths:

1. **History-backed navigation**
   - Search `nav.history` from the most recent entry backwards.
   - If the clicked region exists there, call `drillUp()` the required number
     of times.
   - Restore `nav.skippedLevels` for the restored focused region.

2. **Direct breadcrumb focus for skipped singleton levels**
   - If the clicked region is not in `nav.history`, it was not visited as a
     standalone visual state.
   - `focusBreadcrumbRegion()` rebuilds `nav.history`, updates the focus,
     restores the conceptual skipped chain visible up to that node, and writes
     the new target camera directly.
   - This is what keeps skipped singleton levels clickable even though they
     were crossed automatically by the main drill-down flow.

### When it is called

`renderBreadcrumb()` is called at every place where breadcrumb visibility or
content can change.

| Call site | Why it is needed |
|---|---|
| Initial camera setup in `handleFile()` | Ensures the breadcrumb starts hidden when the first loaded state is root |
| `onDrillDown()` | Rebuilds the path after a new focused region is resolved |
| `onDrillUp()` | Rebuilds the path after returning to a previous visual state |
| `onReset()` | Hides the breadcrumb because reset returns to root and clears `skippedLevels` |
| `cleanup()` | Clears and hides the breadcrumb when switching to another SVG |
| Breadcrumb click handler | Immediately refreshes the DOM after breadcrumb-driven navigation |

## Breadcrumb DOM element

### Structure

The breadcrumb container is defined in `index.html` as a sibling of the canvas:

```html
<div id="canvas-phase">
  <canvas id="main-canvas"></canvas>
  <div id="breadcrumb"></div>
  <div id="hud">...</div>
</div>
```

### Positioning and look

The element is a fixed-position overlay centered near the top of the viewport.
It uses a flex row layout with wrap support, a dark semi-transparent background,
the same monospace font family as the HUD, and the same general visual system
used by the rest of the debug overlay UI.

### Pointer events

`pointer-events: auto` is required so breadcrumb clicks are captured by the
overlay itself instead of falling through to the canvas.

### z-index

The element uses the same overlay layer as the HUD (`z-index: 100`). That puts
it safely above the canvas while keeping it within the same UI stacking model.

### Visibility

The breadcrumb is hidden by default with `display: none`. It becomes visible
only when navigation has an active focused region.

## Dependencies

| Direction | Module or file | Relationship |
|---|---|---|
| Defined in | `types.ts` | `BreadcrumbItem` describes one visible breadcrumb node |
| Defined in | `navigation.ts` | `buildBreadcrumb()` reconstructs the path from the region graph |
| Defined in | `main.ts` | `renderBreadcrumb()` owns DOM rendering and click navigation |
| Defined in | `index.html` | `#breadcrumb` provides the fixed overlay container and visual classes |
| Depends on | `NavState.skippedLevels` | Preserves skipped singleton levels in the visible path |

## Architectural decisions

### Why derive the breadcrumb from `parentId` instead of a separate history?

The breadcrumb is a description of the current conceptual path, not a log of
the exact sequence of visual states. Deriving it dynamically from `parentId`
guarantees that it stays aligned with the real region graph.

### Why keep skipped singleton levels visible?

Singleton skip removes unnecessary clicks from the main drill-down flow, but it
must not erase the conceptual hierarchy. Keeping skipped levels visible and
clickable satisfies the product requirement that those levels remain accessible.

### Why does direct breadcrumb navigation rebuild camera and history state?

Skipped singleton levels do not exist as standalone entries in `nav.history`.
If the user clicks one of those levels, the runtime needs to reconstruct the
appropriate focus and camera state directly instead of pretending that the user
visited that node during the original drill-down.