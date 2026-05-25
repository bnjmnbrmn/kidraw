#!/usr/bin/env node
// Metric explorer: scan every run under tools/routing-eval/runs/ for cells
// (metrics.json paired with routing.svg), then for each metric of interest
// pick five examples at the 0/25/50/75/100 percentile and render them in
// a static HTML page so a human can develop intuition for "what does a
// totalCurvature=10 graph look like vs totalCurvature=100?"
//
// Output: tools/routing-eval/analysis/metric-explorer-<ts>/index.html
//
// Usage:
//   node tools/routing-eval/metric-explorer.mjs
//   node tools/routing-eval/metric-explorer.mjs --metric totalCurvature
//   node tools/routing-eval/metric-explorer.mjs --bins 7
//
// The HTML embeds each SVG inline (full markup) so the file is self-
// contained and the zoom modal can clone the <svg> node directly. Serve
// the analysis dir with any static server.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = join(__dirname, 'runs');
const ANALYSIS_ROOT = join(__dirname, 'analysis');

const DEFAULT_METRICS = [
  'siblingCrossings',
  'edgesThroughNodes',
  'selfIntersections',
  'totalLength',
  'totalCurvature',
  'maxBulgeRatio',
  'minObstacleClearance',
  'minEdgeEdgeClearance',
  'nonSiblingCrossings',
];

function parseArgs(argv) {
  const out = { metrics: DEFAULT_METRICS, bins: 5 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node tools/routing-eval/metric-explorer.mjs [options]\n\n' +
        '  --metric <name>  Show only this metric (repeatable).\n' +
        '  --bins <n>       Number of percentile examples per metric (default 5).\n' +
        '  --help           Show this help.\n\n' +
        'Default metrics: ' + DEFAULT_METRICS.join(', '),
      );
      process.exit(0);
    } else if (a === '--metric') {
      const v = argv[++i];
      if (out.metrics === DEFAULT_METRICS) out.metrics = [];
      out.metrics.push(v);
    } else if (a === '--bins') {
      out.bins = Number(argv[++i]);
      if (!Number.isFinite(out.bins) || out.bins < 2 || out.bins > 20) {
        console.error('--bins must be an integer in [2, 20]');
        process.exit(1);
      }
    } else {
      console.error('Unknown arg: ' + a);
      process.exit(1);
    }
  }
  return out;
}

/** Walk RUNS_ROOT recursively, collecting cells: any directory containing
 *  both routing.svg and metrics.json. Returns an array of {svgPath, metrics,
 *  origin} where origin is the relative path from RUNS_ROOT for the cell. */
function collectCells(root) {
  const out = [];
  walk(root);
  return out;

  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    const hasSvg = entries.includes('routing.svg');
    const hasMetrics = entries.includes('metrics.json');
    if (hasSvg && hasMetrics) {
      const svgPath = join(dir, 'routing.svg');
      const metricsPath = join(dir, 'metrics.json');
      try {
        const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
        out.push({
          svgPath,
          metrics,
          origin: relative(root, dir).split(sep).join('/'),
        });
      } catch {}
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
    }
  }
}

/** Pick `bins` examples from a sorted array at evenly-spaced percentile
 *  positions (including 0 and 100). For 5 bins: 0%, 25%, 50%, 75%, 100%. */
