---
title: A refused command still leaves an undo step
type: bug
status: fixed 2026-09-23 — steps that would change nothing are skipped at undo time
---

# A refused command still leaves an undo step

Before running any command on the mutating list, `handleCommand` pushes an
undo snapshot (`command-policy.ts` → `mutatesGraph`). It does this *before* the
command decides whether it can act. When the command then refuses ("⚠ Select
an edge first", "⚠ Task statuses need a Todo Graph"), the snapshot stays on the
stack, and the next undo restores a graph identical to the current one.

Seen in the browser (inferred, 2026-09-23 — from a probe that counted undo
entries and compared the serialised graph before and after):

| Command, refused | Graph changed | Undo entries added |
|---|---|---|
| `CYCLE_EDGE_DIRECTEDNESS`, no edge selected | no | 1 |
| `SET_TASK_STATUS` on a default graph | no | 1 |
| `SET_NODE_SHAPE`, nothing selected or hovered | no | 1 |

What the user sees: after a refused command, the first undo press does
nothing visible, and the header still offers Undo.

A worse case of the same thing — three commands that also snapshotted *for
themselves*, so every successful use left a spare step — was fixed on
2026-09-23 (`3b0387be`), with `tools/qa/undo/one-step-per-change.js` as its
net. This note is what that fix deliberately left alone.

## Options

1. **Drop a snapshot that changed nothing.** After the command runs, compare
   the graph with the snapshot just taken and pop it if they match. General
   and small; costs a second serialisation per mutating command (text edits
   and drags already coalesce to one snapshot per session).
2. **Let each command say whether it acted.** Handlers return whether they
   changed anything, and the policy snapshots lazily. Precise, but touches
   every mutating handler, and a lazy snapshot must be taken *before* the
   change — so in practice a handler would call back into the policy.
3. **Wait for operation-based undo.** When keymenu edits become operations
   ([`idea-multiplayer-readiness.md`](idea-multiplayer-readiness.md)), only
   operations that were applied are recorded, and the problem disappears.
   That is also the prerequisite for versioning and multiplayer in
   [`design-plugins.md`](design-plugins.md), so the fix would come with work
   already planned — but not soon.

Option 1 is the cheapest now, and option 3 makes it unnecessary later
(inferred, 2026-09-23). Which one, and whether now, is Ben's call.

## What was done

Ben left it to judgement (Ben, 2026-09-23: "Use your best judgement"). Done
as a fourth option, **skip at undo time**: `UndoRedoService.undo` and `redo`
drop snapshot steps identical to the graph as it is before taking a step, so
one press always reverts something (inferred, 2026-09-23 — chosen over option
1 on reading the code). Option 1 compares straight after the command, and a
node drag tweens over the following frames: compared that early, a real drag
looks unchanged and would lose its undo step. By the time undo is pressed,
every command has finished.

Selection is part of a snapshot, so a step that changed only the selection
is still a step. Operation groups are never skipped. The header's Undo can
still look available when only such steps remain; pressing it then does
nothing, as before. `tools/qa/undo/one-step-per-change.js` has the case (a
deletion, then a refused command, then one undo brings the node back).

Related: [`bug-node-target-filter-order.md`](bug-node-target-filter-order.md)
(the same commands refusing for different reasons).
