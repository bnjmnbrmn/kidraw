# routing-eval — routing-algorithm characterization harness

A white-box harness that runs every edge-routing algorithm against every
scenario in a battery, dumps geometry + metrics + an SVG snapshot per
(algorithm × scenario), and serves the results in a static viewer for
human rating. This is **round 1 infrastructure**: no algorithm changes,
no parameter sweeps, no bug fixes. Round 2 reads the feedback JSON and
acts on it.

## What it does

For each `(algorithm, scenario)` pair:

1. Build the scenario as a graph of plain-JS `FakeDANode` / `FakeDAEdge`
   objects (no Angular, no Konva).
2. Call the router function with `DEFAULT_OPTIONS` and a timer.
3. Compute routing metrics on the resulting geometry.
4. Write `routing.svg`, `metrics.json`, `geometry.json` under
   `runs/<timestamp>/<algorithm>/<scenario>/`.

The viewer then walks that directory tree and shows one cell at a time
with the snapshot, metrics, and a 5-star rating widget.

## Run the harness

From the repo root:

```bash
node tools/routing-eval/run.mjs              # all algorithms × all scenarios
node tools/routing-eval/run.mjs --algorithm charged-spring
node tools/routing-eval/run.mjs --scenario anti-parallel
node tools/routing-eval/run.mjs --algorithm charged-spring --scenario anti-parallel
node tools/routing-eval/run.mjs --help
```

Or via the npm script (equivalent):

```bash
npm run routing-eval -- --algorithm charged-spring
```

First run takes a few extra seconds because the harness bundles the
TypeScript routers via `esbuild` (already a transitive dependency).
The bundle is cached in `tools/routing-eval/.cache/bundle.cjs` and
auto-invalidated when any router or `da-*.ts` source changes.

Output goes to:

```
tools/routing-eval/runs/<timestamp>/manifest.json
tools/routing-eval/runs/<timestamp>/<algorithm>/<scenario>/routing.svg
tools/routing-eval/runs/<timestamp>/<algorithm>/<scenario>/metrics.json
tools/routing-eval/runs/<timestamp>/<algorithm>/<scenario>/geometry.json
tools/routing-eval/runs/latest                                (symlink → newest run dir)
```

The `manifest.json` is the index the viewer reads. Format:

```json
{
  "timestamp": "20260524-061500",
  "algorithms": ["charged-spring", "flexible-wire", ...],
  "scenarios":  [{"name": "anti-parallel", "description": "..."}, ...],
  "cells": [
    {"algorithm": "charged-spring", "scenario": "anti-parallel",
     "metrics": {...}, "ok": true},
    ...
  ]
}
```

## Launch the viewer

```bash
python3 -m http.server -d tools/routing-eval/viewer 8765
# then open http://localhost:8765/
```

The viewer auto-loads the newest run via `runs/latest/manifest.json`.
Use `?run=<timestamp>` to pin to a specific run.

### Rating workflow

- 5-point scale (1 = unusable, 5 = excellent) plus a freeform comment.
- Use Prev/Next or arrow keys to walk every cell.
- Click **Download feedback JSON** in the header at any time. The file
  saves locally as `feedback-<run-timestamp>.json` and is keyed by
  `algorithm + scenario`. Round-2 agents read this file from
  `tools/routing-eval/feedback/`.

A planned **two-per-page side-by-side** mode is not built — see the
viewer code's `// TODO: side-by-side` marker. The cell-state structure
already keeps per-cell data independent so adding the second pane is
mainly a layout change.

## Output directory layout

```
tools/routing-eval/
  runs/
    <timestamp>/
      manifest.json
      <algorithm>/
        <scenario>/
          routing.svg
          metrics.json
          geometry.json
    latest -> <newest-timestamp>/
  feedback/
    feedback-<timestamp>.json    (saved from viewer downloads)
```

`runs/` and `feedback/` are gitignored.

## Metric definitions

All metrics come from `src/app/drawing-area/edge-routing-metrics.ts`
plus harness-side counters. Units are canvas pixels unless noted.

