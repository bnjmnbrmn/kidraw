---
title: Custom node/edge colors (fill/stroke/textColor) never reach the canvas
type: bug
status: fixed 2026-09-25
---

# Custom node/edge colors never reach the canvas

Found 2026-07-08 while building `next.kidraw.yaml` (org.org → kidraw converter)
and trying to color-differentiate nodes by tag (`pre-mvp` blue, `post-mvp`
orange via `tagStyles`).

**Symptom:** every node renders in the plain theme color regardless of any
`fill`/`stroke`/`textColor` set in a style file (directly on a node/edge, or
via `tagStyles`), and regardless of the in-app "Set Item Color" command
(`w → h → <color>`) — that command's effect doesn't survive a theme toggle or
reload.

**Root cause, two independent gaps:**

1. **Never round-tripped.** `StyleProps` (`fill`/`stroke`/`textColor`/`opacity`
   — [`src/app/lib/file-format/types.ts`](../src/app/lib/file-format/types.ts))
   is a legal field on `NodeStyleProps`/`EdgeStyleProps`/`tagStyles` and the
   parser validates it, but
   [`snapshot-mapping.ts`](../src/app/lib/file-format/snapshot-mapping.ts)
   never reads it in `filesToSnapshot()` or writes it in `snapshotToFiles()`.
   `DANodeSnapshot`/`DAEdgeSnapshot` (`graph-snapshot.ts`) have no color
   fields at all, so there's nowhere for a resolved color to land even if it
   were read.
2. **Even set directly on the live node, theme application clobbers it.**
   `DrawingLayer.restoreGraph()` unconditionally calls
   `applyThemeColors(this._palette)` after loading, and every load call site
   in `drawing-area.component.ts` calls it again explicitly.
   `applyThemeColors()` → `DANode.applyColors()` /
   `DAEdge.applyColors()` set fill/stroke/text straight from the theme
   palette, unconditionally — same mechanism `setItemColor()` (the in-app
   color picker) uses, which is why its effect doesn't survive a theme
   toggle either.

**What still works:** position, size, shape, font size, text-overflow mode,
line style, waypoints, label offsets — everything else in `NodeStyleProps`/
`EdgeStyleProps` round-trips and renders correctly. `next.kidraw.yaml` uses
shape + size to differentiate root/category/leaf, which is unaffected.

**Fix sketch (not done — a real feature, not a one-liner):**
- Add optional `fill`/`stroke`/`textColor` to `DANodeSnapshot`/`DAEdgeSnapshot`
  and to the `DANode`/`DAEdge` runtime objects (a "custom color" that,
  once set, is distinct from "theme default").
- `snapshotToFiles`/`filesToSnapshot` round-trip it like the other style
  fields.
- `applyThemeColors()` must skip elements with a custom color set (or
  apply theme colors first, then re-apply custom colors after — same fix
  either way, just needs one clear precedence rule).
- `setItemColor()` should persist through the same field, including a
  `'default'` choice that explicitly clears the override back to theme.

**Relates to:** the unimplemented "Expanded styling" post-MVP item; tags
just became real content (this file) for the first time, which is what
surfaced this.

## Fixed 2026-09-25

Ben asked for the fix (Ben, 2026-09-25: "Fix the bugs."). What changed, as
seen in the app:

- A color picked with the Color command stays through a theme toggle, a
  reload, save/open, copy/paste and a shape change. **Default** puts the
  item back on the theme's colors.
- Picking a color (or a line style) is now one undo step and triggers
  auto-save, like the other style commands. Before, neither was undoable
  and a reload could lose it.
- `fill`/`stroke`/`textColor` in a style file, directly or through
  `tagStyles`, now show on the canvas.
- A blue or red edge is drawn in that color. Before, a directed edge kept
  the theme's gradient, so picking a color on it seemed to do nothing.

How: `DANode`/`DAEdge` hold a "custom colors" layer over the theme's
(`setCustomColors`); the theme is re-applied underneath it. Snapshots carry
`fill`/`stroke`/`textColor` under the style-file names, and
`snapshot-mapping.ts` reads and writes them. No existing persisted key was
renamed; old drafts simply have no colors.

Calls made without Ben, his to overturn (inferred, 2026-09-25):

- **A color you choose beats the diagram type's kind color** (e.g. a
  definition's border) and the direction colors on edges. It is the most
  explicit choice, so it wins.
- **Colors from a tag are written onto each node on save.** Tags are folded
  into per-node rules on load, so a saved file repeats the tag's color on
  every tagged node; changing the tag's color later won't recolor them. Shape
  already works this way. Keeping them apart would mean remembering which
  props came from a tag, which nothing does yet.
- Picking a color with nothing to color still records an undo step (a
  harmless no-op), as Set Shape already did.

Checks: `da-item-colors.spec.ts`, `snapshot-mapping.spec.ts` (round trip),
`drawing-area.component.item-color.spec.ts`, and
`tools/qa/style/style-commands.js` (theme toggle, undo, reload, Default).

Still not honored (inferred, 2026-09-25): `strokeWidth` and `opacity`, which
`docs/file-format.md` also lists. They parse and are ignored, as before.
