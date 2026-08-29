/*
 * Layout experiment gallery: applies every layout to reference graphs and
 * publishes screenshots (several zoom levels / focus areas each) to
 * /var/www/kidraw-shots, which nginx serves at
 *
 *     https://kidraw.dev.bnjmnbrmn.com/shots/
 *
 * Run after layout/routing experiments so results are reviewable from a
 * phone:   node tools/layout-gallery.js
 *
 * Datasets:
 *   - next     — Ben's real next.org todo graph, injected from the vault
 *                file via the localStorage draft (read-only: the headless
 *                browser has no vault handle, so nothing writes back).
 *   - fan-tree — synthetic 18-way fan + chains (the pierce/wiggle shape).
 *
 * Each dataset is reset to its original snapshot before every layout so
 * layouts are compared from identical starting positions.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');
const { pageHtml, writeRootIndex } = require('./shots-common');

const OUT_ROOT = '/var/www/kidraw-shots';
const APP_URL = process.env.KIDRAW_URL || 'http://localhost:4200';
const NEXT_YAML = '/home/bot/projects/meta-project/kdvault/next.kidraw.yaml';

const LAYOUTS = [
  'force-directed', 'force-clear',
  'tree-down', 'tree-down-clear',
  'tree-right-clear',
  'circular', 'radial',
];

// name → zoom scale; 'fit' recenters/rescales to the whole graph instead.
const VIEWS = [
  { name: 'fit', scale: null },
  { name: 'hub-100', scale: 1.0 },
  { name: 'hub-150', scale: 1.5 },
];

function draftFromVaultYaml(file) {
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  const inline = (doc.styles ?? [])[0] ?? {};
  const style = { kdStyle: 1 };
  for (const k of ['imports', 'tagStyles', 'nodes', 'edges', 'view']) {
    if (inline[k] !== undefined) style[k] = inline[k];
  }
  return {
    version: 2, doc, style, filePath: null, dirty: false, savedAt: Date.now(),
  };
}

async function waitRoutingIdle(page) {
  await page.waitForFunction(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.routingWorker === null || da.routingWorker === undefined;
  }, { timeout: 30000 });
}

async function da(page, fn, arg) {
  return page.evaluate(([body, a]) => {
    const comp = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return new Function('da', 'arg', body)(comp, a);
  }, [fn, arg ?? null]);
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const runDir = path.join(OUT_ROOT, stamp);
  fs.mkdirSync(runDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });

  const shots = []; // {dataset, layout, view, file}

  for (const dataset of ['next', 'fan-tree']) {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
    // Ben reviews on his phone in dark mode; shots match (2026-07-14).
    await context.addInitScript(() => localStorage.setItem('kidraw-theme', 'dark'));
    if (dataset === 'next') {
      const draft = draftFromVaultYaml(NEXT_YAML);
      await context.addInitScript((d) => {
        localStorage.setItem('kidraw_draft_v2', d);
      }, JSON.stringify(draft));
    }
    const page = await context.newPage();
    page.on('pageerror', e => console.error(`[${dataset}] page error:`, e.message));
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
    await page.waitForTimeout(600);

    if (dataset === 'fan-tree') {
      await page.evaluate(() => {
        const sel = document.querySelector('select.sample-graph-select');
        sel.value = 'basic';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(300);
      await da(page, `
        const dl = da.drawingLayer;
        const N = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
        dl.clearAll(); let id = 0;
        const mk = (x, y) => { const n = new N(x, y, 'n' + id, 'n' + (id++)); dl.addRawNode(n); return n; };
        const root = mk(0, 0); const kids = [];
        for (let i = 0; i < 18; i++) { const k = mk((i - 9) * 40, 200 + (i % 3) * 30); dl.addEdge(root, k); kids.push(k); }
        for (let i = 0; i < 4; i++) { let par = kids[i]; for (let d = 0; d < 3; d++) { const c = mk(par.konvaGroup.x() + 20, par.konvaGroup.y() + 150); dl.addEdge(par, c); par = c; } }
        dl.batchDraw();
      `);
    }

    // Baseline snapshot: every layout starts from the same positions.
    const baseline = await da(page, 'return da.drawingLayer.serializeGraph();');
    const canvasBox = await page.locator('#mainDrawingArea').boundingBox();

    for (const layout of LAYOUTS) {
      await waitRoutingIdle(page);
      await da(page, 'da.handleCommands({kind: "LOAD_NAMED_GRAPH", graphSnapshot: arg});', baseline);
      await page.waitForTimeout(200);
      await waitRoutingIdle(page);
      await da(page, `da.handleCommands({kind: "APPLY_LAYOUT", layout: ${JSON.stringify(layout)}});`);
      await page.waitForTimeout(300);
      await waitRoutingIdle(page);
      await da(page, 'da.tweens.forEach(t => t.finish()); da.tweens = [];');

      for (const view of VIEWS) {
        if (view.scale === null) {
          await da(page, `
            da.handleCommands({kind: "UNSELECT_ALL"});
            da.handleCommands({kind: "RECENTER_VIEW"});
          `);
        } else {
          // Center the busiest node (the hub) at the given zoom.
          await da(page, `
            const dl = da.drawingLayer;
            const s = ${view.scale};
            const hub = dl.getDANodes().reduce((best, n) =>
              (n.outgoingEdges.length + n.incomingEdges.length)
                > (best.outgoingEdges.length + best.incomingEdges.length) ? n : best);
            dl.scaleX(s); dl.scaleY(s);
            dl.x(da.stage.width() / 2 - (hub.konvaGroup.x() + hub.NODE_WIDTH / 2) * s);
            dl.y(da.stage.height() / 2 - (hub.konvaGroup.y() + hub.NODE_HEIGHT / 2) * s);
            dl.batchDraw();
          `);
        }
        await page.waitForTimeout(450);
        await da(page, 'da.tweens.forEach(t => t.finish()); da.tweens = [];');
        const file = `${dataset}--${layout}--${view.name}.png`;
        await page.screenshot({ path: path.join(runDir, file), clip: canvasBox });
        shots.push({ dataset, layout, view: view.name, file });
        console.log(`shot ${file}`);
      }
    }
    await context.close();
  }
  await browser.close();

  // Per-run gallery page.
  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '..') }).toString().trim(); } catch {}
  const byDataset = {};
  for (const s of shots) (byDataset[s.dataset] ??= []).push(s);
  const sections = Object.entries(byDataset).map(([ds, list]) => {
    const byLayout = {};
    for (const s of list) (byLayout[s.layout] ??= []).push(s);
    const rows = Object.entries(byLayout).map(([layout, ss]) => `
      <h3>${layout}</h3>
      <div class="row">${ss.map(s => `
        <figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a>
        <figcaption>${s.dataset} · ${s.layout} · ${s.view}</figcaption></figure>`).join('')}
      </div>`).join('');
    return `<h2>${ds}</h2>${rows}`;
  }).join('');
  fs.writeFileSync(path.join(runDir, 'index.html'), pageHtml(
    `kidraw layouts ${stamp}`,
    `Layout gallery — ${stamp}`,
    `commit <code>${commit}</code> · datasets: next.org graph + synthetic fan tree · views: fit / hub@100% / hub@150%`,
    sections,
  ));

  writeRootIndex(OUT_ROOT);

  console.log(`\npublished ${shots.length} shots → https://kidraw.dev.bnjmnbrmn.com/shots/${stamp}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
