---
title: Nav popup — IntelliJ-style go-to for graph traversal
type: idea
---

# Nav popup (Ben, 2026-07-15 23:41)

A pivot away from gather-based navigation ("the gathering and stacking
isn't quite what I had in mind, but the gathering is probably too slow
anyways"). The spec as given:

- On a node with a **single** incoming-or-outgoing edge, pressing `f`
  just takes you along that edge.
- With multiple options, a **popup** appears listing the directions you
  can go — like IntelliJ's *go to references*.
- The keymenu changes so you can **type into a search bar** on the popup
  and fuzzy-match; `Ctrl-n`/`Ctrl-p` or arrow keys move the selection.
- **Momentum**: traveling along outgoing edges, the popup's initial
  choices are outgoing edges; at a dead end you still get the popup even
  when going back the way you came is the only choice.

## Refinements proposed (Claude, same night)

- **Momentum-aware auto-advance.** "Single edge → just go" should count
  only *continue-direction* edges: walking a chain A→B→C, node B has one
  outgoing and one incoming (the edge you rode in on) — auto-advance to C
  is clearly right, so the rule is *exactly one candidate in the momentum
  direction → take it; otherwise popup*. Dead end (zero forward) → popup
  with the reverse options, per Ben's spec. Cold start (no momentum):
  outgoing counts as forward.
- **Row content**: direction glyph (→/←), destination node label, edge
  label(s), edge kind tag. Fuzzy match over all of them — labels finally
  earn their keep in navigation. Sort: forward edges first, then a
  divider, then reverse; within a group, fuzzy score, then clockwise
  bearing for stability.
- **Preview highlight**: moving through the list gives the corresponding
  edge the existing `navFocused` glow so the popup and canvas stay one
  thing.
- **Commit = jump**: recenter view + crosshairs onto the destination
  (reuse `centerViewOnLayerPoint`), update momentum. Escape cancels.
  Possible **walk mode**: commit with `f` (instead of Enter) keeps the
  popup open and refreshes it at the landing node, so `f`-`f`-`f` chains
  through the graph with choices visible the whole way.
- **One reusable widget.** An HTML overlay (not Konva): absolute-
  positioned Angular component with a text input + list. The exact same
  component is what Vault Open / Save As need (today: `window.prompt`
  placeholders), what in-graph search wants, and what the command palette
  (docs/command-surface-plan.md) is waiting on. Build once, wire four
  places.
- **Keymenu**: a popup mode alongside labelEdit — printable keys go to
  the search box, `Ctrl-n/p`, arrows, Enter, Escape handled by the popup;
  the visual keyboard dims or shows popup keys. `f` becomes a tap action
  at root (the hold-`f` move-by-graph submenu with n/p/j/k, tiers, and
  stop-walking retires — labels/waypoints as traversal stops go with it;
  destination-oriented jumping replaces them).

## What happens to gather

- Auto-gather during navigation: **off by default** as of this note
  (`autoGatherEnabled = false`); the popup replaces its purpose (seeing
  your options) at zero layout cost.
- Explicit Gather (`f→h` today; will need a new key once `f` is a tap) /
  Ungather stay as a view command.
- The fisheye planner + meta-node/meta-edge work is not navigation
  machinery anymore — it's the seed of a **collapse/expand** feature
  (pile as interactive meta-node), tracked separately.

## Open questions

1. Auto-advance rule: momentum-direction-only (recommended above), or
   strictly "one edge total"?
2. Walk mode (popup stays open across jumps) — wanted in v1?
3. Where does the popup anchor — near the current node (IntelliJ-style at
   caret) or fixed at screen center/top?
4. Does `f` on empty canvas fall back to the traversal's last node
   (`graphNavLastNode`), like the anchor-recovery flow does today?
5. New home for Gather/Ungather bindings once the `f` submenu retires.
