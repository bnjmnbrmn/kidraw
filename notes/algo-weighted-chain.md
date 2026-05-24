# weighted-chain (algorithm characterization)

PBD (position-based dynamics) rigid-segment chain with equal-weight
endpoints "in the hole." Mental model: a wooden board with a hole at
each node; an edge is a chain of rigid metal segments coming up out of
the source hole, across the board, back into the dest hole. Equal weights
inside each hole pull the chain taut. Obstacle charge + sibling repulsion
deflect the chain but never compress it (PBD enforces fixed segment
length). End beads "drain" out of the holes when both end beads are
inside the bbox — chain length adapts to the visible portion.

Source: `src/app/drawing-area/weighted-chain-edges.ts`

## Virtues

- Unique physical model (taut chain, not bead spring) — robust to
  obstacle-pressure imbalance.
- Rated 5 on `fan-out-8`, `fan-in-8`, `line-3`.
- The drain mechanism cleanly handles chain-length adaptation.

## Vices

- Round-2 `anti-parallel` r=1, `multi-parallel` r=1, `tree-5` r=3,
  `mesh-3x3` r=3, `hub-spoke` r=1 (*"Overlapping edges"*),
  `cycle-4` r=3 (*"straight edges would probably be better"*),
  `dense` r=1 (*"crazy kinks"*), `sparse` r=2.
- The lowest-rated of the five algorithms in round 2.

## Tuning knobs observed

From the header comments:

- `segmentLength` (default 0.5 px!) — rigid segment length between
  adjacent beads. Drives bead density. The 0.5 default produces
  thousands of beads per long edge.
- `initialSlackFactor` (default 1.5) — initial chain length as a
  multiple of straight-line distance.
- `pbdIterations` (default 12) — constraint-projection sweeps per
  timestep.
- `endpointForce` (default 30) — constant pull on each end bead toward
  its node center.
- `drainInterval` (default 5) — how often to splice off in-hole
  end beads.
- `edgeRepulsionK` (default 500) — global all-pairs cross-edge
  repulsion (PBD's rigid segments keep this stable).

The `segmentLength = 0.5` default jumps out as physically implausible:
a 400 px edge gets ~800 beads, multiplied by `initialSlackFactor` to
~1200 beads. With PBD's per-pass per-bead constraint projection, that's
~14400 operations per timestep per edge. **And** it produces visually
jagged chains because tiny per-bead PBD corrections + charge forces
create thousand-bead micro-zigzags.

## Sweep results

Run: `tools/routing-eval/runs/20260524-170604-a16/sweep/weighted-chain/`

`segmentLength` ∈ {0.5 (default), 4, 12, 24} on `dense`, `sparse`,
`hub-spoke`:

| scenario | segmentLength | bends | edge-crossings | total-curvature | computeTimeMs |
| --- | --- | --- | --- | --- | --- |
| hub-spoke | 0.5 (default) | 48 | 0 | 0.00 | 1256 |
| hub-spoke | 4 | 87 | 0 | 0.12 | 97 |
| hub-spoke | 12 | 58 | 0 | 0.03 | 40 |
| hub-spoke | 24 | 50 | 0 | 0.79 | 28 |
| dense | 0.5 (default) | **14929** | 35 | 11218.38 | **520142** |
| dense | 4 | 1962 | 30 | 2295.83 | 11372 |
| dense | 12 | 634 | 30 | 94.14 | 1246 |
| dense | 24 | 343 | 30 | 10.28 | 373 |
| sparse | 0.5 (default) | 1253 | 3 | 1244.05 | 11349 |
| sparse | 4 | 171 | 3 | 5.55 | 199 |
| sparse | 12 | 82 | 3 | 3.76 | 60 |
| sparse | 24 | 21 | 3 | 0.05 | 35 |

The numbers are dramatic:

- **`dense` at default `segmentLength = 0.5` took 520 seconds
  (~8.5 minutes) and produced 14929 bends with total curvature 11218.**
  That's the "crazy kinks" the user reported. The chain is essentially
  noise.
- Increasing `segmentLength` from 0.5 → 24 reduces compute time by
  ~1400× on dense, bend count by ~44×, total curvature by ~1100×.
  **Edge-crossings count stays at 30** — the structural floor is
  unaffected, so the user-visible win is purely on smoothness.
- `hub-spoke` is similar: default 0.5 takes 1256 ms; 24 takes 28 ms.
  Curvature stays low across the board (this scenario is clean).

The default of 0.5 is a **bug-level configuration** — it makes the
algorithm both slow and ugly on anything denser than a few edges.

## Recommended default

**Strongly recommend `segmentLength = 12` (up from 0.5), maybe 24.**

- 12 is a safe middle ground: ~30 px-spaced beads on a 400 px edge
  (~13 beads), enough to follow curves, not enough to oscillate.
- 24 is aggressive but produces near-zero curvature on `sparse` and the
  cleanest visuals on `dense`. If the curve-fidelity loss on tight
  obstacle navigation is acceptable, this is the strongest default.
- Both kill the runaway compute time.

Not landed this round — user evaluates the sweep SVGs first. The
weighted-chain round-2 ratings of 1 across many scenarios suggest the
default is doing real damage to the perceived quality of the algorithm.

## Deferred / structural issues

- **`anti-parallel` r=1, `multi-parallel` r=1**: not addressed by
  `segmentLength`. The chain's lane-offset is uniform (the entire
  chain shifts) and PBD doesn't prevent siblings from crossing
  mid-chain. The global edgeRepulsionK helps but isn't enough when the
  endpoints converge on the same node faces.
- **`hub-spoke` r=1 "Overlapping edges"** — same root cause: many
  edges arriving at one node converge to overlapping paths.
- **The 520-second compute time at default `segmentLength`** is filed
  as a near-bug. It doesn't crash, but it's pathological. The
  recommended default change resolves it.
