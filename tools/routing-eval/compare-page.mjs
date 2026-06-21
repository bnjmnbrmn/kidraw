#!/usr/bin/env node
// compare-page.mjs — static side-by-side comparison of every algorithm on each
// scenario, for the scenarios where the algorithms actually produce DIFFERENT
// routes. Images only (the faithful PNG, falling back to SVG); no metrics.
//
// Output: tools/routing-eval/compare-latest.html, served by the same static
// server as the viewer (it references runs/latest/... relatively).
//
// Usage: node tools/routing-eval/compare-page.mjs [--run <timestamp>] [--all]
//   --all   include every scenario, even those where all algorithms match.

import { readFileSync, writeFileSync, existsSync, readlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS = join(__dirname, 'runs');

function resolveRun(arg) {
  if (arg) return arg;
  const link = join(RUNS, 'latest');
  try { return readlinkSync(link); } catch {}
  const txt = join(RUNS, 'latest.txt');
  if (existsSync(txt)) return readFileSync(txt, 'utf8').trim();
  throw new Error('no run specified and runs/latest missing');
}

function parseArgs(argv) {
  const out = { run: null, all: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--run') out.run = argv[++i];
    else if (argv[i] === '--all') out.all = true;
  }
  return out;
}

/** Rounded waypoint signature for an algorithm's routing of a scenario — used
 *  to decide whether two algorithms differ. Compares control points (the
 *  waypoints), which is what distinguishes routes; a straight edge has none, so
 *  scenarios everyone routes straight collapse to equal signatures. */
function signature(geometry) {
  return geometry.edges
    .map(e => e.controlPoints.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(';'))
    .join('|');
}

function main() {
  const args = parseArgs(process.argv);
  const runTs = resolveRun(args.run);
  const runDir = join(RUNS, runTs);
  const manifest = JSON.parse(readFileSync(join(runDir, 'manifest.json'), 'utf8'));
  const algos = manifest.algorithms;

  // Group cells by scenario (only scenarios that actually ran).
  const byScenario = new Map();
  for (const cell of manifest.cells) {
    if (!byScenario.has(cell.scenario)) byScenario.set(cell.scenario, new Set());
    byScenario.get(cell.scenario).add(cell.algorithm);
  }

  const sections = [];
  let differing = 0, identical = 0;
  for (const [scenario] of byScenario) {
    const sigs = algos.map(algo => {
      const gp = join(runDir, algo, scenario, 'geometry.json');
      return existsSync(gp) ? signature(JSON.parse(readFileSync(gp, 'utf8'))) : `MISSING:${algo}`;
    });
    const allSame = sigs.every(s => s === sigs[0]);
    if (allSame && !args.all) { identical++; continue; }
    differing++;

    const cells = algos.map(algo => {
      const base = `runs/${runTs}/${algo}/${scenario}`;
      return `<div class="cell">
        <div class="label">${algo}</div>
        <img loading="lazy" src="${base}/routing.png"
             onerror="this.onerror=null;this.src='${base}/routing.svg'">
      </div>`;
    }).join('');
    sections.push(`<section class="scenario"><h2>${scenario}</h2><div class="row">${cells}</div></section>`);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Algorithm comparison — ${runTs}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
  header { padding: 16px 24px; border-bottom: 1px solid #1e293b; position: sticky; top: 0; background: #0f172a; z-index: 1; }
  header h1 { font-size: 17px; margin: 0; }
  header p { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
  .scenario { padding: 6px 24px 26px; }
  .scenario h2 { font-size: 15px; color: #93c5fd; margin: 18px 0 10px; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .cell { flex: 1 1 0; min-width: 280px; max-width: 520px; }
  .cell .label { font-size: 12px; color: #94a3b8; margin-bottom: 5px; font-family: ui-monospace, monospace; }
  .cell img { width: 100%; height: auto; background: #fff; border-radius: 6px; border: 1px solid #334155; display: block; }
</style></head><body>
<header>
  <h1>Algorithm comparison — ${algos.join(' · ')}</h1>
  <p>Run ${runTs} · ${differing} scenarios where routes differ${args.all ? '' : ` · ${identical} identical hidden`}</p>
</header>
${sections.join('\n')}
</body></html>`;

  const outPath = join(__dirname, 'compare-latest.html');
  writeFileSync(outPath, html, 'utf8');
  console.log(`compare-page: ${differing} differing scenarios (${identical} identical hidden) → ${outPath}`);
  console.log('Open via the running viewer server, e.g. http://localhost:<port>/compare-latest.html');
}

main();
