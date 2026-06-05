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
- **Duplicate IDs** — Two or more elements share the same ID. Each ID must be unique. Rename duplicates in your SVG editor.
- **Navigable IDs on non-group elements** — IDs ending in `--ps`, `--lf`, `--ph`, or `--ci` must be on `<g>` (group) elements, not on shapes like `<rect>` or `<path>`. Wrap the shape in a group and move the ID there.
- **Navigable groups with transforms** — Semantic groups (`--ps`/`--lf`/`--ph`/`--ci`) must not carry `transform` attributes because they break coordinate calculations. Remove the transform or restructure the SVG.

### Warnings (review)

- **SVG dimensions below recommended minimum** — The SVG is smaller than 1500x500px. Small SVGs require excessive zoom for component-level elements, which degrades raster cache quality. Consider increasing the canvas size. This is a recommendation, not an absolute requirement.
- **Hidden elements inside semantic groups** — Elements with `display:none` were found inside a navigable region. Check whether this content was hidden intentionally or accidentally.
- **Very small --ci elements** — A component/indicator region has a rendered dimension below 20px. It may be too small for users to interact with. Consider making it larger or merging it with a neighboring component.
- **Duration labels marked as navigable components** — An ID containing "duration" has a `--ci` suffix. Duration labels are visual metadata of the phase and should not be navigable. Remove the `--ci` suffix from these IDs.
- **Suspicious ID formatting** — A navigable ID (containing `--`) has double underscores, spaces, or unusual characters that may cause problems. Clean up the ID in your SVG editor.
- **Hierarchy nesting issues** — A navigable element is not nested inside the expected parent level (e.g. a `--ci` not inside a `--ph`, or a `--ph` not inside a `--lf`). Restructure the SVG layer hierarchy.
- **Non-standard -- suffixes** — An ID uses the `--` delimiter but does not end with a recognized suffix (`--ps`, `--lf`, `--ph`, `--ci`). This may be a typo or an unused convention.

### Info (neutral)

- **SVG dimensions** — Displays the width and height of the SVG.
- **ViewBox** — Displays the viewBox value.
- **Region counts** — Shows how many `--ps`, `--lf`, `--ph`, and `--ci` groups exist in the file.
