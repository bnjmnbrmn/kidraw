#!/usr/bin/env node
// routing-eval parameter sweep.
//
// Drives the same bundled routers + fake-DA layer as run.mjs but varies a
// single parameter per (algorithm × scenario) cell. Output layout:
//
//   runs/<ts>/sweep/<algorithm>/<scenario>/<param>=<value>/
//     routing.svg     — visual
//     metrics.json    — per-cell metrics (same fields as run.mjs)
//     geometry.json   — full node/edge geometry
//   runs/<ts>/sweep/index.html
//                     — grid viewer: scenario rows × value columns per algo
//   runs/<ts>/sweep/sweep-manifest.json
//                     — machine-readable index of the runs above.
//
// The "values" list per (algo, param) is hand-picked in SWEEP_PLAN below
// based on the virtue/vice comments in each *-edges.ts file and the round-2
// feedback complaints (notes/agents/graph-auto-layout.md task spec).
//
// Usage:
//   node tools/routing-eval/sweep.mjs              # full plan
//   node tools/routing-eval/sweep.mjs --algorithm flexible-wire
//   node tools/routing-eval/sweep.mjs --scenario dense
//   node tools/routing-eval/sweep.mjs --force-bundle

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBundle } from './harness/build-bundle.mjs';
import { ALL_SCENARIOS } from './scenarios/index.mjs';
import { renderSvg } from './harness/render-svg.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = join(__dirname, 'runs');

// --- Sweep plan ----------------------------------------------------------
//
// After consolidation only bezier-fit-weighted-chain remains. This sweep
// covers its two primary knobs separately for the headline scenarios; a
// joint dp × seg grid is more useful and lives in tune-bf-wc.mjs.

const SWEEP_PLAN = {
  'bezier-fit-weighted-chain': {
    // fit.dpTolerance is the Douglas-Peucker simplification threshold (px).
    // Lower = more control points, closer to the underlying chain. Higher =
    // simpler curve, cruder approximation. Wiggles on dense come from too
    // many preserved bends.
    param: 'fit.dpTolerance',
    values: [1, 3, 8, 16],
    scenarios: ['dense', 'sparse'],
    setOption: (defaults, v) => ({
      fit: { ...defaults.fit, dpTolerance: v },
      wc: { ...defaults.wc },
    }),
  },
};

// --- CLI -----------------------------------------------------------------

function parseArgs(argv) {
  const out = { algorithm: null, scenario: null, forceBundle: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node tools/routing-eval/sweep.mjs [options]\n\n' +
        '  --algorithm <name>    Sweep only this algorithm.\n' +
        '  --scenario <name>     Sweep only this scenario.\n' +
        '  --force-bundle        Rebuild the bundled routers even if cached.\n' +
        '  --help                Show this help.\n\n' +
        'Algorithms covered: ' + Object.keys(SWEEP_PLAN).join(', ') + '\n' +
        '(bezier-route is intentionally omitted — no round-2 wiggle complaint.)',
      );
      process.exit(0);
    } else if (a === '--algorithm') {
      out.algorithm = argv[++i];
    } else if (a === '--scenario') {
      out.scenario = argv[++i];
    } else if (a === '--force-bundle') {
      out.forceBundle = true;
    } else {
      console.error('Unknown arg: ' + a);
      process.exit(2);
    }
  }
  return out;
}

