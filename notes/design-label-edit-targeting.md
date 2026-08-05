---
title: Graph-text edit targeting and the low-zoom edit lens
type: decision
---

# Graph-text edit targeting and the low-zoom edit lens

Tapping `i` over node or edge-label text places the insertion caret at the
nearest rendered character boundary to the crosshairs. Wrapped node labels
choose the rendered line under the crosshairs first; edge labels use their
explicit newline-delimited lines. Editing an existing selection still starts
at the end because it has no spatial click-equivalent.

Below 100% graph zoom, editing one node creates a natural-scale, screen-space
clone centered over the real node (clamped inside the drawing viewport). This
is an edit lens, not graph content: it is never selectable or serialized, it
tracks live text/caret/visual-selection changes, and it is destroyed on edit
exit, undo/redo, or deselection. The graph viewport and the real node remain
unchanged.

Vim visual mode supports the sequential `iw` text object. `viw` selects the
whole non-whitespace word containing the caret; from whitespace it chooses the
next word, falling back to the previous word at end of text.
