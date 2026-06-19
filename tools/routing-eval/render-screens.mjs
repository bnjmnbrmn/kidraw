// render-screens.mjs — faithful PNG screenshots of routed scenarios.
//
// For each cell in a run (default: runs/latest), this loads the cell's
// geometry.json, replays it through the REAL DANode / DAEdge + Konva in a
// headless Chromium page, and screenshots the Konva stage to routing.png
// next to the existing routing.svg. Because the app renders edges as exactly
// `Konva.Arrow(points = getPathPoints(), tension = 0.5)`, these PNGs match
// what you actually see in KiDraw's canvas.
//
// Usage:
//   node tools/routing-eval/render-screens.mjs                 # all cells in latest run
//   node tools/routing-eval/render-screens.mjs --run <ts>      # a specific run dir
//   node tools/routing-eval/render-screens.mjs --scenario dense
//   node tools/routing-eval/render-screens.mjs --help

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { buildScreenshotBundle } from './harness/build-screenshot-bundle.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = resolve(__dirname, 'runs');

function parseArgs(argv) {
  const args = { run: null, scenario: null, waypoints: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--run') args.run = argv[++i];
    else if (a === '--scenario') args.scenario = argv[++i];
    else if (a === '--no-waypoints') args.waypoints = false;
  }
  return args;
}

function resolveRunDir(runArg) {
  if (runArg) return join(RUNS_ROOT, runArg);
  // Prefer the `latest` symlink; fall back to latest.txt, then newest dir.
  const link = join(RUNS_ROOT, 'latest');
  if (existsSync(link)) return link;
  const txt = join(RUNS_ROOT, 'latest.txt');
  if (existsSync(txt)) return readFileSync(txt, 'utf8').trim();
  const dirs = readdirSync(RUNS_ROOT)
    .map(d => join(RUNS_ROOT, d))
    .filter(p => statSync(p).isDirectory())
    .sort();
  return dirs[dirs.length - 1];
}

/** Find every cell dir (one with a geometry.json) under the run. */
function findCells(runDir, scenarioFilter) {
  const cells = [];
  const manifestPath = join(runDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`no manifest.json in ${runDir} — run run.mjs first`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const cell of manifest.cells ?? []) {
    if (scenarioFilter && cell.scenario !== scenarioFilter) continue;
    const cellDir = join(runDir, cell.algorithm, cell.scenario);
    if (existsSync(join(cellDir, 'geometry.json'))) {
      cells.push({ ...cell, dir: cellDir });
    }
  }
  return cells;
}

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}#stage{display:inline-block}</style>
</head><body><div id="stage"></div></body></html>`;

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`render-screens.mjs — faithful PNG screenshots via real Konva

  --run <timestamp>   Run dir under runs/ (default: latest)
  --scenario <name>   Only this scenario
  --no-waypoints      Hide control-point glyphs (shown by default)
  --help              This message`);
    return;
  }

  console.log('render-screens: bundling real render classes via esbuild...');
  const { path: bundlePath, cached } = await buildScreenshotBundle();
  const bundleSrc = readFileSync(bundlePath, 'utf8');
  console.log(`  ${cached ? 'cached' : 'built'} → ${bundlePath}`);

  const runDir = resolveRunDir(args.run);
  const cells = findCells(runDir, args.scenario);
  console.log(`render-screens: ${cells.length} cells in ${runDir}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 });

    let ok = 0, failed = 0;
    for (const cell of cells) {
      const geometry = JSON.parse(readFileSync(join(cell.dir, 'geometry.json'), 'utf8'));
      try {
        await page.setContent(HTML, { waitUntil: 'load' });
        await page.addScriptTag({ content: bundleSrc });
        const dims = await page.evaluate(
          (geom, sw) => window.renderScenario('stage', geom, sw),
          geometry, args.waypoints,
        );
        const stageEl = await page.$('#stage');
        await stageEl.screenshot({ path: join(cell.dir, 'routing.png') });
        ok++;
        console.log(`  [ok] ${cell.scenario.padEnd(20)} ${dims.width}×${dims.height}`);
      } catch (err) {
        failed++;
        console.log(`  [FAIL] ${cell.scenario.padEnd(20)} ${err.message}`);
      }
    }
    console.log(`render-screens: ${ok} ok, ${failed} failed → PNGs written next to routing.svg`);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
