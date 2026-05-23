---
title: Test coverage gaps
type: idea
---

# Test coverage gaps

Critical untested flows identified from a code-review pass:

- **Directed edge creation** (begin → set destination → finalize).
- **Undo/redo coalescing** (the `dragSnapshotCaptured` / `textEditSnapshotCaptured` flags).
- **Insert+drag interaction** (submenu replacement during held key).
- **Double-shift mode reset.**
- **Traversal index cycling** (outgoing/incoming traversal maps).
- **Auto-pan during drag near edges.**
- **Theme toggle reactivity** (keymenu rebuild, drawing area recolour).
- **Held-key mode enter/exit lifecycle** (state machine; the original ghost-card bug came from gaps here).

Many of these are state-machine tests that don't need Konva — verify that after push → pop → push the stack state is clean, etc.
