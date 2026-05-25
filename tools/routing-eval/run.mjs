#!/usr/bin/env node
// routing-eval harness entry point.
//
// 1. Builds (or reuses) the bundled routers (esbuild + alias plugin).
// 2. Walks all (algorithm × scenario) cells, calling the router on each.
// 3. Writes routing.svg, metrics.json, geometry.json per cell.
// 4. Emits a top-level manifest.json the viewer reads.
//
// Usage:
//   node tools/routing-eval/run.mjs [--algorithm <name>] [--scenario <name>] [--force-bundle]

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBundle } from './harness/build-bundle.mjs';
import { ALL_SCENARIOS } from './scenarios/index.mjs';
import { renderSvg } from './harness/render-svg.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = join(__dirname, 'runs');

function parseArgs(argv) {
  const out = { algorithm: null, scenario: null, forceBundle: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(
        `Usage: node tools/routing-eval/run.mjs [options]\n\n` +
        `  --algorithm <name>    Run only this algorithm.\n` +
        `  --scenario <name>     Run only this scenario.\n` +
        `  --force-bundle        Rebuild the bundled routers even if cached.\n` +
        `  --help                Show this help.\n\n` +
        `Algorithms: charged-spring, bezier-route, bezier-fit-charged-spring,\n` +
        `            flexible-wire, weighted-chain, bezier-fit-weighted-chain\n` +
        `Scenarios:  ${ALL_SCENARIOS.map(s => s.name).join(', ')}`,
      );
      process.exit(0);
    } else if (a === '--algorithm') {
      out.algorithm = argv[++i];
    } else if (a === '--scenario') {
      out.scenario = argv[++i];
    } else if (a === '--force-bundle') {
      out.forceBundle = true;
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function pad(n) { return String(n).padStart(2, '0'); }
function randomSuffix() {
  // 3 lowercase-alphanumeric chars. Cheap collision insurance for reruns
  // that land in the same second; we don't need crypto-grade randomness.
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 3; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function timestamp() {
  const d = new Date();
  return (
    `${d.getFullYear()}` +
    `${pad(d.getMonth() + 1)}` +
    `${pad(d.getDate())}-` +
    `${pad(d.getHours())}` +
    `${pad(d.getMinutes())}` +
    `${pad(d.getSeconds())}-` +
    randomSuffix()
  );
}

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

/** Edge-crossing count: distinct unordered pairs of segments (from
 *  different edges) that intersect in their interior. Self-loops skipped. */
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

function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function ensureRunsRoot() {
  mkdirSync(RUNS_ROOT, { recursive: true });
}

function updateLatestSymlink(target) {
  const link = join(RUNS_ROOT, 'latest');
  try { rmSync(link, { force: true }); } catch {}
  try {
    symlinkSync(target, link, 'dir');
  } catch {
    // Symlink failed (Windows without dev mode, sandbox, etc.). Fall back
    // to a tiny `latest.txt` pointer the viewer can read instead.
    writeFileSync(join(RUNS_ROOT, 'latest.txt'), target + '\n', 'utf8');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  ensureRunsRoot();

  console.log('routing-eval: bundling routers via esbuild...');
  const t0 = Date.now();
  const bundle = await buildBundle({ force: args.forceBundle });
  console.log(`  ${bundle.cached ? 'cached' : 'built'} in ${Date.now() - t0} ms`);

  const require = createRequire(import.meta.url);
  const mod = require(bundle.path);
  const { Routers, Metrics, Fake } = mod;

  const algorithms = Object.keys(Routers).filter(
    name => !args.algorithm || name === args.algorithm,
  );
  if (algorithms.length === 0) {
    console.error(`No matching algorithm for "${args.algorithm}". Try --help.`);
    process.exit(2);
  }
  const scenarios = ALL_SCENARIOS.filter(
    s => !args.scenario || s.name === args.scenario,
  );
  if (scenarios.length === 0) {
    console.error(`No matching scenario for "${args.scenario}". Try --help.`);
    process.exit(2);
  }

  const runTs = timestamp();
  const runDir = join(RUNS_ROOT, runTs);
  mkdirSync(runDir, { recursive: true });
  console.log(`routing-eval: run ${runTs} → ${runDir}`);

  const cells = [];
  for (const algoName of algorithms) {
    const router = Routers[algoName];
    for (const scenario of scenarios) {
      const { nodes, edges } = scenario.build({
        DANode: Fake.DANode,
        DAEdge: Fake.DAEdge,
      });
      const cellDir = join(runDir, algoName, scenario.name);
      mkdirSync(cellDir, { recursive: true });

      let ok = true;
      let errorMessage = null;
      let computeTimeMs = 0;
      const tStart = Date.now();
      try {
        router.apply(nodes, edges, router.defaults);
        computeTimeMs = Date.now() - tStart;
      } catch (err) {
        ok = false;
        computeTimeMs = Date.now() - tStart;
        errorMessage = String(err?.stack || err);
        console.error(`  [FAIL] ${algoName} / ${scenario.name}: ${err?.message || err}`);
      }

      // Build metrics on whatever state the edges ended up in (even if the
      // router threw mid-run — the polyline might still be partial).
      const baseMetrics = Metrics.compute(nodes, edges, Metrics.weights);
      const metrics = {
        ok,
        errorMessage,
        algorithm: algoName,
        scenario: scenario.name,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        computeTimeMs,
        edgeCrossings: crossingsOf(edges),
        bendCount: bendCountOf(edges),
        maxCurvature: maxCurvatureOf(edges),
        // from edge-routing-metrics
        siblingCrossings: baseMetrics.siblingCrossings,
        edgesThroughNodes: baseMetrics.edgesThroughNodes,
        selfIntersections: baseMetrics.selfIntersections,
        totalLength: baseMetrics.totalLength,
        totalCurvature: baseMetrics.totalCurvature,
        maxBulgeRatio: baseMetrics.maxBulgeRatio,
        minObstacleClearance: baseMetrics.minObstacleClearance,
        compositeScore: baseMetrics.composite,
        hardFailCount: baseMetrics.hardFailCount,
      };

      const geometry = {
        algorithm: algoName,
        scenario: scenario.name,
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

      cells.push({
        algorithm: algoName,
        scenario: scenario.name,
        ok,
        errorMessage,
        metrics,
      });

      const status = ok ? 'ok' : 'FAIL';
      console.log(
        `  [${status}] ${algoName.padEnd(28)} ${scenario.name.padEnd(18)} ` +
        `t=${String(computeTimeMs).padStart(5)}ms ` +
        `cross=${metrics.edgeCrossings} sib=${metrics.siblingCrossings} ` +
        `bends=${metrics.bendCount}`,
      );
    }
  }

  const manifest = {
    timestamp: runTs,
    generatedAt: new Date().toISOString(),
    algorithms,
    scenarios: scenarios.map(s => ({ name: s.name, description: s.description })),
    cells,
    deferredFilters: {
      algorithmFilter: args.algorithm,
      scenarioFilter: args.scenario,
    },
  };
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  updateLatestSymlink(runTs);

  console.log(`routing-eval: ${cells.length} cells written → ${runDir}`);
  console.log(`routing-eval: launch the viewer with:`);
  console.log(`  python3 -m http.server -d ${resolve(__dirname, 'viewer')} 8765`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
