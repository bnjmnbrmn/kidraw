# bug: dense graphs have triple/clustered edge intersections

## Observation

Round 2 feedback (`tools/routing-eval/feedback/feedback-20260524-163438-sb1.json`)
flagged "triple intersections" and "intersections too close together" on the
`dense` scenario across multiple algorithms:

- `bezier-route|dense` r=4: *"this is pretty good, except that some of the
  intersections are too close together"*
- `flexible-wire|dense` r=2: *"some wiggle/jaggedyness. Also, these triple
  intersections again."*

Round 1 (`feedback-20260524-075433-rms.json`) also flagged it: *"we might
want to try to avoid having three line segments intersect close to each
other"*, *"the angle at intersections should be wide (maybe between 30 and
150 degrees). It's hard to tell which input to an intersection goes with
which output of an intersection."*

## Why it isn't a tuning problem

Sweeps (`tools/routing-eval/runs/20260524-170604-a16/sweep/`) of the most
direct anti-wiggle knob per algorithm did not move the dense
`edgeCrossings` count off ~30 for any of {charged-spring,
bezier-fit-charged-spring, flexible-wire, weighted-chain}. The number
held constant because every algorithm computes a route per edge in
isolation:

- charged-spring / flexible-wire / weighted-chain: bead chains feel only
  obstacle charge (per-edge) and sibling-scoped (or all-pairs) bead
  repulsion. There's no awareness of "edge A and edge B are about to
  cross at angle 5° in the screen middle."
- bezier-route: gradient descent on per-edge control points, with
  obstacle penalty but no inter-edge crossing penalty.

So the fix is structural: a routing layer that's aware of the *union*
of all edges' geometry and can optimise for:

1. Crossing angles in the comfortable 30°-150° range.
2. Crossing positions spaced apart rather than clustered.
3. Edge bundling for edges that share a long-range corridor.

## Direction (research, not action)

The two leads in the existing zettelkasten:

- [`research-libavoid-integration.md`](research-libavoid-integration.md)
  — libavoid does orthogonal multi-edge routing with explicit
  nudging-apart of parallel segments.
- [`research-polyline-nudging.md`](research-polyline-nudging.md) — the
  in-house option: a post-pass that nudges polyline segments laterally
  to spread crossings and parallels.

## Tag

deferred / needs deeper work (algorithmic — not tunable).
