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
