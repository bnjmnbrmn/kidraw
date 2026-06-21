---
title: Incremental desiderata router v2 plan
status: planned
---

# Incremental desiderata router v2 plan

This is the handoff plan for reviving the incremental/desiderata edge-routing
idea without repeating the June 2026 timeout regression.

## Foundation landed (2026-06-21)

The first-milestone scaffold is in place (Claude session). What exists now:

- `src/app/drawing-area/routing-geometry.ts` — shared pure-geometry primitives.
  The production `desiderata-route-edges.ts` was refactored to import these
  (verified behaviour-preserving: dense `geometry.json` byte-identical before/
  after). Production routing is unchanged.
- `src/app/drawing-area/routing-local-score.ts` — the local single-edge scorer.
  Scores one edge's candidate against nodes + a small context set, never the
  whole graph. Encodes the **revised** desideratum order (see below).
- `src/app/drawing-area/incremental-desiderata-route-edges.ts` — the v2 router
  skeleton: deterministic edge order, fixed 7-candidate set, local scoring,
  hard budgets, instrumentation (`IncrementalRouterStats`), and an
  `uncleanEdges` report for the "best-effort, report conflicts" policy.
  Registered ONLY in the harness bundle-entry. Not in the worker/app.
- `tools/routing-eval/test.mjs` (`npm run routing-test`) — automated pass/fail
  gate. Asserts: no throw, `hardFailCount === 0`, under a per-scenario time
  budget. Prints soft metrics + router instrumentation for eyeballing.

**Skeleton baseline** (`npm run routing-test`, candidate-only, no refinement):
34/39 pass. `dense` routes in **6 ms** (was ~10 s through the production
desiderata pipeline) with 25 vs 30 crossings. The 5 failures are all node-clip
cases — `near-parallel-cross`, `tangent-grazing`, `bypass-many`,
`edge-around-cluster`, `asymmetric-density` — i.e. exactly the **node-clip
repair** refinement (first "Later milestone" below). The router's own
`uncleanEdges` count matches the harness's independent hard-fail count.

## Curve refinement milestone (2026-06-21)

The skeleton was upgraded from candidate-only straight polylines to **smooth
curves via an iterative per-edge refine loop** (user direction):

- `routing-curve.ts` — `sampleSmoothPath()` replicates Konva's tension-0.5
  Catmull-Rom expansion exactly, so the router scores the same curve the app
  renders (`DAEdge.SMOOTH_TENSION`). Waypoints act as Bézier control points.
- `incremental-desiderata-route-edges.ts` now does, per edge: **seed** (best of
  the fixed candidate set, scored on the curve) → **refine** (a bounded
  hill-climb, ≤ `maxIterationsPerEdge` = 20: each iteration MOVES/ADDS/REMOVES a
  waypoint and keeps the best curve-scored improvement; stops early when no move
  improves, so the count is effectively dynamic). Routed edges get
  `setSmoothRendering(true)`.
- Context edges are scored as their sampled curves (curve-vs-curve crossings /
  clearance), pre-filtered to those near the edge (bbox margin) to keep dense
  scoring bounded.

**Deliberate deviation from the original plan:** the plan said "avoid
rendered-curve sampling in the inner loop." We now sample curves inside the
loop — but it stays bounded by the iteration cap, the nearby-context filter, the
local (one-edge) scope, and the `maxElapsedMs` / `maxTotalScoreCalls` guards.

**Result** (`npm run routing-test`, non-overlapping scenarios): **32/33 pass**,
up from the skeleton's set. `dense` routes in ~75 ms (vs ~10 s production) with
no budget hits; edges render as curves (e.g. `dense`'s `n0→n2` arcs around
`n1`; anti-parallel pairs fan into separate curves). Only `tangent-grazing`
still fails (a genuinely tight graze — conflict-report territory).

**Eval scope:** the harness eval now excludes overlapping-node fixtures
(`run.mjs --skip-overlapping`; `test.mjs` skips them by default). A router can't
be graded on routing cleanly between nodes that already overlap.

## Three follow-up fixes (2026-06-21)

Surfaced by inspecting the comparison page:

1. **Robust crossing detection (vertex-on-edge).** Strict `segmentsIntersect`
   ignores touches at a segment endpoint, so the router could hide a crossing by
   placing a waypoint EXACTLY on the crossed edge (the curve then passes through
   it as a vertex) — scoring 0 crossings while visibly crossing (diamond-x,
   k4 BD got a pointless bend). `routing-local-score.ts` now adds a
   vertex-passthrough check: count a crossing when one of the curve's interior
   vertices lies on another edge and the curve passes from one side to the
   other. diamond-x / k4 are now bend-free (0 control points).

2. **Curve-based clip detection in the harness.** The metric's
   `edgesThroughNodes` only checks the straight control polygon, but the app
   renders a Catmull-Rom curve that can bulge into a node the polygon clears.
   `bundle-entry.ts` now exports the curve sampler and `test.mjs` gates on a
   `curveClip` count (sample each edge's rendered curve, test vs non-incident
   node boxes). Finding: the desiderata maze "clip" is actually a ~16 px
   near-miss, not a true clip — the SVG fallback exaggerated it. v2 keeps
   curveClip=0 by construction (it scores the curve); only `tangent-grazing`
   has a real curve clip.

3. **Fan-in / fan-out separation.** Edges sharing ONE endpoint (not siblings)
   bunched onto the same perimeter point (converge-circular S2/S3→In). Added a
   `minIncidentAngleDeg` desideratum: reward distinct approach angles at a
   shared node, clamped at `satisfiedIncidentAngleDeg` (22°), ranked above
   aesthetics. Incident fans now spread their approaches.

## Sibling-separation fix (2026-06-21)