function pad(n) { return String(n).padStart(2, '0'); }
function randomSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 3; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function timestamp() {
  const d = new Date();
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-` +
    randomSuffix()
  );
}

// --- Metrics (mirror of run.mjs; kept in-file so the two scripts stay
//     decoupled and either can evolve independently) ---------------------

function maxCurvatureOf(edges) {
  let max = 0;
  for (const e of edges) {
    const poly = e.getPathPoints();
    for (let i = 1; i < poly.length - 1; i++) {
      const a = poly[i - 1], b = poly[i], c = poly[i + 1];
      const dx1 = b.x - a.x, dy1 = b.y - a.y;
      const dx2 = c.x - b.x, dy2 = c.y - b.y;
      const len1 = Math.hypot(dx1, dy1) || 1;
      const len2 = Math.hypot(dx2, dy2) || 1;
      const cos = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (ang > max) max = ang;
    }
  }
  return max;
}

function bendCountOf(edges) {
  let total = 0;
  for (const e of edges) total += e.controlPoints.length;
  return total;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function crossingsOf(edges) {
  const segs = [];
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    if (e.srcNode === e.destNode) continue;
    const poly = e.getPathPoints();
    for (let i = 0; i < poly.length - 1; i++) {
      segs.push({ edgeIdx: ei, a: poly[i], b: poly[i + 1] });
    }
  }
  let count = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].edgeIdx === segs[j].edgeIdx) continue;
      if (segmentsIntersect(segs[i].a, segs[i].b, segs[j].a, segs[j].b)) count++;
    }
  }
  return count;
}

// --- File system helpers -------------------------------------------------

function ensureRunsRoot() {
  mkdirSync(RUNS_ROOT, { recursive: true });
}

function updateLatestSymlink(target) {
  const link = join(RUNS_ROOT, 'latest');
  try { rmSync(link, { force: true }); } catch {}
  try {
    symlinkSync(target, link, 'dir');
  } catch {
    writeFileSync(join(RUNS_ROOT, 'latest.txt'), target + '\n', 'utf8');
  }
}

/** Filename-safe rendering of a sweep value. We use 'p' as the decimal
 *  separator so paths stay shell-friendly. */
function valueLabel(v) {
  return String(v).replace('.', 'p');
}

// --- Main ----------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  ensureRunsRoot();

  console.log('routing-eval sweep: bundling routers via esbuild...');
  const t0 = Date.now();
  const bundle = await buildBundle({ force: args.forceBundle });
  console.log(`  ${bundle.cached ? 'cached' : 'built'} in ${Date.now() - t0} ms`);

  const require = createRequire(import.meta.url);
  const mod = require(bundle.path);
  const { Routers, Metrics, Fake } = mod;

  const planEntries = Object.entries(SWEEP_PLAN).filter(
    ([algoName]) => !args.algorithm || algoName === args.algorithm,
  );
  if (planEntries.length === 0) {
    console.error(`No matching algorithm "${args.algorithm}" in sweep plan. Try --help.`);
    process.exit(2);
  }

  const runTs = timestamp();
  const sweepRoot = join(RUNS_ROOT, runTs, 'sweep');
  mkdirSync(sweepRoot, { recursive: true });
  console.log(`routing-eval sweep: run ${runTs} → ${sweepRoot}`);

  const sweepCells = [];

  for (const [algoName, plan] of planEntries) {
    const router = Routers[algoName];
    if (!router) {
      console.error(`Bundle missing router "${algoName}", skipping.`);
      continue;
    }
    const scenarios = ALL_SCENARIOS.filter(
      s =>
        plan.scenarios.includes(s.name) &&
        (!args.scenario || s.name === args.scenario),
    );
    if (scenarios.length === 0) continue;

    for (const scenario of scenarios) {
      for (const value of plan.values) {
        // Fresh nodes/edges per run — routers mutate state.
        const { nodes, edges } = scenario.build({
          DANode: Fake.DANode,
          DAEdge: Fake.DAEdge,
        });
        const opts = plan.setOption(router.defaults, value);

        const cellDir = join(
          sweepRoot,
          algoName,
          scenario.name,
          `${plan.param}=${valueLabel(value)}`,
        );
        mkdirSync(cellDir, { recursive: true });

        let ok = true;
        let errorMessage = null;
        let computeTimeMs = 0;
        const tStart = Date.now();
        try {
          router.apply(nodes, edges, opts);
          computeTimeMs = Date.now() - tStart;
        } catch (err) {
          ok = false;
          computeTimeMs = Date.now() - tStart;
          errorMessage = String(err?.stack || err);
          console.error(`  [FAIL] ${algoName} / ${scenario.name} / ${plan.param}=${value}: ${err?.message || err}`);
        }

        const baseMetrics = Metrics.compute(nodes, edges, Metrics.weights);
        const metrics = {
          ok,
          errorMessage,
          algorithm: algoName,
          scenario: scenario.name,
          sweptParam: plan.param,
          sweptValue: value,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          computeTimeMs,
          edgeCrossings: crossingsOf(edges),
          bendCount: bendCountOf(edges),
          maxCurvature: maxCurvatureOf(edges),
          siblingCrossings: baseMetrics.siblingCrossings,
          edgesThroughNodes: baseMetrics.edgesThroughNodes,
          selfIntersections: baseMetrics.selfIntersections,
          totalLength: baseMetrics.totalLength,
          totalCurvature: baseMetrics.totalCurvature,
          maxBulgeRatio: baseMetrics.maxBulgeRatio,
          minObstacleClearance: baseMetrics.minObstacleClearance,
          minEdgeEdgeClearance: baseMetrics.minEdgeEdgeClearance,
          nonSiblingCrossings: baseMetrics.nonSiblingCrossings,
          minCrossingAngleDeg: baseMetrics.minCrossingAngleDeg,
          compositeScore: baseMetrics.composite,
          hardFailCount: baseMetrics.hardFailCount,
        };

        const geometry = {
          algorithm: algoName,
          scenario: scenario.name,
          sweptParam: plan.param,
          sweptValue: value,
          nodes: nodes.map(n => ({
            id: n.id,
            x: n.konvaGroup.x(),
            y: n.konvaGroup.y(),
            width: n.NODE_WIDTH,
            height: n.NODE_HEIGHT,
            shape: n.nodeShape,
          })),
          edges: edges.map(e => ({
            id: e.id,
            src: e.srcNode.id,
            dest: e.destNode.id,
            controlPoints: e.controlPoints.map(p => ({ x: p.x, y: p.y })),
            renderedPath: e.getPathPoints(),
            smoothRendering: !!e.smoothRendering,
          })),
        };

        const svg = renderSvg({ nodes, edges, algorithm: algoName, scenario: scenario.name });

        writeFileSync(join(cellDir, 'routing.svg'), svg, 'utf8');
        writeFileSync(join(cellDir, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');
        writeFileSync(join(cellDir, 'geometry.json'), JSON.stringify(geometry, null, 2), 'utf8');

        sweepCells.push({
          algorithm: algoName,
          scenario: scenario.name,
          param: plan.param,
          value,
          ok,
          errorMessage,
          relPath: `${algoName}/${scenario.name}/${plan.param}=${valueLabel(value)}`,
          metrics,
        });

        const tag = ok ? 'ok' : 'FAIL';
        console.log(
          `  [${tag}] ${algoName.padEnd(28)} ${scenario.name.padEnd(14)} ${plan.param}=${String(value).padEnd(6)} ` +
          `t=${String(computeTimeMs).padStart(5)}ms cross=${metrics.edgeCrossings} bends=${metrics.bendCount} ` +
          `tCurv=${metrics.totalCurvature.toFixed(2)} bulge=${metrics.maxBulgeRatio.toFixed(2)}`,
        );
      }
    }
  }

  const sweepManifest = {
    timestamp: runTs,
    generatedAt: new Date().toISOString(),
    plan: Object.fromEntries(
      Object.entries(SWEEP_PLAN).map(([k, v]) => [
        k,
        { param: v.param, values: v.values, scenarios: v.scenarios },
      ]),
    ),
    cells: sweepCells,
  };
  writeFileSync(
    join(sweepRoot, 'sweep-manifest.json'),
    JSON.stringify(sweepManifest, null, 2),
    'utf8',
  );

  writeFileSync(join(sweepRoot, 'index.html'), renderSweepIndex(sweepManifest), 'utf8');

  // Point latest/ at the sweep's parent run dir so the existing run viewer
  // can still find a sane "latest" — but the sweep viewer is the standalone
  // index.html below.
  updateLatestSymlink(runTs);

  console.log(`routing-eval sweep: ${sweepCells.length} cells written → ${sweepRoot}`);
  console.log('routing-eval sweep: open the grid viewer with:');
  console.log(`  python3 -m http.server -d ${sweepRoot} 8766`);
  console.log('  then visit http://localhost:8766/index.html');
}

// --- Grid viewer ---------------------------------------------------------
//
// A single static index.html. For each algorithm: one grid per scenario,
// rows of SVG thumbnails ordered by sweep value. The current default is
// highlighted via a CSS class. No JavaScript: just <object data="..."> tags
// so the SVGs render inline and the user can ctrl-click into one for full
// size.

function renderSweepIndex(manifest) {
  const cellsByAlgo = new Map();
  for (const c of manifest.cells) {
    let byScenario = cellsByAlgo.get(c.algorithm);
    if (!byScenario) {
      byScenario = new Map();
      cellsByAlgo.set(c.algorithm, byScenario);
    }
    let bucket = byScenario.get(c.scenario);
    if (!bucket) { bucket = []; byScenario.set(c.scenario, bucket); }
    bucket.push(c);
  }

  const sections = [];
  sections.push(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>routing-eval sweep ${escapeHtml(manifest.timestamp)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 16px; background: #f7f7f7; }
  h1 { font-size: 20px; margin-top: 0; }
  h2 { font-size: 17px; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  h3 { font-size: 14px; margin: 18px 0 6px 0; color: #444; }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .cell { background: white; border: 1px solid #ddd; padding: 6px; border-radius: 4px; }
  .cell.def { border-color: #2a7; border-width: 2px; }
  .cell .label { font-size: 12px; font-family: monospace; color: #333; margin-bottom: 4px; }
  .cell .metrics { font-size: 11px; color: #666; margin-top: 4px; line-height: 1.3; }
  .cell object { width: 100%; height: 240px; display: block; background: white; }
  .meta { font-size: 12px; color: #666; }
  a { color: #248; }
</style>
</head>
<body>
<h1>routing-eval sweep · ${escapeHtml(manifest.timestamp)}</h1>
<p class="meta">${manifest.cells.length} cells · generated ${escapeHtml(manifest.generatedAt)}.
Default value is highlighted in green. Cell metrics show edge crossings, total bend count,
total curvature (sum of absolute turn angles in radians), and max bulge ratio.</p>`);

  for (const [algoName, byScenario] of cellsByAlgo) {
    const plan = manifest.plan[algoName];
    sections.push(`<h2>${escapeHtml(algoName)} — swept <code>${escapeHtml(plan.param)}</code></h2>`);
    for (const [scen, cells] of byScenario) {
      cells.sort((a, b) => a.value - b.value);
      sections.push(`<h3>${escapeHtml(scen)}</h3>`);
      sections.push('<div class="row">');
      for (const c of cells) {
        const isDefault = isDefaultValue(algoName, c.value);
        const classes = ['cell'];
        if (isDefault) classes.push('def');
        const m = c.metrics;
        sections.push(
          `<div class="${classes.join(' ')}">` +
            `<div class="label">${escapeHtml(c.param)}=${escapeHtml(String(c.value))}` +
            (isDefault ? ' <span style="color:#2a7">(default)</span>' : '') +
            `</div>` +
            `<object type="image/svg+xml" data="${escapeHtml(c.relPath)}/routing.svg"></object>` +
            `<div class="metrics">` +
              `cross=${m.edgeCrossings} · bends=${m.bendCount} · ` +
              `tCurv=${m.totalCurvature.toFixed(2)} · bulge=${m.maxBulgeRatio.toFixed(2)}` +
            `</div>` +
          `</div>`,
        );
      }
      sections.push('</div>');
    }
  }

  sections.push('</body></html>');
  return sections.join('\n');
}

// Defaults baked from each *-edges.ts file. Kept in-file (rather than read
// out of the bundle) so the viewer page can mark them without re-loading
// the heavy bundle module.
const DEFAULT_VALUES = {
  'charged-spring': 0.4,
  'bezier-fit-charged-spring': 3,
  'flexible-wire': 0.3,
  'weighted-chain': 0.5,
};

function isDefaultValue(algoName, value) {
  return DEFAULT_VALUES[algoName] === value;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
