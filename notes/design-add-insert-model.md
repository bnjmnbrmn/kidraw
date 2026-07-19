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
   labelEdit. Releasing `a` while a popup is open does **not** cancel
   (round 6): the flow goes sticky — popup resolves, hjkl places, **Enter
   commits**, Esc cancels. With `a` still held the release-to-commit rhythm
   applies unchanged. Replaces the post-insert drag phase.

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
5. **No dedicated cancel key (round 6; `q` rejected).** The `a` hold is an
   accelerator, not a requirement: once a popup opens, `a` has naturally
   been released (typing needs both hands) and the flow turns **sticky** —
   the popup carries it, **Enter commits, Esc/`ctrl-[` cancels** (the
   sticky-persistence idea from `discussion-interaction-surfaces.md`).
   While still held: release before any keypress = no-op; release with the
   target hopped back onto the anchor = no-op ("come home to cancel");
   otherwise release commits and `u` undoes. Mode transitions stay
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
  Suspension changes input ownership but not the keymenu's visual role: the
  keymenu renders a display-only card for targeting, popup selection, and
  placement, then restores Normal or Label Edit when ownership returns.
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
| 1 | tap `i` over node | edit node text (vim insert) | ✅ built 2026-07-19 |
| 2 | tap `i` over label | edit label text | ✅ built 2026-07-19 |
| 3 | tap `i` over edge | edits its label; creates an empty one if none (built as such) | ✅ built 2026-07-19 |
| 4 | tap `i` over nothing | no-op + hint | ✅ built 2026-07-19 |
| 5 | tap `a` over nothing | quick-add node at crosshairs → labelEdit | ✅ built 2026-07-19 |
| 6 | tap `a` over node | **default quick-add**: node one slot below, anchor→new, labelEdit | ✅ built 2026-07-19 (= pristine grow release) |
| 6b | tap `a` over edge/label | no-op + hint | ✅ built 2026-07-19 |
| 7 | hold `a` over node: existing target | hjkl node-jump targeting + ghost edge | ✅ built 2026-07-19 |
| 8 | hold `a` over node: `o` cycles 4 states | ghost arrowheads track | ✅ built 2026-07-19 |
| 9 | hold `a` over node: `/` search target | fuzzy popup by label (big graphs) | ✅ built 2026-07-19 (sticky: Enter commits, Esc cancels) |
| 10 | hold `a` + hold `f` → node-type popup; release f selects; hjkl places; release a (or sticky Enter) commits | single new-node path | ✅ built 2026-07-19 (v1 list = raw shapes; node-kinds slot pending) |
| 11 | hold `a` over edge | add label / waypoint (current submenu) | keep for now; ghost-waypoint slide = later idea |
| 12 | hold `a` over label | treat as its parent edge | ? tentative |
| 13 | hold `a` over nothing | `f` type popup → free node ghost at crosshairs + hjkl placement; release `a` / sticky Enter commits | ✅ built 2026-07-19 |
| 14 | directionality in grow flow | `o` cycles 4 states (out/in/undirected/bidi), any time | ✓ settled round 4 |
| 15 | vim `I`/`A` positional variants for tap-`i` | — | deferred to label-edit overhaul |
| 18 | cancel semantics | no dedicated key: release-early/on-anchor = no-op, `u` after commit, Esc/`ctrl-[` in sticky (popup) phase where `a` is already released | ✓ settled round 6 |
| 19 | `v` submenu: `o` cycles directionality of selected edge(s) | built as 3-state (D→U→B); reversing an existing edge is a separate structural op, deferred | ✅ built 2026-07-19 (scope note) |
| 20 | placement rule in a+f mode | first press = rough slot throw, then grid steps; s/d tiers | ✅ built 2026-07-19 — awaiting Ben's feel |
| 16 | u/o connect modifiers (07-18 hub) | interim survivors; retire at stage 4 | transitional |
| 17 | `s`+direction edge picker | retire once 7 lands and proves out | transitional |

## Staging

1. **Tap semantics**: cases 1–6 (small; independent of the grow flow).
2. **Grow flow, existing targets**: cases 7–8 — hjkl node-jump targeting,
   ghost edge, `o` flip, Escape cancel.
3. **Search targeting**: case 9 (popup reuse).
4. **New-node ghost**: case 10; retire cases 16–17.
5. **Edge/empty ghost refinements**: cases 11/13 revisit.
