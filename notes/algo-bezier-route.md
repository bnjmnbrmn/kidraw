# bezier-route (algorithm characterization)

Direct gradient-descent on a tiny set of Bezier control points (default
`maxControlPoints: 2`). The cost is a weighted sum of total curve length
(`lengthPenaltyK`) and inverse-square obstacle penalty
(`obstaclePenaltyK`). Renders as a smooth Catmull-Rom curve through the
optimised control points; sibling edges are seeded at perpendicular lane
offsets along the source/dest faces (canonical-perpendicular fix from
[`bug-bezier-antiparallel-overlap`](bug-bezier-antiparallel-overlap.md)).

Source: `src/app/drawing-area/bezier-route-edges.ts`

## Virtues

- Best round-2 performer overall: every scenario except `dense` rated 5.
- The hard cap of 2 control points structurally prevents wiggles — there
  simply aren't enough degrees of freedom for the curve to oscillate.
- Catmull-Rom rendering hides any small numerical jitter from
  optimisation.
- Sibling lane offsets applied at the endpoints (not as a chain-wide
  shift) means parallel edges fan out across the node face cleanly.

## Vices

- Round-2 `dense` r=4: *"this is pretty good, except that some of the
  intersections are too close together"*. That's a topological complaint
  — the gradient descent finds locally minimal routes but doesn't reason
  about how multiple edges' intersections cluster.

## Tuning knobs observed

From the header comments:

- `maxControlPoints` (default 2) — hard cap on bend complexity.
- `minImprovementPerPoint` (default 150) — MDL knob; controls when adding
  a control point pays off.
- `obstaclePenaltyK` (default 8) — inverse-square repulsion from
  non-incident node bboxes.
- `lengthPenaltyK` (default 1.0) — linear cost per pixel.
- `clearance` (default 18) — padding before obstacle penalty kicks in.
- `laneSpacing` (default 22) — perpendicular spacing between siblings.

## Sweep results

**Not swept this round.** Reasoning:

- The only sub-5 round-2 cell is `dense` r=4, and the complaint
  ("intersections too close together") isn't a wiggle issue and isn't
  controlled by any single tuning knob in the algorithm. The control-
  point optimiser is per-edge: it can't see that two edges' midpoints
  end up at the same screen location because each is locally optimal.
- Sweeping `clearance` could push edges apart globally, but at the cost
  of every edge bulging further from its ideal route, which would hurt
  the 5-rated cells. Net regression likely.

If a sweep is wanted later, the most defensible knob is `clearance`
(values: 12, 18 (default), 30, 48) on `dense` only — it's the closest
thing to a global "spread edges apart" lever.

## Recommended default

**No change.** bezier-route's round-2 average is the highest of the five
algorithms. The "intersections too close" complaint should be addressed
structurally (see Deferred), not by tuning.

## Deferred / structural issues

- **Intersection bundling.** Two edges that pass through the same screen
  region produce intersections that pile up. The fix is global: an
  orthogonal/polyline routing layer that's aware of the union of all
  edges' control polygons, rather than per-edge gradient descent. This
  is what libavoid does
  ([`research-libavoid-integration.md`](research-libavoid-integration.md)).
  Filing as a deferred algorithmic-improvement target; not a bug per se,
  just a known ceiling on the per-edge optimiser.
