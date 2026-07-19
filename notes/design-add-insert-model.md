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
2. **Entering new-node mode (round 4 — single path, a-n dropped):**
   **hold `f` while `a` is held** → the **node-type popup** opens (reuse
   `NavPopupComponent`): `j`/`k` move the highlight, plain typing filters,
   and **releasing `f` selects the highlighted type** — the same
   hold-browse-release rhythm as the Go popup. Types are identity-defined
   node kinds carrying shape/color/style (extension node-kinds slot; e.g.
   todo-graph Task/Category/…; plain graphs the raw shapes; Ben's da-51
   idea). On selection the ghost node appears at the **default spot: one
   slot directly below the anchor**, wired per the current `o` state;
   `hjkl` then adjusts placement (first press per direction = cardinal
   slot throw, further presses = grid steps). Release `a` → node + edge +
   labelEdit. Releasing `a` while the popup is still open **cancels**
   everything — `a`-release only commits after the popup has resolved.
   Replaces the post-insert drag phase (position before commit).

   **Placement rule (round 5, build-and-feel):** the *first* directional
   press replaces the below-anchor default with a rough slot throw in that
   direction; *every* subsequent press is a grid-step drag; the standard
   movement tiers apply — `s`+hjkl coarse (slot-sized, the "re-rough"
   escape hatch), `d`+hjkl fine. Ben unsure yet; ship this and let the
   hands vote — it's tuning, not architecture.
3. **`/` opens the fuzzy popup** (reuse `NavPopupComponent` filter mode) in
   either sub-mode to pick a far-away existing target by label.
4. **`o` cycles directionality — all four states** (anchor→target,
   target→anchor, undirected, bidirectional), tappable at any point in any
   sub-mode; ghost arrowheads show the current state. (Case 14 settled.)
5. Hold-and-release before any keypress commits nothing. **`q` cancels**
   at any later point (round 5: Esc is unreachable while the left pinky
   holds `a`; `q` is one row up, "quit"). Mode transitions stay
   confirmation-driven (the 07-18 `node-inserted` machinery) so a cancel
   never strands in labelEdit.

Consequence: existing↔existing connection is the primary gesture here, so
the `s`+direction edge picker retires once this lands.

## Cautions

- A new held-mode of graph-nav-like complexity. **Round-4 revision:** it
  must live **drawing-area-side** (like graph nav), not as keymenu submenu
  stack — the type popup opens mid-hold and suspends the keymenu, which
  flushes held-key bookkeeping, so the `a` hold has to be tracked by
  document-level keyup listeners with the Go popup's `holdKey` pattern.
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
| 6 | tap `a` over node | **default quick-add**: default-type node one slot below the anchor, anchor→new edge, labelEdit (round 4) | ✓, stage 1 |
| 6b | tap `a` over edge/label | no-op + hint | ✓ |
| 7 | hold `a` over node: existing target | hjkl node-jump targeting + ghost edge | ✓, **stage 2 (build first of the grow flow)** |
| 8 | hold `a` over node: `o` direction flip | ghost arrowhead flips | ✓, stage 2 |
| 9 | hold `a` over node: `/` search target | fuzzy popup by label (big graphs) | ✓, stage 3 |
| 10 | hold `a` + hold `f` → node-type popup; release f selects; hjkl places; release a commits | single new-node path (a-n dropped, round 4) | ✓, stage 4 (needs node-kinds slot; raw shapes as fallback list) |
| 11 | hold `a` over edge | add label / waypoint (current submenu) | keep for now; ghost-waypoint slide = later idea |
| 12 | hold `a` over label | treat as its parent edge | ? tentative |
| 13 | hold `a` over nothing | free node ghost + hjkl nudge | later; tap-`a` (5) covers the quick case |
| 14 | directionality in grow flow | `o` cycles 4 states (out/in/undirected/bidi), any time | ✓ settled round 4 |
| 15 | vim `I`/`A` positional variants for tap-`i` | — | deferred to label-edit overhaul |
| 18 | cancel key while grow mode held | `q` (Esc unreachable during the a hold) | proposed round 5, awaiting Ben's ok |
| 19 | `v` submenu: `o` cycles directionality of selected edge(s) | same 4-state cycle as the grow flow | ✓ round 5, stage 1 |
| 20 | placement rule in a+f mode | first press = rough slot throw, then grid steps; s/d tiers for coarse/fine | proposed round 5, build-and-feel |
| 16 | u/o connect modifiers (07-18 hub) | interim survivors; retire at stage 4 | transitional |
| 17 | `s`+direction edge picker | retire once 7 lands and proves out | transitional |

## Staging

1. **Tap semantics**: cases 1–6 (small; independent of the grow flow).
2. **Grow flow, existing targets**: cases 7–8 — hjkl node-jump targeting,
   ghost edge, `o` flip, Escape cancel.
3. **Search targeting**: case 9 (popup reuse).
4. **New-node ghost**: case 10; retire cases 16–17.
5. **Edge/empty ghost refinements**: cases 11/13 revisit.
