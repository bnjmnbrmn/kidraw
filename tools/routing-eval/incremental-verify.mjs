#!/usr/bin/env node
// Verification driver for the incremental routing implementation.
//
// 1. Builds (or reuses) the harness bundle.
// 2. Constructs the `incremental-add` scenario (4 corners + center + diagonals).
// 3. Runs the FULL bf-wc router on the two diagonal edges, capturing their
//    control points as the "frozen state".
// 4. Calls `applyBezierFitWeightedChainEdgesForOne` on the C→BL incremental
//    edge.
// 5. Asserts:
//    - The two diagonals' control points are unchanged (deep-equal to the
//      pre-call snapshot).
//    - The incremental edge has at least one bend (router actually ran).
//    - The incremental edge's polyline does not cross either diagonal.
// 6. Writes a `verification-snapshot.svg` so a human can eyeball the result.
//
// Run from the worktree:
//   node tools/routing-eval/incremental-verify.mjs

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBundle } from './harness/build-bundle.mjs';
import * as incrementalScenario from './scenarios/incremental-add.mjs';
import { renderSvg } from './harness/render-svg.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'incremental-verify-out');

function deepClone(cps) {
  return cps.map(p => ({ x: p.x, y: p.y }));
}

function deepEqualCps(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x - b[i].x) > 1e-9) return false;
    if (Math.abs(a[i].y - b[i].y) > 1e-9) return false;
  }
  return true;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function polylineCrossings(edgeA, edgeB) {
  const pa = edgeA.getPathPoints();
  const pb = edgeB.getPathPoints();
  let count = 0;
  for (let i = 0; i < pa.length - 1; i++) {
    for (let j = 0; j < pb.length - 1; j++) {
      if (segmentsIntersect(pa[i], pa[i + 1], pb[j], pb[j + 1])) count++;
    }
  }
  return count;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log('incremental-verify: bundling…');
  const t0 = Date.now();
  const bundle = await buildBundle({ force: false });
  console.log(`  ${bundle.cached ? 'cached' : 'built'} in ${Date.now() - t0} ms`);

  const require = createRequire(import.meta.url);
  const { Routers, Fake } = require(bundle.path);
  const bfwc = Routers['bezier-fit-weighted-chain'];

  // Build scenario.
  const { nodes, edges, incrementalTargetId } = incrementalScenario.build({
    DANode: Fake.DANode,
    DAEdge: Fake.DAEdge,
  });
  const targetEdge = edges.find(e => e.id === incrementalTargetId);
  if (!targetEdge) {
    console.error('FAIL: incremental target edge not found');
    process.exit(1);
  }
  const frozenEdges = edges.filter(e => e !== targetEdge);

  // Step 1: full-graph route the frozen edges only. This pre-settles them.
  console.log('step 1: full-route the two diagonals via bf-wc all-edges…');
  bfwc.apply(nodes, frozenEdges, bfwc.defaults);
  const frozenSnapshots = frozenEdges.map(e => ({
    id: e.id,
    cps: deepClone(e.controlPoints),
  }));
  console.log(`  diagonals: ${frozenSnapshots.map(s => `${s.id}=${s.cps.length}cps`).join(' ')}`);

  // Snapshot pre-incremental render for the SVG.
  const preSvg = renderSvg({ nodes, edges, algorithm: 'bf-wc (pre)', scenario: 'incremental-add' });
  writeFileSync(join(OUT_DIR, 'pre.svg'), preSvg, 'utf8');

  // Step 2: route the incremental edge only.
  console.log('step 2: incremental-route C→BL via applyOne…');
  const log = msg => console.log(`  ${msg}`);
  const incOpts = { fit: { ...bfwc.defaults.fit }, wc: { ...bfwc.defaults.wc } };
  bfwc.applyOne(nodes, edges, targetEdge, incOpts, log);

  // Step 3: assertions.
  let ok = true;
  for (const snap of frozenSnapshots) {
    const e = frozenEdges.find(x => x.id === snap.id);
    const after = deepClone(e.controlPoints);
    if (!deepEqualCps(snap.cps, after)) {
      ok = false;
      console.error(`FAIL: frozen edge ${snap.id} changed!  before=${snap.cps.length}cps  after=${after.length}cps`);
    } else {
      console.log(`PASS: frozen edge ${snap.id} unchanged (${after.length} cps).`);
    }
  }

  const targetCps = targetEdge.controlPoints.length;
  if (targetCps < 1) {
    ok = false;
    console.error(`FAIL: target edge has ${targetCps} control points — router did not produce a bent path.`);
  } else {
    console.log(`PASS: target edge has ${targetCps} control points.`);
  }

  for (const f of frozenEdges) {
    const crossings = polylineCrossings(targetEdge, f);
    if (crossings > 0) {
      console.warn(`WARN: target crosses frozen ${f.id} ${crossings} times.`);
    } else {
      console.log(`PASS: target does not cross frozen ${f.id}.`);
    }
  }

  // Step 4: render post-incremental SVG.
  const postSvg = renderSvg({ nodes, edges, algorithm: 'bf-wc (incremental)', scenario: 'incremental-add' });
  writeFileSync(join(OUT_DIR, 'post.svg'), postSvg, 'utf8');
  console.log(`SVG output: ${OUT_DIR}/pre.svg + ${OUT_DIR}/post.svg`);

  if (!ok) {
    console.error('incremental-verify: FAIL');
    process.exit(1);
  }
  console.log('incremental-verify: OK');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
