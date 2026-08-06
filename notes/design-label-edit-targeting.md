---
title: Graph-text edit targeting and the low-zoom edit lens
type: decision
---

# Graph-text edit targeting and the low-zoom edit lens

Tapping `i` over node or edge-label text places the caret at the nearest
rendered character boundary to the crosshairs and enters **Vim normal**, so
the first typed key is a normal-mode command. Wrapped node labels choose the
rendered line under the crosshairs first; edge labels use their explicit
newline-delimited lines. Editing an existing selection also enters Vim normal
and starts at the end because it has no spatial click-equivalent. Creating a
new node or a new edge label still enters Insert directly.

Below 100% graph zoom, editing one node creates a natural-scale, screen-space
clone centered over the real node (clamped inside the drawing viewport). This
is an edit lens, not graph content: it is never selectable or serialized, it
tracks live text/caret/visual-selection changes, and it is destroyed on edit
exit, undo/redo, or deselection. The graph zoom and the real node remain
unchanged.

During node or edge-label editing, the viewport pans—but never zooms—when the
caret approaches an edge. The comfort band keeps three rendered text lines
available above and below where the viewport is large enough, plus a
screen-space horizontal margin. Cursor motion, mode changes, selections, and
text mutations all reuse the same refresh path, so the caret cannot silently
leave the viewport while editing.

Vim visual mode supports the sequential `iw` text object. `viw` selects the
whole non-whitespace word containing the caret; from whitespace it chooses the
next word, falling back to the previous word at end of text.
