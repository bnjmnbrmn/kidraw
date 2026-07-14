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

## Implemented 2026-07-14 (`06c0086`): Gather Around

"Gather All" is now **Gather Around**: descendants fan into a wide right
wedge (~200°), **ancestors** into a narrow left wedge (~80°), with clear
margins between the groups — so incoming and outgoing edges separate more
from each other than same-direction edges do (Ben's in/out separation
request, realized at the gather level). Shared machinery:
`collectGatherTree` (directional BFS, exclusion set so cycles can't put a
node in both groups) + `placeGatherTree` (ring radii sized against the wedge
span, not the full circle). Verified visually on the typed next graph
(`/shots/…-next-typed` gather views).

Still open from the sections below: perimeter-gap ring spacing (labels can
still overlap on crowded rings), push-away of unrelated nodes, nav-corridor
reservation, recursive plain-gather.

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
