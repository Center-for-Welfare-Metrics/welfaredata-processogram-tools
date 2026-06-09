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

> Note (updated Jun 2026): Hatchery v30 is now the structurally 
> cleanest SVG reference — zero preflight errors, correct naming 
> conventions throughout. Cattle remains the navigation behavior 
> reference. For ID naming and export conventions, prefer Hatchery v30.

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
| Explicit size | The root `<svg>` must have explicit `width` and `height` attributes as plain pixel numbers — for example `width="1718"`. Do not use unit suffixes such as `mm`, `cm`, or `in`. Non-pixel units cause viewBox inconsistency and break motor normalization. In Inkscape, ensure the document unit is set to `px` before exporting. |

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
| No invisible hit-areas | Do not add invisible auxiliary shapes (opacity: 0, fill: none, or similar) to improve clickability. This technique is not reliably supported by the current motor — the hitmap rewrites SVG styles before rasterizing, making the behavior of invisible shapes unpredictable. This will be addressed in a future motor update. |
| Do not split one item across the file | Do not place one part of an item in one group and another part of the same item somewhere else in the SVG. |
| Background is not a navigable item | Background blocks, decorative frames, helper shapes, and export leftovers should not receive navigable IDs. |

### ID naming convention

| Requirement | Rule |
|---|---|
| Pattern | Use IDs in the format `name--ps`, `name--lf`, `name--ph`, or `name--ci`. |
| Uniqueness | Every ID must be unique across the entire SVG. |
| Safe characters | Use letters, numbers, underscores, and hyphens only. Avoid spaces and special characters. |
| Numeric suffix format | When numbering multiple instances of the same element, always use a hyphen before the number: `pig--ci-01`, `hen--ci-02`. Never use an underscore before the number (`pig--ci_01`) — the motor only recognizes the hyphen format and will ignore elements with underscore suffixes entirely. |
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

### Animal representation rules

Individual animals are the welfare subjects of processograms.
Use the following rules when deciding how to represent them:

| Case | Rule |
|---|---|
| Animal clearly visible, large enough, technically feasible | Each animal should be its own --ci element |
| Animals very small, far away, high density, or shown as a mass | Use a group or representative --ci instead of individualizing |
| Animal is the subject of a handled scene (e.g. chick being sexed) | Animal may have its own --ci if technically feasible; hands and fingers are visual context, not separate --ci |

**Guiding question:** "Do we want the user to click this specific
object and see separate information about it?"
- Yes → own --ci
- No → visual detail inside the relevant semantic group

For non-individualized groups, use names like:
- `chick_group--ci-01`
- `salmon_group--ci-01`
- `salmon_representative--ci-01`

Keep the animal type stable. Do not create new semantic classes
like "crowded_chicks" or "school_of_salmon". Context and
hierarchy explain where the animal is and what it is exposed to.

---

### Duration and metadata labels

Duration labels such as `duration_1_to_24_hours` should be
treated as visual metadata of the phase — not as navigable
--ci components — unless they are intentionally meant to open
specific information when clicked.

If the label is only visual, do not assign a --ci ID to it.

---

### Naming conventions for common components

| Component type | Recommended naming |
|---|---|
| Individual animal | `chick--ci-01`, `chick_female--ci-01` |
| Animal group/mass | `chick_group--ci-01`, `salmon_representative--ci-01` |
| Transport box | `transport_box--ci-01` (not `box--ci-01`) |
| Transport crate | `transport_crates--ci` or `crate_stack--ci` |
| Vehicle | `truck--ci`, `forklift--ci` (avoid numbered suffix if only one) |
| Operator/handler | `forklift_operator--ci` (use full descriptive name, no typos) |
| Duration label | Do not use --ci unless clickable |

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
- Numeric suffixes use underscore instead of hyphen (`animal--ci_01` instead of `animal--ci-01`).

### Final checklist before export

- The root `<svg>` has explicit `width`, `height`, and a matching `viewBox`.
- Every navigable item is a `<g>` with one unique ID.
- Parent and child groups are nested correctly.
- Each navigable group contains all artwork for that item.
- Each navigable group contains all visual artwork for that item (fill and stroke together, not split across groups).
- Thin or hard-to-click elements: do not add invisible hit-areas — not yet supported by the motor. Keep all real visual geometry inside the correct semantic group.
- Overlapping items are ordered correctly in the file.
- Background and helper elements do not receive navigable IDs.
- All numeric suffixes use hyphen format: `--ci-01`, not `--ci_01`.
- `--ci` items are not too small.