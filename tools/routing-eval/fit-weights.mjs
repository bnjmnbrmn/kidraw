#!/usr/bin/env node
// Server-side counterpart to the in-browser "Fit weights from ratings"
// button in metric-calibrate. Takes a picks JSON (downloaded from the
// viewer) plus the calibration HTML it was rated against, extracts the
// embedded PAIRS array from the HTML, and runs logistic regression on
// score-differences to fit the composite weights.
//
// Usage:
//   node tools/routing-eval/fit-weights.mjs <picks-json> [<calibration-html>]
//
// If the HTML is omitted, picks the most-recent calibration HTML under
// tools/routing-eval/analysis/.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_ROOT = join(__dirname, 'analysis');

function findLatestCalibrationHtml() {
  const dirs = readdirSync(ANALYSIS_ROOT)
    .filter(name => name.startsWith('metric-calibrate-'))
    .map(name => ({ name, path: join(ANALYSIS_ROOT, name) }))
    .filter(d => { try { return statSync(d.path).isDirectory(); } catch { return false; } });
  if (dirs.length === 0) return null;
  dirs.sort((a, b) => b.name.localeCompare(a.name));
  return join(dirs[0].path, 'index.html');
}

function extractPairs(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/const PAIRS\s*=\s*(\[[\s\S]*?\]);\s*const RANGES/);
  if (!m) throw new Error(`Could not find PAIRS array in ${htmlPath}`);
  return JSON.parse(m[1]);
}

function extractFeatureKeys(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/const FEATURE_KEYS\s*=\s*(\[[^\]]+\])/);
  if (!m) throw new Error(`Could not find FEATURE_KEYS in ${htmlPath}`);
  return JSON.parse(m[1]);
}

function extractHandTunedWeights(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/const HAND_TUNED_WEIGHTS\s*=\s*(\{[^}]*\})/);
  if (!m) return null;
  // The HTML embeds it as a JS object literal (unquoted keys), not JSON.
  // Trust the locally-generated content and eval it via Function.
  return new Function('return ' + m[1])();
}

