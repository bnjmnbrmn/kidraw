#!/usr/bin/env node
// Pairwise weight calibration for the composite metric.
//
// The composite score in src/app/drawing-area/edge-routing-metrics.ts
// weights four signals (totalLength, totalCurvature, maxBulgeRatio,
// minObstacleClearance) with hand-tuned coefficients. This tool lets a
// human rate which of two cells looks better; after enough picks, it
// fits the four weights to maximize agreement with the user's judgment.
// The result tells us whether the current composite is well-calibrated
// or needs new weights before the Phase 3 optimizer uses it.
//
// Output: a self-contained HTML page at
//   tools/routing-eval/analysis/metric-calibrate-<ts>/index.html
// embedding ~200 candidate pairs sampled from every cell currently
// under runs/. Open the page, click "A better / Tie / B better" on
// each pair, then "Fit weights" runs in-browser logistic regression
// on the picks and reports fitted weights + agreement rate.
//
// Usage:
//   node tools/routing-eval/metric-calibrate.mjs           # 200 pairs
//   node tools/routing-eval/metric-calibrate.mjs --pairs 400

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = join(__dirname, 'runs');
const ANALYSIS_ROOT = join(__dirname, 'analysis');

const FEATURE_KEYS = ['totalLength', 'totalCurvature', 'maxBulgeRatio', 'minObstacleClearance', 'minEdgeEdgeClearance', 'nonSiblingCrossings'];
const HARD_FAIL_KEYS = ['siblingCrossings', 'edgesThroughNodes', 'selfIntersections'];

function parseArgs(argv) {
  const out = { pairs: 200, seed: 42 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node tools/routing-eval/metric-calibrate.mjs [options]\n\n' +
        '  --pairs <n>   Number of candidate pairs to sample (default 200).\n' +
        '  --seed <n>    PRNG seed for pair sampling (default 42).\n' +
        '  --help        Show this help.\n',
      );
      process.exit(0);
    } else if (a === '--pairs') {
      out.pairs = Number(argv[++i]);
    } else if (a === '--seed') {
      out.seed = Number(argv[++i]);
    } else {
      console.error('Unknown arg: ' + a);
      process.exit(1);
    }
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

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loadSvgMarkup(path) {
  return readFileSync(path, 'utf8').replace(/^<\?xml[^?]*\?>\s*/, '');
}

function collectCells(root) {
  const out = [];
  walk(root);
  return out;
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    if (entries.includes('routing.svg') && entries.includes('metrics.json')) {
      try {
        const metrics = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'));
        const allFeaturesPresent = FEATURE_KEYS.every(k => typeof metrics[k] === 'number');
        if (allFeaturesPresent) {
          const hardFails = HARD_FAIL_KEYS.reduce((s, k) => s + (Number(metrics[k]) || 0), 0);
          if (hardFails === 0) {
            out.push({
              svgPath: join(dir, 'routing.svg'),
              metrics,
              origin: relative(root, dir).split(sep).join('/'),
            });
          }
        }
      } catch {}
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
    }
  }
}

/** Sample N pairs from cells, preferring pairs with larger feature-space
 *  separation so the user is making meaningful judgments. Uses inverse-
 *  rank sampling: random pairs are scored by squared feature-diff in
 *  normalized units, and the top half by separation is kept. */
function samplePairs(cells, count, rng) {
  if (cells.length < 2) return [];
  const ranges = computeRanges(cells);
  const norm = m => FEATURE_KEYS.map(k => {
    const r = ranges[k];
    return r.max > r.min ? (m[k] - r.min) / (r.max - r.min) : 0;
  });
  const cellsN = cells.map(c => ({ cell: c, n: norm(c.metrics) }));

  const oversample = Math.max(count * 4, 200);
  const candidates = [];
  for (let i = 0; i < oversample; i++) {
    const aIdx = Math.floor(rng() * cellsN.length);
    let bIdx = Math.floor(rng() * cellsN.length);
    if (bIdx === aIdx) bIdx = (bIdx + 1) % cellsN.length;
    const a = cellsN[aIdx], b = cellsN[bIdx];
    let sep = 0;
    for (let k = 0; k < FEATURE_KEYS.length; k++) {
      const d = a.n[k] - b.n[k];
      sep += d * d;
    }
    candidates.push({ a: a.cell, b: b.cell, sep });
  }
  candidates.sort((x, y) => y.sep - x.sep);
  return candidates.slice(0, count);
}