| Key | Meaning |
|-----|---------|
| `edgeCount` | Number of edges in the scenario. |
| `nodeCount` | Number of nodes in the scenario. |
| `computeTimeMs` | Wall time for the single router call (ms). |
| `edgeCrossings` | Pairs of non-incident edge segments that cross. |
| `siblingCrossings` | Same as above but restricted to edges in the same `{src, dest}` parallel-edge group (a stricter signal — siblings should never cross each other in their interior). |
| `edgesThroughNodes` | Count of edges whose interior polyline passes through a non-incident node bbox. |
| `selfIntersections` | Count of edges whose own polyline crosses itself. |
| `totalLength` | Sum of polyline-segment lengths across every edge (px). |
| `bendCount` | Total number of interior control points across every edge (after the router's own pruning). |
| `maxCurvature` | Largest interior bend angle on any edge (radians; π = doubled back, 0 = straight). |
| `minObstacleClearance` | Smallest distance from any interior control point to the nearest non-incident node bbox (px). |
| `maxBulgeRatio` | Per-edge max perpendicular deviation of any interior point from the chord src→dest, divided by chord length. 0 = straight edge; ~0.5 = a wire bulging halfway as far as it is long. |

`bendCount` and `edgeCrossings` are harness-added counters. The rest
come directly from `computeRoutingMetrics()` so we evaluate identically
to the live tuning panel. `maxCurvature` is the largest single-bend
angle and `totalCurvature` (in `metrics.json` for reference) is the
sum of all bend angles.

## Scenarios

Each scenario lives in `tools/routing-eval/scenarios/<name>.mjs` and
exports `{ name, description, build() => {nodes, edges} }`. The
current battery:

### Bug-finding cases

- **anti-parallel** — Two nodes connected by edges in both directions
  (A→B, B→A). Exercises the unordered-pair grouping fix.
- **self-loop** — A→A. Routers must skip without crashing.
- **multi-parallel** — Three A→B edges all in the same direction.
  Tests lane spreading.
- **fan-out-8** — One hub with eight outgoing spokes.
- **fan-in-8** — Eight nodes all targeting one sink.

### Common shapes

- **line-3** — A→B→C straight chain.
- **tree-5** — Root with two children, each with one grandchild.
- **mesh-3x3** — 3×3 grid of nodes with horizontal + vertical neighbor
  edges (12 edges total).
- **hub-spoke** — One central node with six bidirectional spokes.
- **cycle-4** — A→B→C→D→A.

### Stress cases

- **dense** — 12 nodes in a circle, ~24 edges including some chords
  and a few parallels.
- **sparse** — 12 nodes in a 4×3 grid with only 5 long-span edges.

## How round 2 reads feedback

Round-2 agents should:

1. Look at `tools/routing-eval/feedback/feedback-<run>.json`. Schema:

   ```json
   {
     "runTimestamp": "20260524-061500",
     "ratedAt": "2026-05-24T06:23:11.000Z",
     "cells": {
       "charged-spring|anti-parallel": {"rating": 5, "comment": "..."},
       "bezier-route|anti-parallel":   {"rating": 1, "comment": "anti-parallel collapse"},
       ...
     }
   }
   ```

2. Cross-reference each low-rated cell with the corresponding
   `metrics.json` and `geometry.json` to confirm which metric (or
   visual flaw) the human flagged.
3. Decide whether the fix is a tuning change (round 2a) or a structural
   change (round 2b — needs a `notes/bug-*.md`).

## Deferred to round 2+

- Tuning automation / parameter sweeps.
- Per-graph vs. universal-default investigation.
- Flaw write-ups beyond the bug already in `dev-status.md`.
- Router bug fixes (file a `notes/bug-<slug>.md` if you spot one).
- Side-by-side viewer mode (the viewer is designed to grow into this).
- Waypoint-pinning UX work.
- Straight-vs-curved style flag and the router-choice ↔ curve-rendering
  coupling untangle. Left intact: routers that call `setSmoothRendering(true)`
  still do so; the harness ignores that flag since it renders polylines
  in SVG directly.
- libavoid-js integration.

## Why SVG instead of PNG

The original spec said "rendered snapshot (PNG)" but headless PNG
rendering needs the native `canvas` package (heavy build) or
puppeteer (slow per-cell). SVG renders identically across browsers,
is byte-deterministic given the same geometry, embeds cleanly in the
viewer with an `<object>` tag, and any reviewer can save it as PNG via
right-click. The `routing.svg` file is the snapshot.
