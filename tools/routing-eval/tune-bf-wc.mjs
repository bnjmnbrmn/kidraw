#!/usr/bin/env node
// 2D fine-tuning grid for `bezier-fit-weighted-chain`.
//
// Runs the algorithm on a fixed scenario across every (dpTolerance,
// segmentLength) combination from two value lists, writes one SVG +
// metrics per cell, and emits a static HTML grid viewer (rows =
// dpTolerance, cols = segmentLength) so the matrix is browsable
// without a build step.
//
// Output layout:
//
//   runs/<ts>/tune-bf-wc-<scenario>/
//     index.html               — grid viewer
//     manifest.json            — machine-readable index
//     dp=<v>,seg=<v>/
//       routing.svg
//       metrics.json
//       geometry.json
//
// Usage:
//   node tools/routing-eval/tune-bf-wc.mjs                    # dense, default value lists
//   node tools/routing-eval/tune-bf-wc.mjs --scenario sparse  # different scenario
//   node tools/routing-eval/tune-bf-wc.mjs --dp 1,5,12 --seg 8,16
//   node tools/routing-eval/tune-bf-wc.mjs --force-bundle

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBundle } from './harness/build-bundle.mjs';
import { ALL_SCENARIOS } from './scenarios/index.mjs';
import { renderSvg } from './harness/render-svg.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = join(__dirname, 'runs');
const ALGORITHM = 'bezier-fit-weighted-chain';

// Default value lists. `dp` brackets the bezier-fit default (3); `seg` omits
// 0.5 (pathologically slow at default) and brackets the value (24) that
// looked promising on dense in the round-2 sweep.
const DEFAULT_DP_VALUES  = [1, 3, 8, 16, 32];
const DEFAULT_SEG_VALUES = [4, 8, 12, 16, 24];