function computeRanges(cells) {
  const r = {};
  for (const k of FEATURE_KEYS) r[k] = { min: Infinity, max: -Infinity };
  for (const c of cells) {
    for (const k of FEATURE_KEYS) {
      const v = c.metrics[k];
      if (v < r[k].min) r[k].min = v;
      if (v > r[k].max) r[k].max = v;
    }
  }
  return r;
}

function buildHtml({ pairs, ranges }) {
  const pairsJson = JSON.stringify(pairs.map((p, idx) => ({
    id: idx,
    a: {
      origin: p.a.origin,
      svg: loadSvgMarkup(p.a.svgPath),
      features: FEATURE_KEYS.reduce((o, k) => (o[k] = p.a.metrics[k], o), {}),
    },
    b: {
      origin: p.b.origin,
      svg: loadSvgMarkup(p.b.svgPath),
      features: FEATURE_KEYS.reduce((o, k) => (o[k] = p.b.metrics[k], o), {}),
    },
  })));

  const rangesJson = JSON.stringify(ranges);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>routing-eval · metric calibration</title>
<style>
body { font: 13px/1.4 system-ui, sans-serif; margin: 16px; color: #222; max-width: 1400px; }
h1 { font-size: 16px; margin: 0 0 8px; }
.bar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.bar button { padding: 6px 12px; border: 1px solid #999; background: #f0f0f0; cursor: pointer; border-radius: 4px; font-size: 13px; }
.bar button:hover { background: #e0e0e0; }
.bar button.primary { background: #1f6feb; color: white; border-color: #1f6feb; }
.bar button.primary:hover { background: #1859c2; }
.progress { font-family: ui-monospace, monospace; color: #555; }
.pair { display: grid; grid-template-columns: 1fr 80px 1fr; gap: 12px; align-items: start; margin-bottom: 12px; }
.side { border: 1px solid #ddd; background: white; padding: 8px; }
.side h3 { font-size: 13px; margin: 0 0 4px; color: #444; }
.side .origin { font-family: ui-monospace, monospace; font-size: 11px; color: #888; word-break: break-all; margin-bottom: 4px; }
.side .features { font-family: ui-monospace, monospace; font-size: 11px; color: #555; margin-bottom: 6px; }
.side svg { display: block; width: 100%; height: 360px; background: white; }
.choice-col { display: flex; flex-direction: column; gap: 8px; padding-top: 100px; }
.choice-col button { padding: 12px 8px; border: 1px solid #555; background: white; cursor: pointer; border-radius: 4px; font-size: 12px; font-weight: 600; }
.choice-col button:hover { background: #f0f0f0; }
.choice-col button.picked { background: #2a8f2a; color: white; border-color: #2a8f2a; }
.fit-result { margin-top: 16px; padding: 12px; background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre; }
</style>
</head><body>
<h1>routing-eval · pairwise metric calibration</h1>
<div class="bar">
  <span class="progress" id="progress">0 / ${pairs.length} pairs rated</span>
  <button id="prev">← prev</button>
  <button id="next">next →</button>
  <button id="skip">skip</button>
  <button class="primary" id="fit">Fit weights from ratings</button>
  <button id="download">Download picks JSON</button>
  <button id="reset">Reset ratings (clear localStorage)</button>
</div>
<div class="pair" id="pair-host"></div>
<div id="fit-result-host"></div>

<script>
const PAIRS = ${pairsJson};
const RANGES = ${rangesJson};
const FEATURE_KEYS = ${JSON.stringify(FEATURE_KEYS)};
const HAND_TUNED_WEIGHTS = { totalLength: -0.01, totalCurvature: -2, maxBulgeRatio: -50, minObstacleClearance: 0.5, minEdgeEdgeClearance: 0.5, nonSiblingCrossings: -5 };
const STORAGE_KEY = 'routing-eval:metric-calibrate:picks';

const state = {
  cursor: 0,
  picks: loadPicks(),
};

function loadPicks() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}
function savePicks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.picks));
}

function render() {
  const p = PAIRS[state.cursor];
  if (!p) return;
  const host = document.getElementById('pair-host');
  const fmt = v => Number.isInteger(v) ? v.toString() : v.toFixed(2);
  const featRow = f => FEATURE_KEYS.map(k => k + '=' + fmt(f[k])).join('  ');
  const pick = state.picks[p.id];

  host.innerHTML = \`
    <div class="side">
      <h3>A</h3>
      <div class="origin">\${escapeHtml(p.a.origin)}</div>
      <div class="features">\${escapeHtml(featRow(p.a.features))}</div>
      \${p.a.svg}
    </div>
    <div class="choice-col">
      <button data-pick="a"\${pick === 'a' ? ' class="picked"' : ''}>A is better</button>
      <button data-pick="tie"\${pick === 'tie' ? ' class="picked"' : ''}>Tie</button>
      <button data-pick="b"\${pick === 'b' ? ' class="picked"' : ''}>B is better</button>
    </div>
    <div class="side">
      <h3>B</h3>
      <div class="origin">\${escapeHtml(p.b.origin)}</div>
      <div class="features">\${escapeHtml(featRow(p.b.features))}</div>
      \${p.b.svg}
    </div>
  \`;
  host.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      state.picks[p.id] = b.dataset.pick;
      savePicks();
      renderProgress();
      state.cursor = Math.min(PAIRS.length - 1, state.cursor + 1);
      render();
    });
  });
}

function renderProgress() {
  const rated = Object.values(state.picks).filter(v => v === 'a' || v === 'b').length;
  const tied = Object.values(state.picks).filter(v => v === 'tie').length;
  document.getElementById('progress').textContent =
    \`\${state.cursor + 1} / \${PAIRS.length} (\${rated} rated, \${tied} ties) — Storage: localStorage\`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('prev').addEventListener('click', () => { state.cursor = Math.max(0, state.cursor - 1); render(); renderProgress(); });
document.getElementById('next').addEventListener('click', () => { state.cursor = Math.min(PAIRS.length - 1, state.cursor + 1); render(); renderProgress(); });
document.getElementById('skip').addEventListener('click', () => { state.cursor = Math.min(PAIRS.length - 1, state.cursor + 1); render(); renderProgress(); });
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') document.querySelector('[data-pick="a"]')?.click();
  else if (e.key === 'b' || e.key === 'B' || e.key === 'ArrowRight') document.querySelector('[data-pick="b"]')?.click();
  else if (e.key === ' ' || e.key === 't') { e.preventDefault(); document.querySelector('[data-pick="tie"]')?.click(); }
});

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Clear all ratings?')) return;
  state.picks = {};
  localStorage.removeItem(STORAGE_KEY);
  state.cursor = 0;
  render(); renderProgress();
});

document.getElementById('download').addEventListener('click', () => {
  const data = {
    timestamp: new Date().toISOString(),
    picks: state.picks,
    pairsTotal: PAIRS.length,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'metric-calibrate-picks-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  a.click();
});

document.getElementById('fit').addEventListener('click', fitWeights);

/** Fit four composite weights via logistic regression on
 *  pairwise picks. For each pick (A is better), we want
 *  sigmoid(w · (features(A) - features(B))) > 0.5. */
function fitWeights() {
  const trainingPairs = [];
  for (const [pidStr, pick] of Object.entries(state.picks)) {
    if (pick !== 'a' && pick !== 'b') continue;
    const p = PAIRS[Number(pidStr)];
    if (!p) continue;
    const diff = FEATURE_KEYS.map(k => p.a.features[k] - p.b.features[k]);
    const label = pick === 'a' ? 1 : -1;
    trainingPairs.push({ diff, label });
  }
  if (trainingPairs.length < 5) {
    document.getElementById('fit-result-host').innerHTML =
      \`<div class="fit-result">Need at least 5 A/B picks to fit (you have \${trainingPairs.length}).</div>\`;
    return;
  }

  // Normalize features so weights are interpretable.
  const featStds = FEATURE_KEYS.map(k => {
    const arr = trainingPairs.map(t => Math.abs(t.diff[FEATURE_KEYS.indexOf(k)]));
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    return mean || 1;
  });
  const normPairs = trainingPairs.map(({diff, label}) => ({
    diff: diff.map((d, i) => d / featStds[i]),
    label,
  }));

  const D = FEATURE_KEYS.length;
  let w = new Array(D).fill(0);
  const lr = 0.05;
  const epochs = 5000;
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(D).fill(0);
    for (const {diff, label} of normPairs) {
      let z = 0;
      for (let i = 0; i < D; i++) z += w[i] * diff[i];
      const p = 1 / (1 + Math.exp(-label * z));
      const factor = -label * (1 - p);
      for (let i = 0; i < D; i++) grad[i] += factor * diff[i];
    }
    for (let i = 0; i < D; i++) w[i] -= lr * grad[i] / normPairs.length;
  }
  // De-normalize: w_original = w_normalized / featStd
  const wOrig = w.map((wi, i) => wi / featStds[i]);

  // Agreement rate.
  let agree = 0;
  for (const {diff, label} of normPairs) {
    const z = w.reduce((s, wi, i) => s + wi * diff[i], 0);
    if ((z > 0 && label === 1) || (z < 0 && label === -1)) agree++;
  }
  const agreement = agree / normPairs.length;

  const lines = [];
  lines.push(\`Trained on \${trainingPairs.length} A/B picks (ties skipped).\`);
  lines.push(\`Agreement with picks: \${(agreement * 100).toFixed(1)}%\\n\`);
  lines.push('Fitted weights:');
  FEATURE_KEYS.forEach((k, i) => {
    lines.push(\`  \${k.padEnd(22)} \${wOrig[i].toExponential(3).padStart(12)}    (hand-tuned: \${HAND_TUNED_WEIGHTS[k]})\`);
  });
  lines.push('\\nSign check (negative = penalty, positive = bonus):');
  FEATURE_KEYS.forEach((k, i) => {
    const signMatch = Math.sign(wOrig[i]) === Math.sign(HAND_TUNED_WEIGHTS[k]) ? 'agrees' : 'DISAGREES';
    lines.push(\`  \${k.padEnd(22)} fitted=\${wOrig[i] > 0 ? '+' : '-'} hand=\${HAND_TUNED_WEIGHTS[k] > 0 ? '+' : '-'}   \${signMatch}\`);
  });

  document.getElementById('fit-result-host').innerHTML =
    \`<div class="fit-result">\${lines.map(escapeHtml).join('\\n')}</div>\`;
}

render(); renderProgress();
</script>
</body></html>`;
}

async function main() {
  const args = parseArgs(process.argv);
  const cells = collectCells(RUNS_ROOT);
  if (cells.length < 2) {
    console.error(`Need at least 2 hard-fail-free cells; found ${cells.length}. Run the harness first.`);
    process.exit(1);
  }

  const ranges = computeRanges(cells);
  console.log(`routing-eval/metric-calibrate: ${cells.length} hard-fail-free cells found`);
  for (const k of FEATURE_KEYS) {
    console.log(`  ${k.padEnd(22)} [${ranges[k].min.toFixed(2)}, ${ranges[k].max.toFixed(2)}]`);
  }

  const rng = makeRng(args.seed);
  const pairs = samplePairs(cells, args.pairs, rng);
  console.log(`\nsampled ${pairs.length} pairs (oversampled 4× then kept the top-separation ones)`);

  const ts = timestamp();
  const outDir = join(ANALYSIS_ROOT, `metric-calibrate-${ts}`);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'index.html');
  writeFileSync(outFile, buildHtml({ pairs, ranges }));

  console.log(`\nwrote ${outFile}`);
  console.log(`Open with:`);
  console.log(`  xdg-open ${outFile}`);
  console.log(`  # or:  python3 -m http.server -d ${outDir} 8768  # then http://localhost:8768/`);
  console.log(`\nKeyboard shortcuts in the viewer: A = "A better", B = "B better", space/t = tie.`);
}

main().catch(e => { console.error(e); process.exit(1); });
