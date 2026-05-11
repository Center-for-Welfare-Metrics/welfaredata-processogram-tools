> **Operational source of truth for SVG technical requirements.**
> This document defines what is required for an SVG to work correctly 
> with the Canvas Navigator engine. When there is any conflict with 
> older documents (including the Processogram Development Manual or 
> the legacy Technical Documentation), this file takes precedence 
> for technical compatibility with the motor.

---

## SVG Preparation Requirements

Use this document as a checklist when creating, revising, or exporting any processogram SVG.
It is written for designers and focuses only on how the SVG file must be built.

### Introduction

This document defines the structure that a processogram SVG must follow before it is delivered for use in the Canvas Navigator.
Its purpose is to help future designers produce files that are organized, consistent, and ready for navigation without requiring rework after export.

### Usage context

Use this checklist in three moments:

- When creating a new processogram from scratch.
- When editing an existing SVG that will continue to be used in the navigator.
- When reviewing a file before final export or handoff.

The goal is not only visual quality. The SVG must also be structured in a clear and predictable way so that each navigable item can be identified as a complete, self-contained group.

### Reference SVG

Use the Cattle SVG as the main reference file for new work.
Today, it is the best example of an SVG that is well organized and behaves correctly in the Canvas Navigator.

When in doubt, compare your file with the Cattle SVG and follow the same overall logic for:

- Group organization.
- Parent and child nesting.
- ID naming.
- Handling of overlapping items.
- Overall export cleanliness.

### Root SVG setup

| Requirement | Rule |
|---|---|
| Explicit size | The root `<svg>` must have explicit `width` and `height` attributes. |
| Matching coordinate space | If the file uses `viewBox`, keep it aligned with the same size values used in `width` and `height`. Prefer `viewBox="0 0 W H"`. |
| Minimum document size | Prefer at least `1500px` wide and `500px` high. This is a scale and export recommendation, not a required aspect ratio. The proportions of the processogram must follow the conceptual design. The goal is to avoid files that are too small overall or `--ci` elements that require extreme zoom levels to inspect. |
| Self-contained file | Keep essential fills, strokes, styles, and definitions inside the SVG file itself. Do not rely on page-level styling outside the SVG. |

### Navigable group structure

| Requirement | Rule |
|---|---|
| Use groups for navigable items | Every navigable item must be a `<g>` element, and the ID must be on that `<g>`. Do not place navigable IDs directly on `path`, `rect`, `circle`, or other single shapes. |
| Keep the hierarchy nested | Child items must be placed inside the group of their parent item in the SVG structure. If an item belongs to another item, it must also live inside it in the file. |
| Use one consistent hierarchy | Keep one clear hierarchy throughout the file, such as `ps > lf > ph > ci`. Do not mix different structures in different branches of the same drawing. |
| Only real items get navigable IDs | Apply navigable IDs only to visible items that should be selectable. Do not use navigable IDs on helpers, reusable definitions, clipping shapes, masks, or symbols. |

### Contents of each navigable group

| Requirement | Rule |
|---|---|
| One item, one group | All shapes that visually belong to the same item must stay inside the same `<g id="...">`. |
| Fill and stroke stay together | If an item has fill and stroke, both must remain inside the same group. |
| Complete visual geometry | All shapes that visually represent a navigable item — including fill and stroke — must be inside the same group. Do not split visual geometry across different semantic groups. |
| No artificial fills required | Navigable items do not need a solid visible fill if that does not make visual sense. Stroke-only, linear, hollow, or wire-like elements are valid as long as they contain their complete artwork. |
| Optional hit area | For elements that are too thin, linear, or difficult to select (such as wires, fences, or thin borders), consider adding an invisible auxiliary shape inside the same group to improve clickability. This shape should match the approximate area of the element and use `opacity: 0` or `fill: none` with a thick invisible stroke. Do not add visible fills just to satisfy the engine — this would interfere with future light and dark theme conversion. |
| Do not split one item across the file | Do not place one part of an item in one group and another part of the same item somewhere else in the SVG. |
| Background is not a navigable item | Background blocks, decorative frames, helper shapes, and export leftovers should not receive navigable IDs. |

### ID naming convention

| Requirement | Rule |
|---|---|
| Pattern | Use IDs in the format `name--ps`, `name--lf`, `name--ph`, or `name--ci`. |
| Uniqueness | Every ID must be unique across the entire SVG. |
| Safe characters | Use letters, numbers, underscores, and hyphens only. Avoid spaces and special characters. |
| Clear names | Use descriptive base names, such as `shed_a--ps`, `room_01--lf`, or `animal_12--ci`. |

### Overlapping elements

| Requirement | Rule |
|---|---|
| File order matches visual order | When two navigable items overlap, the one that should appear on top visually must also appear later in the SVG file. |
| Apply this rule at every level | This rule is not only for animals over pens or crates. It applies to any overlap between navigable items. |

### Minimum `--ci` size

| Requirement | Value | Guidance |
|---|---|---|
| Minimum `--ci` size | `20px` in SVG coordinates | Smaller items become too small to inspect and select reliably. |
| Recommended `--ci` size | `50px` or larger | Gives better readability and better focus quality. |

### Recommended structure example

```svg
<svg width="2000" height="1200" viewBox="0 0 2000 1200">
	<g id="shed_a--ps">
		<g id="room_01--lf">
			<g id="pen_01--ph">
				<g id="animal_01--ci">
					<path fill="#d9d9d9" d="..." />
					<path fill="none" stroke="#333333" d="..." />
				</g>
			</g>
		</g>
	</g>
</svg>
```

### Structure to avoid

```svg
<svg viewBox="0 0 2000 1200">
	<path id="animal_01--ci" fill="none" stroke="#333333" d="..." />

	<g id="pen_01--ph"></g>

	<defs>
		<g id="room_01--lf"></g>
	</defs>
</svg>
```

Problems in the example above:

- The root SVG has no explicit `width` and `height`.
- The navigable ID is on a single shape instead of a group.
- The parent and child structure is not nested correctly.
- A navigable item is placed inside `<defs>`.

### Final checklist before export

- The root `<svg>` has explicit `width`, `height`, and a matching `viewBox`.
- Every navigable item is a `<g>` with one unique ID.
- Parent and child groups are nested correctly.
- Each navigable group contains all artwork for that item.
- Each navigable group contains all visual artwork for that item (fill and stroke together, not split across groups).
- Thin or hard-to-click elements have an optional invisible hit area inside the same group if needed.
- Overlapping items are ordered correctly in the file.
- Background and helper elements do not receive navigable IDs.
- `--ci` items are not too small.