The comparison page (`compare-page.mjs`) revealed v2 collapsing parallel /
anti-parallel siblings onto one overlapping line. Cause: siblings share both
endpoints, so the edge-edge clearance check skipped them, and two collinear
straights don't register as a crossing — nothing penalised the overlap. Fix: a
`minSiblingSeparation` desideratum in `routing-local-score.ts` — for sibling
context edges, measure the gap at this candidate's interior sample points (away
from the shared endpoints they must converge at), clamped at
`satisfiedSiblingSeparation` (34 px). Ranked above aesthetics (so a sibling will
take a bend to fan into its own lane) but below non-sibling crossings (so it
won't cross another edge to do so). `anti-parallel`, `multi-parallel`,
`hub-spoke`, and `dense`'s sibling pairs now fan into distinct lanes. Because
routing is incremental, the first sibling stays straight and later ones bow —
an asymmetric lens rather than the bf-wc mirror lens, but cleanly separated.

## Revised desideratum priority (agreed 2026-06-21)

Supersedes the flat list under "Cheap local scoring" below.

1. **Hard constraints** (drive to zero, lexicographically, before anything):
   edge-through-node, sibling crossing, self-intersection, **and a minimum
   crossing angle** — a crossing shallower than `minCrossingAngleDeg` (30°) is a
   hard failure, not a soft penalty.
2. **Node clearance**, then **edge clearance** — promoted *above* non-sibling
   crossing count.
3. Fewer non-sibling crossings.
4. Aesthetics, least-tolerated → most-tolerated: **bends → length → max
   curvature → bulge**. Note this uses *max* curvature (the single sharpest
   turn), not total curvature. See [[desiderata-bulge-curvature-bends]] for why
   these four are independent.

## Current baseline

Production routing is the desiderata pipeline (`applyDesiderataRouteEdges` =
bf-wc base + refinement passes), run in a Web Worker with a 15 s wall-clock
timeout (`drawing-area.component.ts`). Its slowness comes from
`scoreRoute → computeRoutingMetrics` (whole-graph, O(E²)) called inside the
refinement candidate loops. Keep it unchanged while v2 is explored.

The previous unbounded implementation was reverted. It had promise visually, but
it made routing pathological by combining too many changes at once:

- many new refinement stages in `desiderata-route-edges.ts`,
- repeated `while progress` loops,
- whole-graph rescoring for each candidate,
- spline-sampled rendered-path metrics inside inner loops,
- app keymenu wiring before the harness had performance guardrails.

The rollback was confirmed with:

```bash
node tools/routing-eval/run.mjs --algorithm desiderata --scenario dense --force-bundle
npx ng build
```

After rollback, the dense desiderata harness scenario completed in about 10s.

## Goal

Implement `incremental-desiderata-v2` as a harness-only routing experiment first.
Do not wire it into the app keymenu or production routing command until it has
stable performance numbers.

## Files to read first

- `AGENTS.md`
- `dev-status.md`
- `notes/idea-incremental-edge-routing.md`
- `src/app/drawing-area/desiderata-route-edges.ts`
- `src/app/drawing-area/edge-routing-metrics.ts`
- `tools/routing-eval/README.md`
- `tools/routing-eval/harness/bundle-entry.ts`

## Hard constraints

- Keep production app routing unchanged.
- Register the new router only in `tools/routing-eval/harness/bundle-entry.ts`
  at first.
- Do not call full `computeRoutingMetrics()` inside inner candidate loops.
- Score only the edited edge against nodes and already-routed/nearby edges.
- Add hard caps for candidate count, score calls, and elapsed milliseconds.
- If a budget is hit, return the best route found so far.
- Add instrumentation before visual tuning.

## First milestone

Add a harness-only algorithm named `incremental-desiderata-v2`.

Route edges one at a time in deterministic order. For each edge, evaluate a
small fixed candidate set:

- straight,
- dogleg X,
- dogleg Y,
- one perpendicular midpoint,
- two-point perpendicular offset in each direction.

Choose the best candidate with cheap local scoring. Do not add repeated
refinement loops in this milestone.

## Cheap local scoring

The local score should prioritize obvious hard failures before aesthetics:

1. non-incident node intersections,
2. sibling crossings,
3. self-intersections,
4. non-sibling crossings against already-routed/nearby edges,
5. minimum clearance to non-incident nodes,
6. minimum clearance to already-routed/nearby edges,
7. total path length,
8. bend count.

Use simple segment/polyline geometry. Avoid rendered-curve sampling in the inner
loop. If rendered-curve scoring is needed later, add it only as a bounded outer
validation pass.

## Budgets

The router should report and enforce at least:

- `maxCandidatesPerEdge`,
- `maxScoreCallsPerEdge`,
- `maxTotalScoreCalls`,
- `maxElapsedMs`.

Suggested starting values:

- `maxCandidatesPerEdge: 8`,
- `maxScoreCallsPerEdge: 12`,
- `maxTotalScoreCalls: 500`,
- `maxElapsedMs: 3000`.

These can be tuned, but every run must remain bounded.

## Instrumentation

For every scenario, record:

- node count,
- edge count,
- candidates evaluated,
- score calls,
- elapsed ms,
- whether any budget was hit.

Prefer writing this into the existing routing-eval cell output alongside
`metrics.json` / `geometry.json`, or otherwise make it visible in the harness
console output.

## Scenario ladder

Validate from small to dense:

```bash
node tools/routing-eval/run.mjs --algorithm incremental-desiderata-v2 --scenario line-3 --force-bundle
node tools/routing-eval/run.mjs --algorithm incremental-desiderata-v2 --scenario tree-5 --force-bundle
node tools/routing-eval/run.mjs --algorithm incremental-desiderata-v2 --scenario fan-in-8 --force-bundle
node tools/routing-eval/run.mjs --algorithm incremental-desiderata-v2 --scenario maze --force-bundle
node tools/routing-eval/run.mjs --algorithm incremental-desiderata-v2 --scenario bottleneck-channel --force-bundle
node tools/routing-eval/run.mjs --algorithm incremental-desiderata-v2 --scenario dense --force-bundle
```

The dense scenario should stay comfortably below the app worker timeout before
any app wiring is considered. Aim for under 5s in the harness.

## Later milestones

Add one refinement at a time, each as its own small commit and benchmark:

- node-clip repair,
- fan separation,
- waypoint pruning,
- edge-edge separation.

Each refinement must preserve the same budget discipline. If a refinement needs
whole-graph rescoring to work, it should stay out of the app path.

## App integration gate

Only after harness performance is stable:

- add worker support,
- add a hidden/dev-only keymenu command,
- keep the production routing command unchanged,
- manually test on real sample graphs,
- promote only after repeated runs stay below timeout.

## Handoff prompt

Use this prompt when handing the task to another agent:

```text
We want to revive the incremental/desiderata edge-routing idea without repeating
the timeout regression.

Read notes/plan-incremental-desiderata-v2.md and follow it as the source of
truth. Current production routing should remain unchanged. Implement
incremental-desiderata-v2 as a routing-eval-only algorithm first, with candidate
seeding only, cheap local scoring, hard performance budgets, and instrumentation.

Do not wire the new router into the app keymenu yet. Do not call full
computeRoutingMetrics() inside inner candidate loops. Validate on the scenario
ladder in the plan, then run npx ng build.
```
