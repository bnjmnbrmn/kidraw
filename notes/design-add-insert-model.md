---
title: a = add (structure), i = insert (text) — ghost-directed add flow
type: proposal
status: discussion with Ben, 2026-07-19
---

# a = add, i = insert: the ghost-directed add flow

Proposal from the 2026-07-19 design session, after the 07-18 unified-hub
experiments. Supersedes the direction of `design-insert-hub-drag.md` if
adopted. Prior art: `discussion-interaction-surfaces.md` (why one held-chord
grammar strains), `decision-interaction-model.md` (the original Add+Drag-on-f
model Ben partly liked; its weakness was blind direction commitment).

## The split

- **`i` (tap) = insert text.** Enter label edit (vim insert mode) on the
  thing under the crosshairs: node → its label; label → itself; edge → its
  label (created empty if none); nothing → hint. `i` never grows the graph.
- **`a` (held) = add structure.** Context-dependent, commit-on-release:
  - over a **node** → the grow flow (below);
  - over an **edge** → add label / waypoint (label treated as its edge);
  - over **nothing** → free node ghost at the crosshairs.

## The grow flow (hold `a` over a node)

Holding `a` shows a translucent **ghost node + ghost edge** (nav-popup ghost
rendering) anchored at the node. Steer, then release to commit:

- **Placement**: ghost starts one slot (~300u) in the momentum direction
  (graph-nav heuristic), else right. `hjkl`: first press throws to that
  cardinal slot, further presses nudge by grid steps. Fixes the old f-flow's
  blind direction pick — you see placement before committing. Replaces the
  post-insert drag phase (position before commit, not after).
- **New vs existing is where the ghost is**: near an existing node the ghost
  **snaps onto it** (magnet) — ghost node hides, ghost edge retargets;
  release adds just the edge. For far targets, a keystroke opens the fuzzy
  popup (reuse `NavPopupComponent` filter mode) to pick by label. No modal
  new-vs-existing question.
- **Shape**: identity default (todo → box); `d/c/e/g/x` restyle the ghost.
- **Direction**: default anchor → new; `o` flips the ghost arrowhead.
- **Release `a`** commits (new node → labelEdit; existing → stay normal).
  **Escape** while held cancels. Confirmation-driven mode transitions (the
  07-18 `node-inserted` machinery) so cancel never strands in labelEdit.

Consequence: existing↔existing connection is the same gesture (ghost walked
onto the target), so the `s`+direction edge picker can retire later.

## Cautions

- A new held-mode of graph-nav-like complexity. Build it inside the keymenu
  submenu framework (leaf actions steer the ghost) so I1–I3 invariants hold.
  Chord Bug B (order sensitivity) lurks near any held-key design.
- Two-hands rule (07-18): held `a` is left-hand; hjkl steering right-hand ✓;
  shape keys are left-hand next to held `a` ✓ (same-hand but reachable, as
  the old a-submenu was).

## Staging

1. Tap-`i` semantics + over-node ghost, new-node placement only.
2. Magnet snap to existing nodes.
3. Fuzzy-popup targeting by label.
4. Edge-context ghost waypoint (hjkl slides t along the edge).

## Open forks (Ben to decide)

1. Ghost-commit-on-release vs keeping insert-then-drag.
2. Tap-`a` behavior: quick-add on empty canvas? no-op over node?
3. Magnet + popup + n/p cycling of nearby targets — all three or a subset?
4. Vim positional variants for `i` (I = insert at start, A = append) — now
   or with the label-edit overhaul?
5. Undirected/bidirectional edges in the grow flow — a third `o` state or
   leave to the style submenu afterwards?
