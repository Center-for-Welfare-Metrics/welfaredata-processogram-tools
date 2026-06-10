# SVG Preflight

Technical pre-delivery checker for WelfareData processogram SVGs.

## Usage

1. Open `svg-preflight.html` in any browser (Chrome, Firefox, or Safari) by double-clicking the file.
2. Drag an SVG file onto the drop zone, or click to browse for a file.
3. The tool runs all checks automatically and displays a report.
4. Click **Download report (.txt)** to save the results as a text file.
5. Click **Test another file** to check a different SVG without reloading the page.

No installation, no internet connection, and no build step required.

## Severity levels

| Level     | Meaning |
|-----------|---------|
| **Error** | Must be fixed before delivery. These are objective technical failures that will break the Canvas Navigator (missing dimensions, duplicate IDs, navigable IDs on wrong element types, transforms on semantic groups). |
| **Warning** | Should be reviewed by the designer. These are suspicious patterns that may indicate a problem but require human judgment (very small interactive regions, hidden elements inside semantic groups, broken nesting hierarchy, unusual ID formatting). |
| **Pass**  | The check found no issues. |
| **Info**  | Neutral information about the file (dimensions, viewBox value, region counts). |

## Scope

This tool only checks **technical and mechanical issues** — things that are objectively correct or incorrect for the Canvas Navigator to function properly.

It does **not** make semantic or design decisions. Questions like whether a specific animal should be individualized as a component, how phases should be grouped, or what labels to use remain design decisions made by the designer.

## Checks performed

### Errors (must fix)

- **Missing width attribute** — The root `<svg>` element must have a `width` attribute. Add it in your SVG editor or in the source code.
- **Missing height attribute** — The root `<svg>` element must have a `height` attribute. Add it in your SVG editor or in the source code.
- **Missing viewBox** — The root `<svg>` must have a `viewBox` attribute so the Canvas Navigator can calculate coordinates. Add a viewBox matching the document dimensions.
- **ViewBox inconsistent with dimensions** — The viewBox width/height do not match the width/height attributes. Make them consistent so scaling works correctly.
- **Width or height in non-pixel units** — The `width` or `height` attributes must be plain numbers without units (e.g. `width="1718"`, not `width="153mm"` or `width="6in"`). Non-pixel units cause the viewBox consistency check to fail and interfere with the motor's SVG normalization. In Inkscape, set the document units to px before exporting.
- **Duplicate IDs** — Two or more elements share the same ID. Each ID must be unique. Rename duplicates in your SVG editor.
- **Navigable IDs on non-group elements** — IDs ending in `--ps`, `--lf`, `--ph`, or `--ci` must be on `<g>` (group) elements, not on shapes like `<rect>` or `<path>`. Wrap the shape in a group and move the ID there.
- **Navigable groups with transforms** — Semantic groups (`--ps`/`--lf`/`--ph`/`--ci`) must not carry `transform` attributes because they break coordinate calculations. Remove the transform or restructure the SVG.
- **External references in `<use>` elements** — A `<use>` element points to an external file (e.g. `icons.svg#arrow`) instead of an internal symbol (e.g. `#arrow`). When the motor extracts a group in isolation, external file references cannot be resolved and rasterization will fail. Change the reference to an internal symbol or inline the referenced content.
- **Navigable elements inside `<defs>`** — A navigable group (`--ps`/`--lf`/`--ph`/`--ci`) is placed inside a `<defs>` block. Elements in `<defs>` are not rendered, have no bounding box, and cannot be extracted by the motor. Move the group out of `<defs>` into the main SVG tree.

### Warnings (review)

- **SVG dimensions below recommended minimum** — The SVG is smaller than 1500x500px. Small SVGs require excessive zoom for component-level elements, which degrades raster cache quality. Consider increasing the canvas size. This is a recommendation, not an absolute requirement.
- **Hidden elements inside semantic groups** — Elements with `display:none` were found inside a navigable region. Check whether this content was hidden intentionally or accidentally.
- **Very small --ci elements** — A component/indicator region has a rendered dimension below 20px. It may be too small for users to interact with. Consider making it larger or merging it with a neighboring component.
- **Duration labels marked as navigable components** — An ID containing "duration" has a `--ci` suffix. Duration labels are visual metadata of the phase and should not be navigable. Remove the `--ci` suffix from these IDs.
- **Suspicious ID formatting** — A navigable ID (containing `--`) has double underscores, spaces, or unusual characters that may cause problems. Clean up the ID in your SVG editor.
- **Hierarchy nesting issues** — A navigable element is not nested inside the expected parent level (e.g. a `--ci` not inside a `--ph`, or a `--ph` not inside a `--lf`). Restructure the SVG layer hierarchy.
- **Non-standard -- suffixes** — An ID uses the `--` delimiter but does not match a recognized navigable ending. Valid forms are `name--ps`, `name--lf`, `name--ph`, `name--ci`, and numbered variants with a hyphen before the number such as `name--ci-01`. IDs like `pig--ci_01` are reported here as non-standard and must be renamed.
- **Invisible elements inside semantic groups** — Elements with `visibility:hidden` or `opacity:0` were found inside a navigable region. They are present in the DOM but invisible to users, which may cause confusion when clicking. Check whether the invisibility is intentional.
- **ViewBox origin not at 0,0** — The `viewBox` attribute starts with non-zero min-x or min-y values (e.g. `viewBox="50 50 1718 971"`). The Canvas Navigator expects coordinates starting at 0,0. A non-zero origin shifts the coordinate system and may cause click targets to appear offset from their visual positions.
- **Stroke-only --ci groups (no fill)** — A `--ci` group contains only stroke shapes (`fill:none`). Review whether the complete visual geometry is inside the group. If the element is hard to interact with, increase the visible stroke width or restructure the group so all artwork is contained within it. Do not add invisible fills or auxiliary hit-area shapes — this is not supported by the current motor.
- **Nested `<svg>` elements** — The document contains `<svg>` elements nested inside the root `<svg>`. Nested SVGs create independent viewports with their own coordinate systems, which can cause the motor to miscalculate bounding boxes for groups inside them. Flatten nested SVGs into the root viewport.
- **Background rectangle at root level** — A `<rect>` is the first rendered element in the SVG root. If this is a background fill, it will be included in every extracted group's rasterization. Consider placing it inside a non-navigable group or removing it if the Canvas Navigator provides its own background.

### Info (neutral)

- **SVG dimensions** — Displays the width and height of the SVG.
- **ViewBox** — Displays the viewBox value.
- **Region counts** — Shows how many `--ps`, `--lf`, `--ph`, and `--ci` groups exist in the file.
- **High component count** — The file has more than 250 `--ci` groups. Large component counts may cause slower initial load in the Canvas Navigator due to tile rasterization. This is informational only — no action is required.
