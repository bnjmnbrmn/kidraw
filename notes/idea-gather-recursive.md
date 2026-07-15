---
title: Gather feature — recursive, with push-away
type: idea
---

# Gather feature

The current `gather` ( `g → h` ) animates immediate connected nodes close to the current node, restoring after 5 s or on next gather. It's useful but limited.

Wanted:

- **Recursive at least one level deeper** — gather neighbours-of-neighbours when the immediate set is small.
- **Push away.** When pulling neighbours in, push *other* nodes out of the way so the gathered set is actually visible. Today nearby unrelated nodes can occlude.
- **General layout application.** Gather is one specialised layout; the underlying primitives (force-directed, push-away) should be reusable as a "layout this subgraph" operation.

## Focus distance feels wrong (Ben, 2026-07-13)

"They may be being brought too close in, or something." Where the numbers
live today (`drawing-area.component.ts`):

- **Plain Gather** (`f → h`): fixed `GATHER_RADIUS = 150`, measured
  center-to-center, box-blind. Two wide fit-mode cards (todo graph) at 150px
  centers *overlap*; edge labels between anchor and children have no
  reserved space at all. This is almost certainly the "too close" feeling.
- **Gather All** (`f → a`): `RING_SPACING = 170` / `MIN_ARC = 130`, ring
  radii widened by summed arc footprints — box-aware along the ring but the
  **radial gap is still center-to-center**, so tall/wide boxes eat the 170
  and adjacent rings crowd.

Direction: measure spacing as **clear gap between box perimeters**, exactly
like the tree layout's content-aware depth spacing (levels separated by the
tallest box + corridor). Minimum first-ring radius = anchor half-diagonal +
child half-diagonal + label band (~one label height + margin) + breathing
room. Prefer "readable at current zoom" over "as compact as possible" — the
point of gathering is to *look at* the children.

## Implemented 2026-07-14 (`06c0086`, refined `fe920b6`): Gather Around

"Gather All" is now **Gather Around**, and after one dogfooding round it is
deliberately *shallow*: the anchor's **immediate children line up in a
clean column just right of it** (perimeter-gapped stack, vertically
centered, pre-gather relative order kept for spatial memory), the
**ancestor chain** pulls into a line on the left, and **grandchildren stay
where they are** — Ben: "I don't want the grandchildren getting in the
way." The first iteration fanned all descendants into a wide radial wedge;
the deep rings crowded the view and were dropped the same day. In/out
separation now falls straight out of the geometry (incoming from the left,
outgoing to the right). Machinery kept: `collectGatherTree` (directional
BFS with exclusion set) + `placeGatherTree` (wedge/ring placement, now
ancestor-side only) + new `placeChildColumn`. Verified visually on the
typed next graph (`/shots/…-next-typed` gather views).

**Gather now routes** (2026-07-14 `c335db6`): every edge touching a
gathered node is re-routed with the incremental router once the placement
tweens land, so nothing runs behind nodes in the gathered view; Ungather
restores the exact pre-gather control points. Ben's "balance further-apart
vs waypoints" framing: gather chose waypoints (positions are temporary
anyway); layouts choose distance first (level-gap widening) with routing as
the follow-up for non-tree edges.

Still open from the sections below: push-away of unrelated nodes (a
non-participant sitting where the column lands can be occluded),
nav-corridor reservation, recursive plain-gather, whether diamonds'
pointed corners need extra stack gap in the column, and Ben's
**children-along-a-curve** idea for when the column outgrows the viewport.

## Two gathers is one too many (Ben, 2026-07-15)

Ben: "We have both 'Gather' and 'Gather Around'. Not sure what the
difference is, or which I actually want." After `ee0e3ea` the two are
nearly identical — both place children in a right column and
parents/ancestors on the left; the only real differences are **(a)** plain
Gather auto-restores after 5 s while Gather Around persists until
Ungather, and **(b)** Gather takes one level of parents, Gather Around
takes the whole ancestor chain (wedge). When the difference needs a diff
to explain, the split has stopped earning its two keys. **Direction:
merge into a single persistent Gather** (toggle: re-press = ungather;
keep `u` Ungather as the explicit escape). Depth can become a modifier or
repeat-press deepening later.

## Gathered = ungathered, sucked in (Ben, 2026-07-15)

The post-gather edge routing reads as wonky — "too much trying to get
around having connection points too close together." The column layout
manufactures the problem: it discards the neighborhood's original
geometry, packs connection points into a dense stack, and then asks the
router to untangle what the placement tangled.

Ben's stated intent: "I want the gathered layout to more clearly be
ungathered layout, but sucked in." That suggests **radial compression
(fisheye), not re-layout**: keep every gathered node at its original
bearing from the anchor and compress its distance (with perimeter-gap
floors so boxes never collide). Because angles are preserved,
**edge control points can be transformed by the same mapping** — the
wiring keeps its familiar shape, just pulled in, and the incremental
re-route becomes a fallback rather than the default. Spatial memory
survives by construction, and the in/out separation of the current
columns is traded for recognizability.

