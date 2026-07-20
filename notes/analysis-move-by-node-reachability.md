---
title: Move-by-node reachability — some layouts have unreachable nodes
type: analysis
date: 2026-07-20
---

# Move-by-node can leave nodes unreachable (proven)

Ben asked (2026-07-20): can an arrangement of nodes make some node
unreachable by directional move-by-node, and can we prove it? **Yes.**

## The model

Move-by-node (`g` submenu, and the grow-mode target hop) uses
`findNodeInDirection`: from the crosshairs, the pressed direction defines a
**45° cone** (`along ≥ offAxis`, `along > 5px`), and the node minimizing
`score = along + 2·offAxis` in that cone wins; the crosshairs jump to it.

Treat nodes as vertices and draw A→B when a single press from A selects B.
"Reachable via this method" = strong connectivity of that graph. A node is
*truly* unreachable when its in-degree is 0 (no press from any node lands on
it).

## Proof by minimal counterexample (verified in the real app)

Three nodes (screen coords, y down):

```
A = (450, 550)   ← UNREACHABLE
B = (100, 800)
C = (200, 900)
```

Real-app winners per (source, direction):

```
from A:  left→B  right→·  up→·   down→C
from B:  left→·  right→C  up→·   down→C
from C:  left→B  right→·  up→B   down→·
```

Neither B nor C ever selects A. **Why:** B and C are closer to each other
than to A, and A only ever falls in a cone where the other of {B,C} is the
score-winner (from B, A is in the `right` cone but C beats it; from C, A is
in the `up` cone but B beats it). A is *shadowed from every direction*.

This is the general failure mode: a node loses every cone it appears in to a
nearer / more-on-axis competitor. Cones tile the full 360°, so every node is
*in* some cone from every other — but being in a cone is not being its
winner.

## How often

Exact simulation (replica of the scoring, scale-invariant so it matches the
app), 200k random clouds of 3–17 nodes:

- **~0.77% of layouts have ≥1 unreachable node.**
- The **45° cone did not make this worse** than the old permissive
  half-plane gate (0.77% vs 0.77%) — unreachability is inherent to
  "nearest-in-cone" navigation, independent of the gate. The cone fix
  (da-88) only changed *which* node wins, not the reachability structure.

Scripts: `scratchpad/reach.js` (sweep), `minimize.js` (minimal example),
`compare.js` (gate comparison) — throwaway, not committed.

## Does it matter in practice?

Not fatally: move-by-node is a fast path, not the only one. A node
unreachable by directional jumps is still reachable by **free crosshairs
movement** (arrow keys move the crosshairs continuously — land next to the
node and press toward it, nothing shadows it at close range), the **`/`
in-graph search**, and the **Go / nav popup**. So the user is never stuck.

## If we want move-by-node itself to reach everything

Options, in rough order of interaction cost (none built — Ben's call):

1. **Repeated-press cycling.** Pressing the same direction again cycles to
   the *next* candidate in that cone (by score) instead of re-selecting the
   winner; reset on any other movement. In the example, from B: right→C,
   right→A. This makes every in-cone node reachable, so every node gets an
   in-edge → strong connectivity. Cost: a second right-press no longer means
   "go right again from the new spot"; needs the graph-nav "next candidate"
   idiom.
2. **Widen the cone toward the whole half-plane** on a repeat/modifier, so a
   press can escape a local shadow. Weaker guarantee than (1).
3. **Accept the limitation** and lean on free movement + search (status quo).

Recommendation: (3) unless Ben finds it annoying in real use; (1) is the
principled fix if so.
