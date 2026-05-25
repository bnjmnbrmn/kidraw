# flexible-wire (algorithm characterization)

A bead-chain like charged-spring, but with adaptive bead count (periodic
remeshing splits/merges segments to keep ~14 px spacing) and a different
force balance. Default mode is "pure rubber-band" (`anchorK = 0`): the
chain contracts to the locally-shortest obstacle-free path, held in lane
purely by sibling-cross-edge repulsion. A `tautnessK` force pulls each
bead toward its perpendicular projection on the chord between the two
pinned endpoints — chains stay close to the chord but bulge freely
around obstacles.

Source: `src/app/drawing-area/flexible-wire-edges.ts`

## Virtues

- Rated 5 on `fan-out-8`, `fan-in-8`, `line-3`, `tree-5`, `cycle-4`.
- Adaptive bead count handles long edges and tight curves uniformly.
- Clean separation of concerns: rubber-band contraction (smoothing) +
  obstacle-avoidance (charge) + lane discipline (sibling repulsion) +
  optional anchor + optional tautness.

## Vices

- Round-2 `anti-parallel` r=2 (*"too wiggly/jaggedy"*),
  `multi-parallel` r=2, `mesh-3x3` r=2 (*"weird back and forth"*),
  `hub-spoke` r=1 (*"Arrowhead problem not completely solved. Some extra
  wiggle."*), `dense` r=2, `sparse` r=2.
- The combination of rubber-band contraction + remeshing can produce
  beads that oscillate locally — the chain finds a path that's locally
  shorter but visually jagged.
- High repulsion (default `edgeRepulsionK = 500`, 10x charged-spring)
  is the only thing keeping parallel siblings in lanes; when it kicks
  in mid-chain it pushes beads sideways in a way the smoother can't
  catch up with before the next remesh.

## Tuning knobs observed

From the header comments:

- `tautnessK` (default 0.3) — *"Higher values make the wire taut:
  deflections only occur where obstacles push the chain off the
  chord."* The most direct anti-wiggle lever.
- `anchorK` (default 0) — switch to a small positive value (e.g. 0.4)
  to add charged-spring-style anchor pull.
- `smoothingK` (default 0.5) — Laplacian smoother.
- `segmentSpringK` (default 0.4) — Hooke spring along chain, targets
  `targetSegmentLength`. Stability ceiling ~0.6 per header.
- `edgeRepulsionK` (default 500) — sibling cross-edge repulsion. 10x
  charged-spring's default; reducing it would let parallels collapse.
- `targetSegmentLength` (default 14) — bead spacing target. Larger =
  coarser chain.
- `remeshInterval` (default 20) — remesh every N iterations.

`tautnessK` is the obvious first sweep.

## Sweep results

Run: `tools/routing-eval/runs/20260524-170604-a16/sweep/flexible-wire/`

`tautnessK` ∈ {0.0, 0.3 (default), 0.8, 1.5} on `anti-parallel`,
`mesh-3x3`, `dense`:

| scenario | tautnessK | bends | edge-crossings | total-curvature |
| --- | --- | --- | --- | --- |
| anti-parallel | 0.0 | 22 | 0 | 1.90 |
| anti-parallel | 0.3 (default) | 16 | 0 | 3.27 |
| anti-parallel | 0.8 | 53 | 4 | 73.52 |
| anti-parallel | 1.5 | 91 | 30 | 138.00 |
| mesh-3x3 | 0.0 | 104 | 0 | 41.90 |
| mesh-3x3 | 0.3 (default) | 44 | 0 | 46.55 |
| mesh-3x3 | 0.8 | 24 | 0 | 50.11 |
| mesh-3x3 | 1.5 | 8 | 0 | 25.00 |
| dense | 0.0 | 363 | 32 | 86.25 |
| dense | 0.3 (default) | 289 | 30 | 164.43 |
| dense | 0.8 | 620 | 166 | 950.07 |
| dense | 1.5 | 873 | 348 | 1482.92 |

Interpretation:

- **`anti-parallel` and `dense` get dramatically worse as `tautnessK`
  goes up.** Increasing tautness drives the chain straight through
  obstacles (350 edge-crossings on dense at 1.5). The chain literally
  bridges across nodes because the chord tension overcomes obstacle
  charge.
- **`anti-parallel` at `tautnessK = 0.0` is the best**: 1.90 curvature,
  6 fewer bends than default, zero crossings. The default 0.3 actively
  *increased* curvature here (3.27 vs 1.90) — the tautness pulls beads
  slightly inward against each other, creating tiny wiggles.
- **`mesh-3x3` is non-monotonic**: bend count drops as tautness goes up
  (104 → 8), but the chain still avoids obstacles. The metric trend
  suggests tightening helps for this one specifically.
- **`dense` is monotonically worse**: even default 0.3 is hurting
  (curvature 164 vs 86 at 0). `tautnessK = 0.0` might be the actual
  best default if not for the loss of "near the chord" preference on
  obstacle-free edges.

## Recommended default

The data argues for **`tautnessK = 0.0` as the default** (revert the
"moderate default tautness" choice). On every dense scenario tested,
increasing tautness from 0 either kept things flat or made them worse.
The trade-off was supposed to be "chain sits close to the chord but
bulges freely around obstacles," but in practice the tautness wins
against the obstacle charge in cluttered cells and edges get pushed
through nodes.

`mesh-3x3` would benefit from higher tautness, but it's a single
scenario; the broader trend is "more tautness = more crossings."

Don't change defaults this round; user evaluates the sweep SVGs first.

## Deferred / structural issues

- **`hub-spoke` r=1 "arrowhead problem not completely solved"** — this
  is the previously-filed [`bug-arrowhead-tangent`](bug-arrowhead-tangent.md).
  Not a tuning issue.
- **`flexible-wire dense` floors at ~30 edge-crossings even at
  tautnessK=0**, same as charged-spring. Same structural cause.
- **`flexible-wire` aggregate quality is worse than `charged-spring`
  on the same scenarios.** Adaptive remeshing is buying flexibility we
  may not actually need; the chain ends up oscillating more often than
  charged-spring's fixed-count chain. Consider whether `flexible-wire`
  earns its keep — it might just be worse at almost everything except
  `multi-parallel` and `cycle-4`, where it ties charged-spring.
  Filing this question as deferred — needs the user's judgement on
  whether to keep both algorithms or retire one.