Companion UI idea (Ben): make the gathered state *visible* — style the
gathered subgraph (e.g. enlarge gathered nodes / thicken their edges,
dim non-participants, plus a header chip like the LABEL EDIT badge) so
"gathered in" never gets mistaken for the real layout.

## Implemented 2026-07-15 (`542b7f6`, `746dce6`): fisheye + stacks + auto-gather

Ben's spec (2026-07-15, refining the sections above): all neighbors —
incoming and outgoing — visible but not too close; near-strangers pushed
away so proximity means neighborship; crowds stack up (nav-next node and
its nearest siblings stay clear; different types in different stacks;
in vs out never mixed); stacked-edge labels show only the top one plus an
"…other labels…" indicator in an alternate font that must not occlude it;
stack offsets small and capped ("50 should look pretty much the same
as 3"). Plus (mid-session): drop the temporary Gather entirely and make
gathering automatic in the move-by-graph submenu, re-anchoring to
whatever the traversal is at, with attention to performance.

**Meta-node/meta-edge representation (Ben, 2026-07-15 evening).** Two
attempts at per-edge arrowhead visibility (offset lanes; 45° diagonal
cascade + edges raised above the sheets) still didn't read as N edges —
overlapping arrowheads never do. Ben's call: "a box around the stack and
have the edges go into/come out of it. Sort of a meta-node… maybe a
similar sort of meta-edge." Now: each pile gets a dashed rounded
container around the cascade, its member edges hide entirely, and one
thick gray meta-arrow runs anchor ↔ container (direction = the pile's
direction, gray = the established meta color of the badges/markers),
carrying the top label + "…K more labels…" on opposite sides; ×N badge
at the container corner. Possible future: meta-node as a real
interactive node (traverse into a pile = expand it), meta-edge for
parallel edge bundles outside gather.

Shipped as: `gather-fisheye.ts` planner (bearing-preserving isotonic
angular packing onto a perimeter-gap ring; stacks grouped by
direction+kind with protected members; cascade capped at 3 visible
levels) + one persistent Gather (`f→h` toggle, `f→u` Ungather;
GATHER_DESCENDANTS removed). Anchor↔neighbor wiring transforms by the
same rotate+scale as the node (the sucked-in look); stack edges go
straight (a pile reads as one bundle); everything else re-routes
incrementally behind a 250 ms debounce. Holding `f` auto-gathers and
re-anchors per node landing (GRAPH_NAV_EXIT restores unless pinned —
pressing Gather over an auto-gather pins it). Screenshots:
`/shots/2026-07-15-1211-gather-fisheye/`.

**Still open:**
- Anchor on node-like stops: Ben wants labels/waypoints as gather anchors
  too (gather the stop's edge endpoints?); today only node landings
  re-anchor.
- Performance beyond the debounce: precompute neighbor plans in a worker
  while resting on a node; diff-based re-gather (only move what changes
  between consecutive anchors) instead of restore-then-gather; a
  "gathering…" spinner if routing ever gets slow.
- Pushed strangers can pile up on the clear-radius circle (no overlap
  resolution on the pushed set).
- Gathered-state styling (dim non-participants, header chip) — the
  cascade piles signal stacking, but nothing yet marks "this whole view
  is temporary".

## Nav-aware gathering (Ben, 2026-07-13)

Gather is entering the traversal loop (hold `f` → gather while navigating),
and the two features currently ignore each other:

- **Corridor reservation.** When an edge has navigation focus
  (`DAEdge.navFocused`), gathered nodes and their edges should be nudged
  *out of a corridor* along the focused edge — otherwise a big fan buries
  the very edge the user is about to follow under near-parallel siblings.
  Concretely: when assigning wedges, subtract a reserved wedge around the
  nav edge's departure bearing (say ±20°) and distribute children over the
  remainder; or post-pass, push gathered boxes/edges to
  `NAV_FOCUS_UNDERLAY_WIDTH`-plus clearance from the focused edge's path.
- **Candidate legibility.** The `j`/`k` clockwise cycle order is only as
  visible as the fan is separated; gathering should *increase* angular
  separation of the anchor's outgoing edges, not preserve the original
  cramped bearings. (Tension with wedge-stability — children staying near
  their original bearing — resolve in favor of legibility while gathered,
  since Ungather restores truth.)
- Once gathered nodes sit close to the anchor, the traversal direction
  metric may want **bearing-to-endpoint** instead of departure tangent —
  this is exactly the held-open part of decision Q1; the metric is the
  single swappable `endpointFlowDirection` in `graph-nav.ts`.
