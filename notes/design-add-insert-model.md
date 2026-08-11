---
title: a = add (structure), i = insert (text) — ghost-directed add flow
type: proposal
status: implemented — ghost-target revision folded in, 2026-08-09
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

A tap uses the same context directly: node → self-loop, bare edge → new
label followed immediately by Insert mode, blank canvas (or a waypoint) →
new default node followed by Insert mode. A label already under the
crosshairs remains an edit target rather than receiving another label.

## New-node edit focus

As of 2026-07-27, entering label edit after adding a labelable node also
centers that node in the viewport and raises the drawing to at least 100%
zoom. A view already closer than 100% is not zoomed out. This applies to
empty-canvas tap-add, grow ghost/type placement, and insert-hub additions.

For held insert-hub additions, the focus is deliberately deferred until the
add key is released: the optional `hjkl` drag establishes the node's final
position first, then that position is centered and label editing begins.
Junction/invisible additions remain non-editable and unfocused. Editing an
existing node does not recenter or change zoom.

## The grow flow (hold `a` over a node) — augmented Move by Node

Connecting to an *existing* node feels like **navigation by node**, not
magnet-dragging. The same target tier now includes visible insertion ghosts:

1. **Press and release over a node:** add a self-loop using the current edge
   defaults. The initial preview is the loop itself.
2. **On hold: augmented targeting mode.** `hjkl` runs the actual **Move by
   Node** engine (active spatial strategy, overlay, crosshair landing,
   viewport pan, same-direction run, and turn re-origin behavior) over both
   real nodes and insertion ghosts. Ghosts come from two deterministic
   families:
   - the midpoint from the source node under the crosshairs to every other
     node whose box intersects the current viewport (unless it exactly
     coincides with a real node center); other-node pairs never create ghosts,
     and offscreen nodes still occupy their positions without creating a
     cloud of midpoint targets; and
   - the source node's horizontal and vertical lanes on the current major
     drawing grid. Lane spacing is a whole number of major cells and never
     tighter than the established 300-unit add slot. Candidates cover the
     viewport plus one step for edge-pan navigation.

   The two families are deliberately distinguishable without relying on
   opacity alone: midpoint ghosts use a longer dash and a `½` mark, while
   source-grid ghosts use a dotted outline and a `+` mark.

   Release on a real node → edge anchor→target, normal mode. Release on a
   ghost → default node at that exact landing + edge + labelEdit insert mode.
3. **Explicit typed-node mode remains available:**
   **hold `f` while `a` is held** → the **node-type popup** opens (reuse
   `NavPopupComponent`): `j`/`k` move the highlight, plain typing filters,
   and **releasing `f` selects the highlighted type** — the same
   hold-browse-release rhythm as the Go popup. Types are identity-defined
   node kinds carrying shape/color/style (extension node-kinds slot; e.g.
   todo-graph Task/Category/…; plain graphs the raw shapes; Ben's da-51
   idea). On selection the ghost node appears at the **default spot: one
   slot directly right of the anchor**, wired per the current `o` state;
   `hjkl` then adjusts placement (first press per direction = cardinal
   slot throw, further presses = grid steps). Release `a` → node + edge +
   labelEdit. Releasing `a` while a popup is open does **not** cancel
   (round 6): the flow goes sticky — popup resolves, hjkl places, **Enter
   commits**, Esc cancels. With `a` still held the release-to-commit rhythm
   applies unchanged. Replaces the post-insert drag phase.

   **Placement rule (round 5, build-and-feel):** the *first* directional
   press replaces the right-of-anchor default with a rough slot throw in that
   direction; *every* subsequent press is a grid-step drag; the standard
   movement tiers apply — `s`+hjkl coarse (slot-sized, the "re-rough"
   escape hatch), `d`+hjkl fine. Ben unsure yet; ship this and let the
   hands vote — it's tuning, not architecture.
4. **`/` opens the fuzzy popup** (reuse `NavPopupComponent` filter mode) in
   either sub-mode to pick a far-away existing target by label.
5. **`o` cycles directionality — all four states** (anchor→target,
   target→anchor, undirected, bidirectional), tappable at any point in any
   sub-mode; ghost arrowheads show the current state. (Case 14 settled.)
6. **No dedicated cancel key (round 6; `q` rejected).** The `a` hold is an
   accelerator, not a requirement: once a popup opens, `a` has naturally
   been released (typing needs both hands) and the flow turns **sticky** —
   the popup carries it, **Enter commits, Esc/`ctrl-[` cancels** (the
   sticky-persistence idea from `discussion-interaction-surfaces.md`).
   While still held: release with the target hopped back onto the anchor =
   no-op ("come home to cancel"); otherwise release commits and `u` undoes.
   Mode transitions stay
   confirmation-driven (the 07-18 `node-inserted` machinery) so a cancel
   never strands in labelEdit.

