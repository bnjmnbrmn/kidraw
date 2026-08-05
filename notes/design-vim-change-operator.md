---
title: Vim change operator in graph-text editing
status: implemented
date: 2026-08-05
---

# Vim change operator in graph-text editing

Vim-normal node and edge-label editing supports `c` as an operator. The first
`c` waits for a motion; the motion removes its addressed character range and
the editor immediately enters insert mode at the beginning of that range.

Supported forms are `cw`, `ce`, `cb`, `c0`, `c^`, `c$`, `ch`, `cl`, and `cc`.
Uppercase `C` is the direct `c$` form. Character-wise visual mode accepts `c`
to replace the active selection and enter insert mode. Escape / Ctrl-[ cancels
a pending operator without leaving Vim-normal label editing.

`cw` follows Vim's useful special case: when starting on a word, it removes
that word but keeps the following whitespace. The range math is shared in
`drawing-area/text-cursor.ts`; `DANode` and `DALabel` apply the same result so
node labels and edge labels cannot drift behaviorally.

Related: [label-edit overhaul](idea-label-edit-overhaul.md),
[mode hierarchy](architecture-mode-hierarchy.md).
