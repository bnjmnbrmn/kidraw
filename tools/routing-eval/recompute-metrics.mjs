#!/usr/bin/env node
// Recompute metrics.json for every cell under runs/ using the current
// edge-routing-metrics.ts. The geometry.json files have full node + edge
// state, so we reconstruct fake DA objects and call Metrics.compute on
// them. The SVG / geometry / manifest are NOT touched.
//
// Run this whenever edge-routing-metrics.ts changes (new field added,
// existing one re-defined) so the explorer/calibration corpus has
// consistent metrics across old and new runs.
//
// Usage:
//   node tools/routing-eval/recompute-metrics.mjs
//   node tools/routing-eval/recompute-metrics.mjs --dry-run   # just count
//   node tools/routing-eval/recompute-metrics.mjs --force-bundle

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBundle } from './harness/build-bundle.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = join(__dirname, 'runs');

function parseArgs(argv) {
  const out = { dryRun: false, forceBundle: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log('Usage: node tools/routing-eval/recompute-metrics.mjs [--dry-run] [--force-bundle]');
      process.exit(0);
    } else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force-bundle') out.forceBundle = true;
    else { console.error('Unknown arg: ' + a); process.exit(1); }
  }
  return out;
}

function collectCells(root) {
  const out = [];
  walk(root);
  return out;
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    if (entries.includes('geometry.json') && entries.includes('metrics.json')) {
      out.push(dir);
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
    }
  }
}

/** Reconstruct fake DANode/DAEdge objects from a saved geometry.json. The
 *  schema lines up with what run.mjs writes today: nodes have {id, x, y,
 *  width, height, shape?}; edges have {id, src, dest, controlPoints,
 *  pathPoints?, smoothRendering?}. Older runs may use slightly different
 *  field names — fall back gracefully. */
function reconstruct(geo, Fake) {
  const nodes = geo.nodes.map(n => new Fake.DANode(n.id, n.x, n.y, {
    width:  typeof n.width === 'number' ? n.width : (typeof n.w === 'number' ? n.w : undefined),
    height: typeof n.height === 'number' ? n.height : (typeof n.h === 'number' ? n.h : undefined),
    shape: n.shape,
  }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges = geo.edges.map(e => {
    const src = byId.get(e.src);
    const dest = byId.get(e.dest);
    if (!src || !dest) return null;
    const edge = new Fake.DAEdge(e.id, src, dest);
    if (Array.isArray(e.controlPoints)) {
      edge.setControlPoints(e.controlPoints.map(p => ({x: p.x, y: p.y})));
    }
    if (e.smoothRendering) edge.setSmoothRendering(true);
    return edge;
  }).filter(Boolean);
  return { nodes, edges };
}

async function main() {
  const args = parseArgs(process.argv);
  const cells = collectCells(RUNS_ROOT);
  console.log(`recompute-metrics: ${cells.length} cells found under ${RUNS_ROOT}`);
  if (args.dryRun) { process.exit(0); }

  console.log(`recompute-metrics: building router bundle...`);
  const bundle = await buildBundle({ force: args.forceBundle });
  console.log(`  bundle ${bundle.cached ? '(cached)' : '(rebuilt)'}`);

  const require = createRequire(import.meta.url);
  const { Metrics, Fake } = require(bundle.path);

  let ok = 0, fail = 0;
  for (const dir of cells) {
    try {
      const geo = JSON.parse(readFileSync(join(dir, 'geometry.json'), 'utf8'));
      const { nodes, edges } = reconstruct(geo, Fake);
      const baseMetrics = Metrics.compute(nodes, edges, Metrics.weights);

      // Read existing metrics.json so we can preserve fields the harness
      // adds beyond the core compute (computeTimeMs, algorithm, scenario,
      // etc.). Only the metric-engine-owned fields get refreshed.
      const existing = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'));
      const updated = {
        ...existing,
        siblingCrossings: baseMetrics.siblingCrossings,
        edgesThroughNodes: baseMetrics.edgesThroughNodes,
        selfIntersections: baseMetrics.selfIntersections,
        totalLength: baseMetrics.totalLength,
        totalCurvature: baseMetrics.totalCurvature,
        maxBulgeRatio: baseMetrics.maxBulgeRatio,
        minObstacleClearance: baseMetrics.minObstacleClearance,
        minEdgeEdgeClearance: baseMetrics.minEdgeEdgeClearance,
        nonSiblingCrossings: baseMetrics.nonSiblingCrossings,
        hardFailCount: baseMetrics.hardFailCount,
      };
      if ('composite' in existing) updated.composite = baseMetrics.composite;
      if ('compositeScore' in existing) updated.compositeScore = baseMetrics.composite;
      writeFileSync(join(dir, 'metrics.json'), JSON.stringify(updated, null, 2));
      ok++;
    } catch (e) {
      console.error(`  [FAIL] ${dir}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nrecompute-metrics: ${ok} updated, ${fail} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
