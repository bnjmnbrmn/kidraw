# charged-spring (algorithm characterization)

A bead-chain physics simulation: each edge becomes a 16-bead chain pinned at
both endpoints. Beads feel a Laplacian smoother (pulled to midpoint of
neighbours), an anchor spring (pulled to their straight-line lane-offset rest
position), inverse-square repulsion from non-incident node bboxes, and
sibling-scoped cross-edge repulsion. Renders as a polyline through the
surviving (post-prune) beads.

Source: `src/app/drawing-area/charged-spring-edges.ts`

## Virtues (from in-code comments and round-2 results)

- Excellent on small graphs. Round-2 ratings of 5 on `anti-parallel`,
  `fan-out-8`, `fan-in-8`, `line-3`, `tree-5`, `hub-spoke`, `cycle-4`.
- Force-balance is robust; anchor + smoothing keeps the chain near the
  straight-line lane unless an obstacle deflects it.
- Sibling-scoped cross-edge repulsion (not all-pairs) keeps parallel
  siblings separated without the 4-group blowup that all-pairs caused.
- End-tapered charge (smoothstep over `chargeRampLength` beads) keeps end
  beads near the node face perpendicular instead of being pushed sideways
  by neighbouring obstacles or converging siblings.

## Vices (from round-2 feedback)

- Round-2 `dense` r=2, `sparse` r=2 — wiggles. The Laplacian smoother
  fights local obstacle deflections by trying to keep the chain locally
  straight; in cluttered graphs the chain ends up oscillating between
  competing obstacles.
- `mesh-3x3` r=3 (no comment) — between fine and bad.

## Tuning knobs observed

The header comments call out roles for every option. The main candidates
for a wiggle reduction are:

- `smoothingK` (default 0.4) — Laplacian smoother gain. The header is
  explicit that the dense polyline of short segments "reads as a smoother
  curve" (justifying low `pruneEpsilon`), but doesn't claim 0.4 is the
  optimum for crowded graphs.
- `chargeK` (default 9000) — obstacle inverse-square strength. Lowering
  it reduces obstacle deflection (less wiggle, more risk of edges through
  nodes).
- `chargeRampLength` (default 5) — already in place to taper end-bead
  charge.

I swept `smoothingK` first because it's the most direct anti-wiggle lever
and the header comments leave its tuning open.

## Sweep results

Run: `tools/routing-eval/runs/20260524-170604-a16/sweep/charged-spring/`

`smoothingK` ∈ {0.2, 0.4 (default), 0.7, 1.0} on `dense` and `sparse`:

| scenario | smoothingK | bends | edge-crossings | total-curvature |
| --- | --- | --- | --- | --- |
| dense  | 0.2 | 72 | 30 | 14.68 |
| dense  | 0.4 (default) | 70 | 30 | 18.35 |
| dense  | 0.7 | 66 | 30 | 11.93 |
| dense  | 1.0 | 73 | 30 | 32.30 |
| sparse | 0.2 | 54 | 3 | 6.29 |
| sparse | 0.4 (default) | 50 | 3 | 5.20 |
| sparse | 0.7 | 50 | 3 | 4.45 |
| sparse | 1.0 | 50 | 3 | 3.95 |

- `dense` is non-monotonic: 0.7 is the sweet spot (curvature down ~35%
  vs default), 1.0 overshoots (the smoother pulls hard enough to fight
  the anchor + create oscillation between competing obstacles).
- `sparse` monotonically benefits from more smoothing — fewer obstacles
  means the smoother isn't fighting anything.

## Recommended default

Try `smoothingK = 0.7` (up from 0.4). Reduces total curvature on both
sparse (-15%) and dense (-35%) without changing crossings count.

Not landed this round — user evaluates the sweep SVGs first. The dense
edge-crossings count stayed at 30 across all values, which means the
sweep didn't fix the "intersections too close" structural complaint;
that needs algorithmic work (see "Deferred" below).

## Deferred / structural issues

- **Edges-through-nodes / triple intersections on `dense`.** No
  `smoothingK` value reduced `edgeCrossings` below 30. The charged-spring
  inverse-square repulsion from obstacles is local; it can't reason about
  global routing topology (which bundles should go above vs below a
  node). Needs the libavoid integration or polyline-nudging research
  ([`research-libavoid-integration.md`](research-libavoid-integration.md),
  [`research-polyline-nudging.md`](research-polyline-nudging.md)).
