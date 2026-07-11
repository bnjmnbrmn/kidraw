---
title: Custom node/edge colors (fill/stroke/textColor) never reach the canvas
type: bug
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
