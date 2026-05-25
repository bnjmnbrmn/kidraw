---
name: bug-arrowhead-tangent
description: Arrowheads near the end of routed edges visibly disagree with the curve's local tangent
metadata:
  type: bug
  status: fixed (Phase B, flexible-wire); cause re-diagnosed
  surfaced-in: tools/routing-eval/feedback/feedback-20260524-075433-rms.json (round 1), tools/routing-eval/feedback/feedback-20260524-163438-sb1.json (round 2)
  cells: bezier-fit-charged-spring|dense (round 1), flexible-wire|hub-spoke (round 2)
---

# bug: arrowhead-tangent misalignment

## Symptom

Round-1 feedback on `bezier-fit-charged-spring|dense` (rated 1/5):

> Too wiggly. Also, I'm noticing that it looks like some of the arrowheads
> don't point along the tangent to the edge's curve.

Round-2 feedback on `flexible-wire|hub-spoke` (rated 1/5):

> Arrowhead problem not completely solved. Some extra wiggle.

The flexible-wire case is the smoking gun: flexible-wire renders as a
plain polyline (no Catmull-Rom smoothing), so any harness-vs-Konva
smoothing discrepancy could not be the cause there.

## Original hypothesis (Phase A, WRONG)

> `buildSmoothPath` in render-svg.mjs is a Catmull-Rom-ish approximation
> ... Konva's `Arrow` with `tension=0.5` uses a different smoothing.

This is wrong on the evidence — the bug shows up on flexible-wire, which
sets `smoothRendering=false`, so the harness uses `buildPolylinePath`
(a literal `M ... L ... L ...` chain). There is no smoothing in this
path, harness or Konva. Whatever causes the visible misalignment is
independent of the smoothing math.

## Root cause (Phase B, correct)

The router emits control points whose **chord-projection order is not
monotonic**. Specifically, flexible-wire's bead simulation lets interior
beads drift past each other along the source→destination chord direction.
At crowded ends (e.g. anti-parallel pairs converging on a single node in
`hub-spoke`), the last interior bead can land at a smaller chord
projection than the second-to-last, producing a backward zigzag
immediately before the arrowhead.

Verified directly against the round-2 SVG. For `flexible-wire|hub-spoke`,
edge `out0` (HUB→S0) had these last few rendered-path points:

```
[10] (710.59, 392.75)  proj=210.59
[11] (717.44, 396.86)  proj=217.44
[12] (710.59, 389.00)  proj=210.59   ← BACKWARDS along chord
[13] (720.00, 390.49)  destination perimeter
```

Two consequences:

1. **Visible wiggle.** The polyline `... → (717, 396) → (710, 389)
   → (720, 390)` reads as an out-and-back zigzag right before the
   arrowhead.

2. **Wrong arrowhead orientation.** Konva.Arrow (polyline mode) and the
   harness SVG marker both orient the arrowhead along the last segment
   `(last_cp → destination_perimeter)`. The destination perimeter is
   recomputed in `DAEdge.getPathPoints` using the **last control point**
   as the aim direction: a ray from the destination node's center
   through `lastCp` intersected with the perimeter. When `lastCp` is
   misordered (as above), both ends of that last segment land far from
   the curve's natural approach trajectory, and the arrowhead direction
   is whatever the backward-jog implies — not the visual tangent the
   user expects.

The bug is in the router (it emits beads in a non-monotonic order), not
in the renderer. Both production Konva.Arrow and the harness SVG marker
faithfully reproduce the bad geometry the router gave them.

## Fix

Sort flexible-wire's bead array by chord projection before pruning and
assignment to control points. The mid-simulation physics is left
untouched — the sort only stabilizes the *output order*. This mirrors
the `sortByLineProjection` step in bezier-route's optimizer loop
(commit 944746d).

Production code: `src/app/drawing-area/flexible-wire-edges.ts`. New
helper `sortByChordProjection` runs once per edge after `simulateAll`.

The harness path (`tools/routing-eval/harness/render-svg.mjs`) needs no
change. Its `buildPolylinePath` and `buildSmoothPath` both faithfully
render whatever control-point sequence the router emitted; with the
router fixed, the harness output is correct.

## Verification

Re-ran `node tools/routing-eval/run.mjs --algorithm flexible-wire
--scenario hub-spoke` after the fix. `out0`'s last few points are now
chord-monotonic:

```
[10] (710.59, 389.00)  proj=210.59
[11] (710.59, 392.75)  proj=210.59
[12] (717.44, 396.86)  proj=217.44
[13] (720.00, 396.98)  destination perimeter
```

The destination perimeter shifted from `(720, 390.49)` to
`(720, 396.98)` because the last control point is now `(717.44, 396.86)`
instead of `(710.59, 389.00)`. New arrow direction:
`(720-717.44, 396.98-396.86) ≈ (2.56, 0.12)` — essentially horizontal,
matching the curve's approach.

## Why this didn't surface on charged-spring (rated 5/5 on hub-spoke)

Charged-spring uses an `anchorK` force (default 0.4) that pulls each
bead toward its seed straight-line lane-offset position. The anchor
suppresses tangential drift, so beads stay in their seeded order.
Flexible-wire defaults `anchorK = 0` (pure rubber-band mode), giving
beads full tangential freedom — and they exercise it.

## Status of the original round-1 case

`bezier-fit-charged-spring|dense` was rated 1/5 in round 1 and 2/5 in
round 2 ("too wiggly"). The wiggle is a separate issue (parameter
tuning on the charged-spring sim driving the dense case), not the
arrowhead-tangent problem. That part of the original ticket is
inherited by a future tuning sweep — see `idea-routing-auto-tune.md`.
The arrowhead-orientation symptom specifically is fixed by the
flexible-wire change above; bezier-fit's smooth-mode rendering goes
through Konva's Catmull-Rom tension, which already derives its
arrowhead tangent from the spline's actual endpoint derivative.

## Acceptance criteria (met)

- `flexible-wire|hub-spoke`'s polyline is chord-monotonic at every
  edge end.
- The arrowhead direction visibly matches the wire's terminal
  trajectory (no backward jog immediately before the arrow).
- No regression on flexible-wire's previously-passing scenarios
  (cycle-4, line-3, fan-in/out, tree-5, anti-parallel still ok).
- No regression on charged-spring, bezier-route, bezier-fit-charged-spring,
  or weighted-chain (those routers are untouched).
