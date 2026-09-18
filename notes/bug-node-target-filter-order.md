---
title: Two commands disagree about when to filter node targets
type: bug
---

# Two commands disagree about when to filter node targets

Both `setTaskStatus` and `setTextOverflowMode` act on "the selection, else the
node under the crosshairs", and both refuse to act on some kinds of node. They
apply that refusal at different moments, and the difference is visible
(inferred, 2026-09-18 — from reading the two implementations while extracting
`targetNodes`; not observed in the app).

**`setTextOverflowMode` filters before choosing.** Junctions are removed from
the selection *and* from the hover candidates, and then whichever list is
non-empty wins.

**`setTaskStatus` filters after choosing.** The selection wins if it is
non-empty, and only then are junctions and invisibles removed.

## Where they differ

With a selection containing only junctions, and a normal box under the
crosshairs:

| command | what happens |
| --- | --- |
| `setTextOverflowMode` | the selection filters to empty, so the box under the crosshairs takes the change |
| `setTaskStatus` | the selection wins, filters to empty, and the command reports `⚠ Select or hover a node to set its status` |

The same gesture either does something to the hovered node or does nothing,
depending on which command you ran.

## Which is right?

Unknown — this is Ben's call, not an agent's.

There is an argument for each. Filtering first is more forgiving: a stray
junction in the selection does not block a command that could obviously have
acted on what you are pointing at. Filtering after is more literal: a selection
means "these things", and if none of them can take the change, saying so is
more honest than quietly acting on something else.

`targetNodes(only?)` in `drawing-area.component.ts` implements the
filter-before form, because that is what `setTextOverflowMode` did.
`setTaskStatus` deliberately does **not** pass `only`; it calls
`targetNodes()` and filters the result, preserving its own order. A comment at
that call site points here.

## A second, unrelated divergence nearby

`togglePinSelected` narrows even a multi-node selection to one node:

```ts
const hovered = selected.length > 0 ? selected : this.getDANodesContainingCrosshairs();
const targets = topmostSelection(hovered);
```

`topmostSelection` is applied to the *selection* as well as to the hover
candidates, so selecting five nodes and pressing pin toggles exactly one of
them — the topmost. Every other command in this family acts on the whole
selection. Left alone for the same reason (inferred, 2026-09-18).
