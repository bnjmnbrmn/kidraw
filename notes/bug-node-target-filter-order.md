---
title: Two commands disagree about when to filter node targets
type: bug
status: resolved 2026-09-24 by Ben's rule; the edge-style case is to be revisited
---

# Two commands disagree about when to filter node targets

> **Ben's rule (Ben, 2026-09-24):** *if things are selected, actions should
> affect those things, and if things aren't selected then what's under the
> crosshairs should be considered (not necessarily acted upon).*
>
> What followed from it (2026-09-24, checked by
> `tools/qa/selection/selection-wins.js`, which failed on the old code):
> - **Filter order:** `targetNodes(only)` now filters *after* choosing, as
>   `setTaskStatus` always did. A selection of only junctions makes
>   text-overflow act on nothing instead of on the node under the crosshairs
>   (inferred from the rule, 2026-09-24).
> - **Pin** takes every selected node (Ben, 2026-09-24). A selected node also
>   beats a waypoint under the crosshairs, which used to win (inferred from
>   the rule). A mixed set goes one way, pinned unless all already are, as the
>   waypoints already did (inferred, 2026-09-24).
> - **Edge style commands** keep restyling *every* edge under the crosshairs
>   when nothing is selected, for now. Ben is not sure that is right and wants
>   to revisit it (Ben, 2026-09-24).

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

*Moved since (2026-09-24):* task status is now the Todo Graph plugin's
(`plugins/todo-graph.plugin.ts`), and the plugins' `tags.set`
(`plugins/tags.plugin.ts`) works the same way. Both take the host's
`targetNodes()` and filter after, so the filter-after form is now the rule for
every plugin command that sets tags (inferred, 2026-09-24 — from the code).

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

## A third: edges under the crosshairs

With nothing selected, the style commands for edges — directedness, line
style (`targetEdges`) and colour (`setItemColor`) — act on **every** edge under
the crosshairs, where the hover trace, Delete, Edit Text and a new label all
mean the one drawn on top (inferred, 2026-09-24 — from the code, while fixing
the commands that took the edge underneath). Where two edges cross under the
crosshairs, `v` then a line style restyles both. `setItemColor` is split
within itself: it narrows hovered nodes to the topmost but takes every hovered
edge.

Acting on all of them is a different thing from acting on the wrong one, so it
is left as it is. Ben's call whether a restyle should mean the highlighted edge
only.
