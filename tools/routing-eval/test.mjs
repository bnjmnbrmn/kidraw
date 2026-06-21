#!/usr/bin/env node
// routing-test — automated pass/fail gate for an edge-routing algorithm.
//
// Unlike run.mjs (which dumps SVG/metrics for human rating), this runs an
// algorithm across a scenario set and asserts hard guarantees, so an agent can
// iterate on the router with an objective, fast feedback loop:
//
//   - the router must not throw,
//   - hard-fail count must be 0  (edges-through-nodes + sibling crossings +
//     self-intersections — the desiderata that must never be violated),
//   - wall-clock per scenario must stay under the time budget.
//
// Soft metrics (non-sibling crossings, clearances, crossing angle) and any
// router instrumentation (candidates, score calls, budget-hit, unclean edges)
// are printed per scenario for eyeballing but do NOT fail the run by default.
//
// Usage:
//   node tools/routing-eval/test.mjs [--algorithm <name>] [--ladder] [--scenario <name>]
//                                    [--budget-ms <n>] [--force-bundle]
//
// Exit code is non-zero if any scenario fails a hard gate.

import { buildBundle } from './harness/build-bundle.mjs';
import { ALL_SCENARIOS } from './scenarios/index.mjs';
import { createRequire } from 'node:module';

// The plan's small→dense validation ladder.
const LADDER = ['line-3', 'tree-5', 'fan-in-8', 'maze', 'bottleneck-channel', 'dense'];

function parseArgs(argv) {
  const out = {
    algorithm: 'incremental-desiderata-v2',
    scenario: null,
    ladder: false,
    budgetMs: 5000,
    forceBundle: false,
    includeOverlapping: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node tools/routing-eval/test.mjs [options]\n\n' +
        '  --algorithm <name>     Algorithm to test (default incremental-desiderata-v2).\n' +
        '  --ladder               Run only the small→dense validation ladder.\n' +
        '  --scenario <name>      Run only this scenario.\n' +
        '  --budget-ms <n>        Per-scenario time budget (default 5000).\n' +
        '  --include-overlapping  Include scenarios whose node boxes overlap\n' +
        '                         (skipped by default — a router can\'t be expected\n' +
        '                         to route cleanly through overlapping nodes).\n' +
        '  --force-bundle         Rebuild the bundled routers.\n',
      );
      process.exit(0);
    } else if (a === '--algorithm') out.algorithm = argv[++i];
    else if (a === '--scenario') out.scenario = argv[++i];
    else if (a === '--ladder') out.ladder = true;
    else if (a === '--budget-ms') out.budgetMs = Number(argv[++i]);
    else if (a === '--include-overlapping') out.includeOverlapping = true;
    else if (a === '--force-bundle') out.forceBundle = true;
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  return out;
}

/** True if any two node boxes overlap (stale fixtures from the node-size bump
 *  no router should be graded on). Mirrors run.mjs's --skip-overlapping. */
function hasOverlappingNodes(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const ax = a.konvaGroup.x(), ay = a.konvaGroup.y();
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const bx = b.konvaGroup.x(), by = b.konvaGroup.y();
      if (ax < bx + b.NODE_WIDTH && ax + a.NODE_WIDTH > bx &&
          ay < by + b.NODE_HEIGHT && ay + a.NODE_HEIGHT > by) {
        return true;
      }
    }
  }
  return false;
}

function selectScenarios(args) {
  if (args.scenario) return ALL_SCENARIOS.filter(s => s.name === args.scenario);
  if (args.ladder) {
    return LADDER.map(name => ALL_SCENARIOS.find(s => s.name === name)).filter(Boolean);
  }
  return ALL_SCENARIOS;
}

function fmt(n, width) {
  return String(n).padStart(width);
}

async function main() {
  const args = parseArgs(process.argv);
  const bundle = await buildBundle({ force: args.forceBundle });
  const require = createRequire(import.meta.url);
  const { Routers, Metrics, Fake } = require(bundle.path);

  const router = Routers[args.algorithm];
  if (!router) {
    console.error(`Unknown algorithm "${args.algorithm}". Known: ${Object.keys(Routers).join(', ')}`);
    process.exit(2);
  }

  const scenarios = selectScenarios(args);
  if (scenarios.length === 0) {
    console.error('No matching scenarios.');
    process.exit(2);
  }

  console.log(`routing-test: ${args.algorithm}  (budget ${args.budgetMs}ms/scenario)\n`);
  console.log(
    'result  scenario              ms    hard  nonSibX  minAngle  nodeClr  edgeClr   instrumentation',
  );
  console.log('-'.repeat(108));

  let failures = 0;
  let skipped = 0;
  let tested = 0;
  for (const scenario of scenarios) {
    const { nodes, edges } = scenario.build({ DANode: Fake.DANode, DAEdge: Fake.DAEdge });

    if (!args.includeOverlapping && hasOverlappingNodes(nodes)) {
      console.log(` SKIP   ${scenario.name.padEnd(20)} (overlapping node boxes)`);
      skipped++;
      continue;
    }
    tested++;

    let stats = null;
    let threw = null;
    const t0 = Date.now();
    try {
      stats = router.apply(nodes, edges, router.defaults);
    } catch (err) {
      threw = err;
    }
    const ms = Date.now() - t0;

    const m = Metrics.compute(nodes, edges, Metrics.weights);
    const hard = m.hardFailCount;
    const overBudget = ms > args.budgetMs;
    const ok = !threw && hard === 0 && !overBudget;
    if (!ok) failures++;

    const instr = stats && typeof stats === 'object'
      ? `cand=${stats.candidatesEvaluated} score=${stats.scoreCalls} ` +
        `budgetHit=${stats.budgetHit} unclean=${stats.uncleanEdges?.length ?? 0}`
      : '';
    const reasons = [];
    if (threw) reasons.push(`THREW: ${threw.message || threw}`);
    if (hard !== 0) reasons.push(`hardFails=${hard}`);
    if (overBudget) reasons.push(`over budget (${ms}ms)`);

    console.log(
      `${ok ? ' PASS ' : '*FAIL*'}  ${scenario.name.padEnd(20)} ` +
      `${fmt(ms, 5)}  ${fmt(hard, 4)}  ${fmt(m.nonSiblingCrossings, 7)}  ` +
      `${fmt(m.minCrossingAngleDeg.toFixed(0), 8)}  ${fmt(m.minObstacleClearance.toFixed(0), 7)}  ` +
      `${fmt(m.minEdgeEdgeClearance.toFixed(0), 7)}   ${instr}` +
      (reasons.length ? `\n          └─ ${reasons.join('; ')}` : ''),
    );
  }

  console.log('-'.repeat(108));
  const skipNote = skipped ? `, ${skipped} skipped (overlapping)` : '';
  console.log(`\nrouting-test: ${tested - failures}/${tested} passed, ${failures} failed${skipNote}.`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