function main() {
  const picksPath = process.argv[2];
  if (!picksPath) {
    console.error('Usage: node tools/routing-eval/fit-weights.mjs <picks-json> [<calibration-html>]');
    process.exit(1);
  }
  const htmlPath = process.argv[3] ?? findLatestCalibrationHtml();
  if (!htmlPath) {
    console.error('No calibration HTML supplied and none found under analysis/');
    process.exit(1);
  }
  console.log(`picks: ${resolve(picksPath)}`);
  console.log(`html:  ${resolve(htmlPath)}`);

  const picks = JSON.parse(readFileSync(picksPath, 'utf8')).picks;
  const pairs = extractPairs(htmlPath);
  const FEATURE_KEYS = extractFeatureKeys(htmlPath);
  const HAND_TUNED_WEIGHTS = extractHandTunedWeights(htmlPath);

  console.log(`pairs in HTML: ${pairs.length}`);
  console.log(`picks in JSON: ${Object.keys(picks).length}`);
  console.log(`features: ${FEATURE_KEYS.join(', ')}\n`);

  // Build training set: skip ties; build (diff, label) per A/B pick.
  const trainingPairs = [];
  let abCount = { a: 0, b: 0, tie: 0, other: 0 };
  for (const [pidStr, pick] of Object.entries(picks)) {
    abCount[pick === 'a' || pick === 'b' || pick === 'tie' ? pick : 'other']++;
    if (pick !== 'a' && pick !== 'b') continue;
    const p = pairs[Number(pidStr)];
    if (!p) continue;
    const diff = FEATURE_KEYS.map(k => p.a.features[k] - p.b.features[k]);
    const label = pick === 'a' ? 1 : -1;
    trainingPairs.push({ diff, label, pairId: Number(pidStr), scenario: p.a.origin });
  }
  console.log(`pick distribution: A=${abCount.a}  B=${abCount.b}  tie=${abCount.tie}  other=${abCount.other}`);
  console.log(`training pairs (A/B only): ${trainingPairs.length}\n`);

  if (trainingPairs.length < 5) {
    console.error('Need at least 5 A/B picks to fit.');
    process.exit(1);
  }

  // Per-feature std for normalization — keeps the gradient descent
  // numerically stable across feature scales (totalLength ~ thousands,
  // maxBulgeRatio ~ 0..1).
  const D = FEATURE_KEYS.length;
  const featStds = FEATURE_KEYS.map((_, i) => {
    const arr = trainingPairs.map(t => Math.abs(t.diff[i]));
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    return mean || 1;
  });
  const normPairs = trainingPairs.map(({ diff, label, pairId, scenario }) => ({
    diff: diff.map((d, i) => d / featStds[i]),
    label, pairId, scenario,
  }));

  // Logistic regression via gradient descent. For each pair (A, B, label):
  // P(A better) = sigmoid(label * w · diff). Maximize log-likelihood.
  let w = new Array(D).fill(0);
  const lr = 0.05;
  const epochs = 5000;
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(D).fill(0);
    for (const { diff, label } of normPairs) {
      let z = 0;
      for (let i = 0; i < D; i++) z += w[i] * diff[i];
      const p = 1 / (1 + Math.exp(-label * z));
      const factor = -label * (1 - p);
      for (let i = 0; i < D; i++) grad[i] += factor * diff[i];
    }
    for (let i = 0; i < D; i++) w[i] -= lr * grad[i] / normPairs.length;
  }
  const wOrig = w.map((wi, i) => wi / featStds[i]);

  // Agreement on training set.
  let agree = 0;
  for (const { diff, label } of normPairs) {
    let z = 0;
    for (let i = 0; i < D; i++) z += w[i] * diff[i];
    if ((z > 0 && label === 1) || (z < 0 && label === -1)) agree++;
  }
  const agreement = agree / normPairs.length;

  console.log(`Fitted weights:`);
  console.log(`  ${'metric'.padEnd(24)} ${'fitted'.padStart(14)}   ${'hand-tuned'.padStart(12)}   sign-agrees?`);
  for (let i = 0; i < D; i++) {
    const k = FEATURE_KEYS[i];
    const ht = HAND_TUNED_WEIGHTS?.[k];
    const fitted = wOrig[i];
    const fmt = v => typeof v === 'number'
      ? (Math.abs(v) < 0.001 || Math.abs(v) > 1e4 ? v.toExponential(3) : v.toFixed(4))
      : String(v);
    const signOk = ht == null ? '?'
      : Math.sign(fitted) === Math.sign(ht) ? 'yes'
      : 'NO — flipped';
    console.log(`  ${k.padEnd(24)} ${fmt(fitted).padStart(14)}   ${(ht != null ? fmt(ht) : '?').padStart(12)}   ${signOk}`);
  }
  console.log(`\nAgreement on training set: ${(agreement * 100).toFixed(1)}%`);
  console.log(`(50% = random; 100% = every pick predicted correctly)`);

  // Per-scenario breakdown.
  const byScn = new Map();
  for (const { diff, label, scenario } of normPairs) {
    let z = 0;
    for (let i = 0; i < D; i++) z += w[i] * diff[i];
    const ok = (z > 0 && label === 1) || (z < 0 && label === -1);
    // Origin paths often start with `<ts>/<algo>/<scenario>/...`; take the
    // scenario heuristically as the LAST path component before the parameter dir
    // (or the third component from the start).
    const segs = scenario.split('/');
    const scnName = segs.find(s => /^(anti-parallel|self-loop|multi-parallel|fan-out-8|fan-in-8|line-3|tree-5|mesh-3x3|hub-spoke|cycle-4|dense|sparse)$/.test(s)) ?? segs[segs.length - 2] ?? '?';
    if (!byScn.has(scnName)) byScn.set(scnName, { agree: 0, total: 0 });
    const e = byScn.get(scnName);
    e.total++;
    if (ok) e.agree++;
  }
  console.log(`\nPer-scenario agreement (where ${'>=5 picks'.padEnd(10)}):`);
  for (const [s, e] of [...byScn.entries()].sort((a, b) => b[1].total - a[1].total)) {
    if (e.total < 5) continue;
    console.log(`  ${s.padEnd(18)} ${e.agree}/${e.total} = ${(100 * e.agree / e.total).toFixed(0)}%`);
  }
}

main();
