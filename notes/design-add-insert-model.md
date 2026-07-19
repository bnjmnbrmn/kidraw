---
title: a = add (structure), i = insert (text) — ghost-directed add flow
type: proposal
status: converging — Ben's round-1 answers folded in, 2026-07-19
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

## The grow flow (hold `a` over a node) — targeting-first (round 2)

Ben's round-1 correction: connecting to an *existing* node should feel like
**navigation by node**, not magnet-dragging (magnet idea discarded). And the
build starts with the existing-target case even though new-node was the
original motivation. hjkl therefore has two meanings, switched by whether a
new node has entered the picture:

1. **On hold: targeting mode.** A target highlight starts at the anchor.
   `hjkl` hops it node-to-node (snap-to-node directional geometry); a live
   ghost edge from anchor to the highlighted target updates each hop.
   Release `a` → edge anchor→target, stay in normal mode.
2. **Pressing a shape key (`d/c/e/g/x`) converts to new-node mode**: a
   ghost node appears (momentum-direction slot ~300u, else right, identity
   default shape unless the pressed key says otherwise) and from then on
   `hjkl` nudges the ghost spatially (first press per direction = cardinal
   slot throw, further presses = grid steps). Release → node + edge +
   labelEdit. Replaces the post-insert drag phase (position before commit).
3. **`/` opens the fuzzy popup** (reuse `NavPopupComponent` filter mode) in
   either sub-mode to pick a far-away existing target by label.
4. **`o` flips the edge direction** (anchor→target vs target→anchor) in
   either sub-mode; ghost arrowhead shows it.
5. Hold-and-release with no keypress = no-op (consistent with tap-`a` over
   a node being a no-op). **Escape** while held cancels. Mode transitions
   stay confirmation-driven (the 07-18 `node-inserted` machinery) so a
   cancel never strands in labelEdit.

Consequence: existing↔existing connection is the primary gesture here, so
the `s`+direction edge picker retires once this lands.

## Cautions

- A new held-mode of graph-nav-like complexity. Build it inside the keymenu
  submenu framework (leaf actions steer the ghost) so I1–I3 invariants hold.
  Chord Bug B (order sensitivity) lurks near any held-key design.
- Two-hands rule (07-18): held `a` is left-hand; hjkl steering right-hand ✓;
  shape keys are left-hand next to held `a` ✓ (same-hand but reachable, as
  the old a-submenu was).

## Case ledger

The tracking table for every context × gesture case. **Status:** ✓ decided /
→ build stage / ? open. Update this as decisions land — it is the canonical
list Ben asked to keep track of.

| # | Case | Behavior | Status |
|---|------|----------|--------|
| 1 | tap `i` over node | edit node text (vim insert) | ✓, stage 1 |
| 2 | tap `i` over label | edit label text | ✓, stage 1 |
| 3 | tap `i` over edge | edit its label; create empty one if none? | ? detail open |
| 4 | tap `i` over nothing | no-op + hint | ✓, stage 1 |
| 5 | tap `a` over nothing | quick-add node at crosshairs → labelEdit | ✓ ("sure, let's try") |
| 6 | tap `a` over node/edge/label | no-op + hint (no accidental growth) | ✓ |
| 7 | hold `a` over node: existing target | hjkl node-jump targeting + ghost edge | ✓, **stage 2 (build first of the grow flow)** |
| 8 | hold `a` over node: `o` direction flip | ghost arrowhead flips | ✓, stage 2 |
| 9 | hold `a` over node: `/` search target | fuzzy popup by label (big graphs) | ✓, stage 3 |
| 10 | hold `a` over node: shape key → new node | ghost node, hjkl nudges spatially | ✓, stage 4 (the original motivation, deliberately after 7) |
| 11 | hold `a` over edge | add label / waypoint (current submenu) | keep for now; ghost-waypoint slide = later idea |
| 12 | hold `a` over label | treat as its parent edge | ? tentative |
| 13 | hold `a` over nothing | free node ghost + hjkl nudge | later; tap-`a` (5) covers the quick case |
| 14 | undirected/bidirectional edges in grow flow | third `o` state vs style-submenu-after | ? open |
| 15 | vim `I`/`A` positional variants for tap-`i` | — | deferred to label-edit overhaul |
| 16 | u/o connect modifiers (07-18 hub) | interim survivors; retire at stage 4 | transitional |
| 17 | `s`+direction edge picker | retire once 7 lands and proves out | transitional |

## Staging

1. **Tap semantics**: cases 1–6 (small; independent of the grow flow).
2. **Grow flow, existing targets**: cases 7–8 — hjkl node-jump targeting,
   ghost edge, `o` flip, Escape cancel.
3. **Search targeting**: case 9 (popup reuse).
4. **New-node ghost**: case 10; retire cases 16–17.
5. **Edge/empty ghost refinements**: cases 11/13 revisit.