function pickPercentiles(sorted, bins) {
  const out = [];
  if (sorted.length === 0) return out;
  if (sorted.length <= bins) return [...sorted];
  for (let i = 0; i < bins; i++) {
    const frac = i / (bins - 1);
    const idx = Math.round(frac * (sorted.length - 1));
    out.push(sorted[idx]);
  }
  return out;
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${suffix}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Strip the outer SVG XML declaration (we'll inline into HTML which
 *  doesn't need it) and return the markup. */
function loadSvgMarkup(path) {
  let s = readFileSync(path, 'utf8');
  s = s.replace(/^<\?xml[^?]*\?>\s*/, '');
  return s;
}

function buildHtml(metricRows, totalCells) {
  const head = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>routing-eval · metric explorer</title>
<style>
body { font: 12px/1.3 system-ui, sans-serif; margin: 16px; color: #222; }
h1 { font-size: 16px; margin: 0 0 4px; }
.subhead { color: #666; margin-bottom: 16px; }
.metric-section { margin-bottom: 28px; }
.metric-title { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.metric-desc { color: #555; margin-bottom: 8px; max-width: 800px; }
.row { display: grid; grid-template-columns: repeat(var(--cols), minmax(180px, 1fr)); gap: 6px; }
.cell { border: 1px solid #ddd; padding: 4px; background: white; cursor: zoom-in; }
.cell-label { font-family: ui-monospace, monospace; font-size: 11px; color: #444; margin-bottom: 2px; }
.cell-origin { font-family: ui-monospace, monospace; font-size: 10px; color: #888; margin-bottom: 2px; word-break: break-all; }
.cell svg { display: block; width: 100%; height: 140px; background: white; }
.zoom-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.78);
  display: none; align-items: center; justify-content: center;
  z-index: 1000; padding: 32px; box-sizing: border-box; cursor: zoom-out;
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
.zoom-meta { font-family: ui-monospace, monospace; color: #555; font-size: 12px; }
.zoom-close { border: 0; background: #eee; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 14px; }
.zoom-close:hover { background: #ddd; }
.zoom-svg-holder svg { display: block; width: min(85vw, 1200px); height: min(80vh, 900px); border: 1px solid #eee; }
</style>
</head><body>
<h1>routing-eval · metric explorer</h1>
<div class="subhead">${totalCells} cells found across tools/routing-eval/runs/.
For each metric, 5 examples at the 0 / 25 / 50 / 75 / 100 percentile.
<strong>Double-click any cell to zoom.</strong></div>
`;

  const rows = metricRows.map(row => {
    const cellsHtml = row.cells.map(c => `<div class="cell" data-label="${escapeHtml(`${row.metric} = ${formatVal(c.metrics[row.metric])}`)}" data-meta="${escapeHtml(c.origin)}">
  <div class="cell-label">${escapeHtml(row.metric)} = ${formatVal(c.metrics[row.metric])}</div>
  <div class="cell-origin">${escapeHtml(c.origin)}</div>
  ${c.svgMarkup}
</div>`).join('');
    return `<section class="metric-section">
  <div class="metric-title">${escapeHtml(row.metric)} <span style="font-weight:400;color:#666">(${row.cells.length} examples · range ${formatVal(row.min)} → ${formatVal(row.max)})</span></div>
  <div class="metric-desc">${escapeHtml(METRIC_DESCRIPTIONS[row.metric] ?? '')}</div>
  <div class="row" style="--cols: ${row.cells.length}">${cellsHtml}</div>
</section>`;
  }).join('\n');

  const modal = `<div class="zoom-backdrop" id="zoom">
  <div class="zoom-panel" id="zoom-panel">
    <header>
      <div>
        <div class="zoom-title" id="zoom-title"></div>
        <div class="zoom-meta" id="zoom-meta"></div>
      </div>
      <button class="zoom-close" id="zoom-close" type="button">Close (Esc)</button>
    </header>
    <div class="zoom-svg-holder" id="zoom-svg-holder"></div>
  </div>
</div>
<script>
(() => {
  const backdrop = document.getElementById('zoom');
  const panel    = document.getElementById('zoom-panel');
  const title    = document.getElementById('zoom-title');
  const meta     = document.getElementById('zoom-meta');
  const holder   = document.getElementById('zoom-svg-holder');
  const closeBtn = document.getElementById('zoom-close');

  function open(cell) {
    title.textContent = cell.dataset.label;
    meta.textContent  = cell.dataset.meta;
    holder.innerHTML = '';
    const svg = cell.querySelector('svg');
    if (svg) holder.appendChild(svg.cloneNode(true));
    backdrop.classList.add('open');
  }
  function close() {
    backdrop.classList.remove('open');
    holder.innerHTML = '';
  }
  document.querySelectorAll('.cell').forEach(c => c.addEventListener('dblclick', () => open(c)));
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  panel.addEventListener('click', e => e.stopPropagation());
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) close();
  });
})();
</script>
</body></html>`;

  return head + rows + '\n' + modal;
}

const METRIC_DESCRIPTIONS = {
  siblingCrossings: 'Count of pairs of edges in the same parallel-edge group whose interior segments cross. Should be 0 for any sane router.',
  edgesThroughNodes: 'Count of edges whose interior polyline passes through a non-incident node bounding box. Should be 0.',
  selfIntersections: 'Count of edges whose own polyline crosses itself. Should be 0.',
  totalLength: 'Sum of polyline-segment lengths across every edge (px). Lower is shorter wire; very high means edges are detouring far from their chord.',
  totalCurvature: 'Sum of all bend angles across every edge (radians). 0 = every edge perfectly straight. Higher = more wiggle.',
  maxBulgeRatio: 'Max perpendicular distance any interior point bulges from its chord, divided by chord length. 0 = straight. ~0.5 = bulges half as far as it is long.',
  minObstacleClearance: 'Smallest distance (px) from any interior control point to the nearest non-incident node bbox. Saturated at 60 px — beyond that, additional clearance is visually irrelevant.',
  minEdgeEdgeClearance: 'Smallest distance (px) between any two edges that do NOT share an endpoint. Saturated at 60 px. 0 = two non-incident edges crossed or touched; 60 = every edge pair is comfortably separated.',
  nonSiblingCrossings: 'Count of edge pairs from DIFFERENT parallel-edge groups whose interior polylines cross each other. Soft penalty (some crossings are unavoidable on dense graphs — K_n is non-planar for n > 4).',
};

function formatVal(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return v.toString();
  if (Math.abs(v) < 0.01) return v.toExponential(2);
  return v.toFixed(2);
}

async function main() {
  const args = parseArgs(process.argv);
  const cells = collectCells(RUNS_ROOT);
  if (cells.length === 0) {
    console.error(`No cells found under ${RUNS_ROOT}. Run the harness first: node tools/routing-eval/run.mjs`);
    process.exit(1);
  }

  const ts = timestamp();
  const outDir = join(ANALYSIS_ROOT, `metric-explorer-${ts}`);
  mkdirSync(outDir, { recursive: true });

  const metricRows = [];
  for (const metric of args.metrics) {
    const valid = cells.filter(c => typeof c.metrics[metric] === 'number');
    if (valid.length === 0) {
      console.warn(`metric "${metric}" not found in any cell — skipping`);
      continue;
    }
    const sorted = [...valid].sort((a, b) => a.metrics[metric] - b.metrics[metric]);
    const picks = pickPercentiles(sorted, args.bins);
    const withSvg = picks.map(c => ({ ...c, svgMarkup: loadSvgMarkup(c.svgPath) }));
    metricRows.push({
      metric,
      cells: withSvg,
      min: sorted[0].metrics[metric],
      max: sorted[sorted.length - 1].metrics[metric],
    });
    console.log(`  ${metric}: ${valid.length} cells, range ${formatVal(sorted[0].metrics[metric])} → ${formatVal(sorted[sorted.length - 1].metrics[metric])}, picking ${picks.length}`);
  }

  const html = buildHtml(metricRows, cells.length);
  const outFile = join(outDir, 'index.html');
  writeFileSync(outFile, html);

  console.log(`\nrouting-eval/metric-explorer: ${cells.length} cells scanned`);
  console.log(`routing-eval/metric-explorer: wrote ${outFile}`);
  console.log(`routing-eval/metric-explorer: open with:`);
  console.log(`  xdg-open ${outFile}`);
  console.log(`  # or:  python3 -m http.server -d ${outDir} 8767  # then http://localhost:8767/`);
}

main().catch(e => { console.error(e); process.exit(1); });
