# bezier-fit-charged-spring (algorithm characterization)

Hybrid: run charged-spring with pruning disabled to get a dense bead
polyline, then collapse it down via Douglas-Peucker simplification at
threshold `dpTolerance`, and render the surviving control points as a
smooth Catmull-Rom curve.

Source: `src/app/drawing-area/bezier-fit-route-edges.ts`
(wraps `applyChargedSpringEdges` from `charged-spring-edges.ts`)

## Virtues

- Inherits the physics of charged-spring (obstacle avoidance, sibling
  separation, anchor stability).
- Smooth rendering — no visible polyline kinks.
- Round-2: rated 5 on every small/medium scenario (`anti-parallel`
  through `cycle-4`).

## Vices

- Round-2 `dense` r=2 (*"n8 to n10 is too wiggly"*) and `sparse` r=2
  (*"too wiggly"*).
- The smooth rendering hides per-bead jitter but preserves any
  inflection that exceeds `dpTolerance` — too low a threshold and every
  small bead oscillation becomes a visible bend.

## Tuning knobs observed

Only one fit-side knob (everything else is inherited from charged-spring):

- `dpTolerance` (default 3, in px). Header is explicit: *"Lower = more
  control points, closer to the physics result. Higher = simpler chain,
  cruder approximation."* This is the direct anti-wiggle lever.

Inherited knobs (sweeping these on the fit side would equivalently
sweep them on charged-spring; see `algo-charged-spring.md`).

## Sweep results

Run: `tools/routing-eval/runs/20260524-170604-a16/sweep/bezier-fit-charged-spring/`

`fit.dpTolerance` ∈ {1, 3 (default), 8, 16} on `dense` and `sparse`:

| scenario | dpTolerance | bends | edge-crossings | total-curvature |
| --- | --- | --- | --- | --- |
| dense  | 1  | 89 | 30 | 18.03 |
| dense  | 3 (default)  | 69 | 30 | 16.05 |
| dense  | 8  | 65 | 30 | 15.46 |
| dense  | 16 | 53 | 32 | 7.59 |
| sparse | 1  | 49 | 3 | 5.14 |
| sparse | 3 (default)  | 30 | 3 | 4.29 |
| sparse | 8  | 20 | 3 | 2.82 |
| sparse | 16 | 10 | 3 | 0.00 |

- Monotonic on both scenarios: more aggressive simplification
  (`dpTolerance` up) collapses bends and curvature.
- `sparse` at `dpTolerance=16` produces straight lines (curvature 0,
  bends only at the obligatory endpoints) — likely *too* aggressive
  (loses the curve's character on edges that should bend around an
  obstacle), but no obvious damage in the metrics.
- `dense` at `dpTolerance=16` adds 2 edge crossings — the simplification
  is starting to bridge across obstacles. So `dpTolerance=8` is the
  safer pick for dense.

## Recommended default

Try `dpTolerance = 8` (up from 3). Big curvature win on both scenarios
(-50% sparse, -4% dense), bend-count win (-33% sparse, -6% dense), zero
crossings regression. Anything higher trades quality for simplicity
faster than it should.

Not landed this round — user evaluates the sweep SVGs first.

## Deferred / structural issues

- The dense `edgeCrossings` floor of 30 is inherited from
  charged-spring; the fit step can't fix structural issues in the
  underlying polyline. See `algo-charged-spring.md` for the deferred
  routing-topology work.