function parseArgs(argv) {
  const out = {
    scenario: 'dense',
    dpValues: DEFAULT_DP_VALUES,
    segValues: DEFAULT_SEG_VALUES,
    forceBundle: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(
        `Usage: node tools/routing-eval/tune-bf-wc.mjs [options]\n\n` +
        `  --scenario <name>     Scenario name (default: dense).\n` +
        `  --dp <list>           Comma-separated dpTolerance values\n` +
        `                          (default: ${DEFAULT_DP_VALUES.join(',')}).\n` +
        `  --seg <list>          Comma-separated segmentLength values\n` +
        `                          (default: ${DEFAULT_SEG_VALUES.join(',')}).\n` +
        `  --force-bundle        Rebuild the bundled routers even if cached.\n` +
        `  --help                Show this help.\n\n` +
        `Scenarios: ${ALL_SCENARIOS.map(s => s.name).join(', ')}`,
      );
      process.exit(0);
    } else if (a === '--scenario') {
      out.scenario = argv[++i];
    } else if (a === '--dp') {
      out.dpValues = argv[++i].split(',').map(s => Number(s));
    } else if (a === '--seg') {
      out.segValues = argv[++i].split(',').map(s => Number(s));
    } else if (a === '--force-bundle') {
      out.forceBundle = true;
    } else {
      console.error(`Unknown argument: ${a} (try --help)`);
      process.exit(1);
    }
  }
  if (out.dpValues.some(v => !Number.isFinite(v) || v <= 0)) {
    console.error(`--dp values must be positive numbers`);
    process.exit(1);
  }
  if (out.segValues.some(v => !Number.isFinite(v) || v <= 0)) {
    console.error(`--seg values must be positive numbers`);
    process.exit(1);
  }
  return out;
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stem = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${stem}-${suffix}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const scenario = ALL_SCENARIOS.find(s => s.name === args.scenario);
  if (!scenario) {
    console.error(`Unknown scenario "${args.scenario}". Available: ${ALL_SCENARIOS.map(s => s.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`routing-eval/tune-bf-wc: bundling routers via esbuild...`);
  const bundle = await buildBundle({ force: args.forceBundle });
  console.log(`  bundle ${bundle.cached ? '(cached)' : '(rebuilt)'}`);

  const require = createRequire(import.meta.url);
  const mod = require(bundle.path);
  const { Routers, Metrics, Fake } = mod;
  const router = Routers[ALGORITHM];
  if (!router) {
    console.error(`Algorithm "${ALGORITHM}" not registered in the bundle.`);
    process.exit(1);
  }

  const ts = timestamp();
  const runDir = join(RUNS_ROOT, ts, `tune-bf-wc-${scenario.name}`);
  mkdirSync(runDir, { recursive: true });
  console.log(`routing-eval/tune-bf-wc: run ${ts} → ${runDir}`);

  // Refresh the runs/latest symlink so the regular viewer can also find this run.
  const latest = join(RUNS_ROOT, 'latest');
  try { rmSync(latest); } catch {}
  try { symlinkSync(ts, latest, 'dir'); } catch {}

  const cells = [];
  let cellsOk = 0, cellsFail = 0;

  for (const dp of args.dpValues) {
    for (const seg of args.segValues) {
      const { nodes, edges } = scenario.build({
        DANode: Fake.DANode,
        DAEdge: Fake.DAEdge,
      });
      const opts = {
        fit: { ...router.defaults.fit, dpTolerance: dp },
        wc:  { ...router.defaults.wc,  segmentLength: seg },
      };

      const cellDir = join(runDir, `dp=${dp},seg=${seg}`);
      mkdirSync(cellDir, { recursive: true });

      let ok = false, errMsg = null;
      const t0 = performance.now();
      try {
        router.apply(nodes, edges, opts);
        ok = true;
      } catch (e) {
        errMsg = e?.message ?? String(e);
      }
      const computeMs = performance.now() - t0;

      let metrics = null;
      let geometry = null;
      let svg = null;
      if (ok) {
        const baseMetrics = Metrics.compute(nodes, edges, Metrics.weights);
        let bendCount = 0;
        for (const e of edges) bendCount += e.controlPoints.length;
        metrics = {
          computeMs: Math.round(computeMs),
          siblingCrossings: baseMetrics.siblingCrossings,
          edgesThroughNodes: baseMetrics.edgesThroughNodes,
          selfIntersections: baseMetrics.selfIntersections,
          totalLength: Math.round(baseMetrics.totalLength),
          bendCount,
          totalCurvature: Number(baseMetrics.totalCurvature.toFixed(3)),
          minObstacleClearance: Number(baseMetrics.minObstacleClearance.toFixed(2)),
          maxBulgeRatio: Number(baseMetrics.maxBulgeRatio.toFixed(3)),
          hardFailCount: baseMetrics.hardFailCount,
        };
        geometry = {
          nodes: nodes.map(n => ({
            id: n.id, x: n.konvaGroup.x(), y: n.konvaGroup.y(),
            w: n.NODE_WIDTH, h: n.NODE_HEIGHT,
          })),
          edges: edges.map(e => ({
            id: e.id, src: e.srcNode.id, dest: e.destNode.id,
            controlPoints: e.controlPoints.map(p => ({x: p.x, y: p.y})),
            pathPoints: e.getPathPoints().map(p => ({x: p.x, y: p.y})),
            smoothRendering: e.smoothRendering,
          })),
        };
        svg = renderSvg({
          nodes, edges,
          algorithm: `${ALGORITHM} (dp=${dp}, seg=${seg})`,
          scenario: scenario.name,
        });
        writeFileSync(join(cellDir, 'routing.svg'), svg);
        writeFileSync(join(cellDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
        writeFileSync(join(cellDir, 'geometry.json'), JSON.stringify(geometry, null, 2));
        cellsOk++;
      } else {
        writeFileSync(join(cellDir, 'error.txt'), errMsg + '\n');
        cellsFail++;
      }
      cells.push({ dpTolerance: dp, segmentLength: seg, ok, errMsg, metrics });
      const status = ok ? `[ok]` : `[FAIL]`;
      const summary = ok
        ? `t=${String(Math.round(computeMs)).padStart(5)}ms sibCross=${metrics.siblingCrossings} hardFail=${metrics.hardFailCount} bends=${metrics.bendCount} tCurv=${metrics.totalCurvature}`
        : errMsg;
      console.log(`  ${status} dp=${String(dp).padStart(2)} seg=${String(seg).padStart(2)}    ${summary}`);
    }
  }

  const manifest = {
    timestamp: ts,
    algorithm: ALGORITHM,
    scenario: { name: scenario.name, description: scenario.description },
    knobs: { dp: 'fit.dpTolerance', seg: 'wc.segmentLength' },
    dpValues: args.dpValues,
    segValues: args.segValues,
    defaults: {
      dp: router.defaults.fit.dpTolerance,
      seg: router.defaults.wc.segmentLength,
    },
    cells,
  };
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Static HTML grid viewer.
  writeFileSync(join(runDir, 'index.html'), buildGridHtml(manifest));

  console.log(`\nrouting-eval/tune-bf-wc: ${cellsOk} cells ok, ${cellsFail} failed`);
  console.log(`routing-eval/tune-bf-wc: open the grid with:`);
  console.log(`  python3 -m http.server -d ${runDir} 8766`);
  console.log(`  then visit http://localhost:8766/index.html`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildGridHtml(m) {
  const cellsByKey = {};
  for (const c of m.cells) cellsByKey[`${c.dpTolerance}|${c.segmentLength}`] = c;
  const defaultDp = m.defaults.dp;
  const defaultSeg = m.defaults.seg;

  const headerCols = m.segValues
    .map(seg => {
      const isDefault = seg === defaultSeg;
      return `<th class="${isDefault ? 'default' : ''}">seg = ${seg}${isDefault ? ' ★' : ''}</th>`;
    })
    .join('');

  const rowsHtml = m.dpValues.map(dp => {
    const isRowDefault = dp === defaultDp;
    const rowLabel = `<th class="${isRowDefault ? 'default' : ''}">dp = ${dp}${isRowDefault ? ' ★' : ''}</th>`;
    const cellsHtml = m.segValues.map(seg => {
      const c = cellsByKey[`${dp}|${seg}`];
      if (!c || !c.ok) {
        return `<td class="fail"><div class="cell-label">dp=${dp}, seg=${seg}</div><div class="error">${escapeHtml(c?.errMsg ?? 'missing')}</div></td>`;
      }
      const md = c.metrics;
      const isCellDefault = (dp === defaultDp) && (seg === defaultSeg);
      const svgPath = `dp=${dp},seg=${seg}/routing.svg`;
      const metricsLine = `t=${md.computeMs}ms · sibCross=${md.siblingCrossings} · hardFail=${md.hardFailCount} · bends=${md.bendCount} · tCurv=${md.totalCurvature}`;
      const label = `dp=${dp}, seg=${seg}${isCellDefault ? ' ★' : ''}`;
      return `<td class="${isCellDefault ? 'cell-default' : ''}"
          data-svg="${escapeHtml(svgPath)}"
          data-label="${escapeHtml(label)}"
          data-metrics="${escapeHtml(metricsLine)}"
          title="Double-click to zoom">
        <div class="cell-label">${escapeHtml(label)}</div>
        <object type="image/svg+xml" data="${escapeHtml(svgPath)}"></object>
        <div class="metrics">${escapeHtml(metricsLine)}</div>
      </td>`;
    }).join('');
    return `<tr>${rowLabel}${cellsHtml}</tr>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>tune-bf-wc · ${escapeHtml(m.scenario.name)}</title>
<style>
body { font: 12px/1.3 system-ui, sans-serif; margin: 16px; color: #222; }
h1 { font-size: 16px; margin: 0 0 4px; }
.subhead { color: #666; margin-bottom: 12px; }
table { border-collapse: separate; border-spacing: 0; }
th { font-weight: 600; background: #f4f4f4; padding: 6px 8px; text-align: center;
     position: sticky; }
th.default { background: #e6f3e6; color: #1a4d1a; }
td { vertical-align: top; padding: 4px; border: 1px solid #ddd; background: white; }
td.cell-default { outline: 2px solid #2a8f2a; outline-offset: -2px; background: #f4fbf4; }
td.fail { background: #fee; color: #800; min-width: 200px; }
.cell-label { font-weight: 600; margin-bottom: 4px; color: #444; }
object { display: block; width: 320px; height: 240px; border: 1px solid #eee;
         background: white; }
.metrics { margin-top: 4px; font-family: ui-monospace, monospace; color: #555;
           font-size: 11px; }
.error { font-family: ui-monospace, monospace; }
.legend { margin: 8px 0; color: #666; }
td[data-svg] { cursor: zoom-in; }
.zoom-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.78);
  display: none; align-items: center; justify-content: center;
  z-index: 1000; padding: 32px; box-sizing: border-box;
  cursor: zoom-out;
}
.zoom-backdrop.open { display: flex; }
.zoom-panel {
  background: white; border-radius: 8px; padding: 16px;
  max-width: 95vw; max-height: 95vh; display: flex; flex-direction: column;
  cursor: default;
}
.zoom-panel header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 8px; gap: 24px;
}
.zoom-title { font-weight: 600; font-size: 14px; }
.zoom-metrics { font-family: ui-monospace, monospace; color: #555; font-size: 12px; }
.zoom-close {
  border: 0; background: #eee; padding: 4px 10px; border-radius: 4px;
  cursor: pointer; font-size: 14px; color: #333;
}
.zoom-close:hover { background: #ddd; }
.zoom-panel object {
  display: block; flex: 1 1 auto;
  width: min(85vw, 1200px); height: min(80vh, 900px);
  border: 1px solid #eee;
}
</style>
</head>
<body>
<h1>tune-bf-wc · scenario: ${escapeHtml(m.scenario.name)}</h1>
<div class="subhead">${escapeHtml(m.scenario.description)}</div>
<div class="legend">
  Rows: <code>fit.dpTolerance</code> (lower = more control points / faithful to physics).
  Cols: <code>wc.segmentLength</code> (lower = denser raw chain).
  ★ = current default (${defaultDp} dp, ${defaultSeg} seg).
  <strong>Double-click a cell to zoom.</strong>
  Metrics: <code>sibCross</code> = same-parallel-group edges crossing (should be 0),
  <code>hardFail</code> = edges through nodes + sibling crossings + self-intersections (lower is better),
  <code>bends</code> = total control points across all edges,
  <code>tCurv</code> = sum of all bend angles (radians).
</div>
<table>
<thead><tr><th></th>${headerCols}</tr></thead>
<tbody>${rowsHtml}</tbody>
</table>

<div class="zoom-backdrop" id="zoom">
  <div class="zoom-panel" id="zoom-panel">
    <header>
      <div>
        <div class="zoom-title" id="zoom-title"></div>
        <div class="zoom-metrics" id="zoom-metrics"></div>
      </div>
      <button class="zoom-close" id="zoom-close" type="button">Close (Esc)</button>
    </header>
    <object type="image/svg+xml" id="zoom-svg"></object>
  </div>
</div>

<script>
(() => {
  const backdrop = document.getElementById('zoom');
  const panel    = document.getElementById('zoom-panel');
  const title    = document.getElementById('zoom-title');
  const metrics  = document.getElementById('zoom-metrics');
  const svg      = document.getElementById('zoom-svg');
  const closeBtn = document.getElementById('zoom-close');

  function open(td) {
    title.textContent   = td.dataset.label;
    metrics.textContent = td.dataset.metrics;
    svg.setAttribute('data', td.dataset.svg);
    backdrop.classList.add('open');
  }
  function close() {
    backdrop.classList.remove('open');
    svg.removeAttribute('data');
  }

  document.querySelectorAll('td[data-svg]').forEach(td => {
    td.addEventListener('dblclick', () => open(td));
  });
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  panel.addEventListener('click', e => e.stopPropagation());
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) close();
  });
})();
</script>
</body>
</html>`;
}

main().catch(e => { console.error(e); process.exit(1); });
