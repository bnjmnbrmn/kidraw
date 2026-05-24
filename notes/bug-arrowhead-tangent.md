---
name: bug-arrowhead-tangent
description: Arrowheads on curved-rendering edges don't always visibly align with the curve's tangent at the endpoint
metadata:
  type: bug
  status: open
  surfaced-in: tools/routing-eval/feedback/feedback-20260524-075433-rms.json
  cells: bezier-fit-charged-spring|dense
---

# bug: arrowhead-tangent misalignment

## Symptom

Round-1 feedback on `bezier-fit-charged-spring|dense` (cell rated 1/5):

> Too wiggly. Also, I'm noticing that it looks like some of the arrowheads
> don't point along the tangent to the edge's curve.

Visible in `tools/routing-eval/runs/<round-1-timestamp>/bezier-fit-charged-spring/dense/routing.svg`.

## Where the rendering happens

Two arrowhead-rendering paths in the codebase:

1. **Production** — `src/app/drawing-area/da-edge.ts` (Konva `Arrow` shape;
   tension parameter controls smoothing).
2. **Harness** — `tools/routing-eval/harness/render-svg.mjs` (SVG `<path>`
   built via `buildSmoothPath`, terminated by an `L` segment from the last
   midpoint to the destination perimeter; arrowhead is an SVG `<marker
   markerEnd>` oriented `auto-start-reverse`).

The user rates the harness SVG, so the bug *at least* exists in the
harness path. Whether it also exists in production has not been verified.

## Suspected cause (harness)

`buildSmoothPath` in `render-svg.mjs` is a Catmull-Rom-ish approximation:
quadratic Béziers through midpoints, then a final straight `L` from the
last midpoint to the endpoint. The SVG arrowhead's `auto-start-reverse`
orient points along that final `L`, so its direction is
`(p[N-1] − midpoint(p[N-2], p[N-1]))`, i.e. along the chord of the last
polyline segment.

Konva's `Arrow` with `tension=0.5` uses a different smoothing — a true
Catmull-Rom-style spline whose tangent at the endpoint is computed from
the previous two control points and a virtual point past the endpoint.
The chord direction the harness uses can deviate noticeably from Konva's
true endpoint tangent when the polyline has a sharp last-segment angle
relative to its predecessor.

This is a hypothesis — needs validation by:
1. Loading the failing scenario in the live app and comparing arrowhead
   orientation against the harness SVG.
2. If they differ, fix the harness to match Konva's true tangent (or
   adopt Konva's exact Catmull-Rom formula).
3. If they match, the bug is shared and the production code needs the
   same fix.

## Why it's deferred (round 2 Phase A)

Three parallel Phase A agents were dispatched: bezier-route bugs (landed),
scenario re-spec (landed), arrowhead tangent (dispatched agent ran out of
session budget before producing work). Rather than redispatch and risk
the same budget exhaustion, the bug is captured here for round 3 — or
folded into the broader `idea-routing-auto-tune` work where Konva-vs-SVG
fidelity will need attention regardless.

## Acceptance criteria

- `bezier-fit-charged-spring|dense`'s SVG arrowheads visibly point along
  the curve's tangent (validated by side-by-side comparison with the
  Konva-rendered view).
- No regression on other algorithms' SVG arrowheads (polyline routers
  should still point along the last segment's direction; that case is
  not affected by the smoothing math).