Consequence: existing↔existing and existing→new connections share one
spatial gesture, so
the old `s`+direction edge picker retired when this landed. A smaller
`s` **Edge...** submenu returned on 2026-08-07 for edge kinds that grow
targeting cannot express; its first action is `l` **Self Loop**. The
drawing-area owner records physical overlap for this chord: if `l` rolls down
just before `s`, releasing `l` still commits Self Loop instead of leaving the
temporary rightward target hop as an ordinary edge. The Edge surface is also
sticky once opened: releasing Add before tapping `l` leaves it open, with Esc
as cancel. From blank-canvas grow it is available for the sole selected node,
so Self Loop does not require moving the crosshairs back over that node.

Self-loop waypoints use the same editable control-point route as other edges.
The default loop's two bends are real waypoint-backed control points as soon
as the edge is created—there is no separate implicit route to materialize on
first insertion. Moving either handle reshapes the painted loop, and those
points persist in the file. Repeated self-loop creation on one node assigns
successively larger nested routes, each with its own independent handles.
Loading older loops upgrades both omitted defaults and saved plain bends into
explicit handles, so a self-loop never retains invisible control geometry.

## Cautions

- A new held-mode of graph-nav-like complexity. **Round-4 revision:** it
  must live **drawing-area-side** (like graph nav), not as keymenu submenu
  stack — the type popup opens mid-hold and suspends the keymenu, which
  flushes held-key bookkeeping, so the `a` hold has to be tracked by
  document-level keyup listeners with the Go popup's `holdKey` pattern.
  Suspension changes input ownership but not the keymenu's visual role: the
  keymenu renders a display-only card for targeting, popup selection, and
  placement, then restores Normal or Label Edit when ownership returns.
  Chord Bug B (order sensitivity) lurks near any held-key design. The Edge →
  Self Loop leaf/submenu roll is explicitly tolerated as of 2026-08-08, and
  the Edge surface remains sticky after Add is released; other held flows
  still follow their documented press order.
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
| 5 | tap `a` over nothing | quick-add node at crosshairs → center + zoom to ≥100% → labelEdit | ✅ built 2026-07-19; focus added 2026-07-27 |
| 6 | tap `a` over node | self-loop using current edge defaults | ✅ revised 2026-08-09 |
| 6b | tap `a` over edge/label | no-op + hint | ✅ built 2026-07-19 |
| 7 | hold `a` over node: real or ghost target | hjkl Move-by-Node navigation; real release connects, ghost release inserts linked default node + labelEdit | ✅ revised 2026-08-09 |
| 8 | hold `a` over node: `o` cycles 4 states | ghost arrowheads track | ✅ built 2026-07-19 |
| 9 | hold `a` over node: `/` search target | fuzzy popup by label (big graphs) | ✅ built 2026-07-19 (sticky: Enter commits, Esc cancels) |
| 10 | hold `a` + hold `f` → node-type popup; release f selects; hjkl places; release a (or sticky Enter) commits | explicit typed-node alternative to direct ghost insertion | ✅ built 2026-07-19 (v1 list = raw shapes; node-kinds slot pending) |
| 11 | hold `a` over edge | add label / waypoint (current submenu) | keep for now; ghost-waypoint slide = later idea |
| 12 | hold `a` over label | treat as its parent edge | ? tentative |
| 13 | hold `a` over nothing | `f` type popup → free node ghost at crosshairs + hjkl placement; release `a` / sticky Enter commits | ✅ built 2026-07-19 |
| 14 | directionality in grow flow | `o` cycles 4 states (out/in/undirected/bidi), any time | ✓ settled round 4 |
| 15 | vim `I`/`A` positional variants for tap-`i` | — | deferred to label-edit overhaul |
| 18 | cancel semantics | no dedicated key: release-early/on-anchor = no-op, `u` after commit, Esc/`ctrl-[` in sticky (popup) phase where `a` is already released | ✓ settled round 6 |
| 19 | `v` submenu: `o` cycles directionality of selected edge(s) | built as 3-state (D→U→B); reversing an existing edge is a separate structural op, deferred | ✅ built 2026-07-19 (scope note) |
| 20 | placement rule in a+f mode | first press = rough slot throw, then grid steps; s/d tiers | ✅ built 2026-07-19 — awaiting Ben's feel |
| 16 | u/o connect modifiers (07-18 hub) | **retired 2026-07-20** — grow mode covers connecting; code + `CREATE_NEW_NODE_CONNECTED` deleted (in git history) | ✅ done |
| 17 | `s`+direction edge picker | **retired 2026-07-20** — superseded by grow targeting; `BEGIN_/SET_/FINALIZE_DIRECTED_EDGE` deleted (in git history). The `s` key returned 2026-08-07 as an Edge-kind submenu (`l` Self Loop), not as the old directional picker. | ✅ done |

## Staging

1. **Tap semantics**: cases 1–6 (small; independent of the grow flow).
2. **Grow flow, existing targets**: cases 7–8 — hjkl node-jump targeting,
   ghost edge, `o` flip, Escape cancel.
3. **Search targeting**: case 9 (popup reuse).
4. **New-node ghost**: case 10; retire cases 16–17.
5. **Edge/empty ghost refinements**: cases 11/13 revisit.
