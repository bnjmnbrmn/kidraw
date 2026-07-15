/*
 * Publish screenshots of the fisheye gather rework to
 * https://kidraw.dev.bnjmnbrmn.com/shots/ for phone review.
 *
 * Real data: the KiDraw Dev sample (typed todo graph with edge labels) —
 * fit view, then gathered views on interesting hubs (sparse hubs place
 * individually). Synthetic data: a 26-neighbor hub that forces stacking,
 * showing the direction/kind piles and the "…N more labels…" marker.
 *
 *   node tools/gather-shots.js
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pageHtml, writeRootIndex } = require('./shots-common');

const OUT_ROOT = '/var/www/kidraw-shots';
const APP_URL = process.env.KIDRAW_URL || 'http://localhost:4200';

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '') + '-gather-fisheye';
  const runDir = path.join(OUT_ROOT, stamp);
  fs.mkdirSync(runDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
  await context.addInitScript(() => localStorage.setItem('kidraw-theme', 'dark'));
  const page = await context.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(500);

  const da = (body, arg) => page.evaluate(([b, a]) => {
    const comp = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return new Function('da', 'arg', b)(comp, a);
  }, [body, arg ?? null]);
  const finish = () => da('da.tweens.forEach(t => t.finish()); da.tweens = [];');
  const canvasBox = await page.locator('#mainDrawingArea').boundingBox();
  const shots = [];
  const shoot = async (name, caption) => {
    await page.waitForTimeout(400);
    await finish();
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(runDir, file), clip: canvasBox });
    shots.push({ name, file, caption });
    console.log('shot', file);
  };

  const placeOnAndCenter = async (id, scale) => da(`
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const n = dl.getDANodes().find(x => x.id === ${JSON.stringify(id)});
    const s = ${scale};
    dl.scaleX(s); dl.scaleY(s);
    dl.x(da.stage.width() / 2 - (n.group.x() + n.NODE_WIDTH / 2) * s);
    dl.y(da.stage.height() / 2 - (n.group.y() + n.NODE_HEIGHT / 2) * s);
    da.crosshairsLayer.crosshairs.x = da.stage.width() / 2;
    da.crosshairsLayer.crosshairs.y = da.stage.height() / 2;
    dl.batchDraw();
  `);
  const gather = async () => {
    await da('da.handleCommands({kind: "GATHER_CONNECTED_NODES"});');
    await finish();
    await page.waitForTimeout(450); // deferred stranger re-route
    await finish();
  };
  const ungather = async () => {
    await da('da.handleCommands({kind: "UNGATHER"});');
    await finish();
  };

  // ---- Real data: KiDraw Dev sample. ----
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'kidraw-dev';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(800);
  await da('da.handleCommands({kind: "RECENTER_VIEW"});');
  await shoot('dev-fit', 'KiDraw Dev sample, fit view (16 labeled edges)');

  for (const [id, label, scale] of [
    ['c0', 'c0 "KiDraw" — 9 children, fisheye ring', 0.5],
    ['t13', 't13 — hub with labeled depends-on fan out', 0.6],
    ['g0', 'g0 "MVP launch" goal — labeled serves edges in', 0.6],
  ]) {
    await placeOnAndCenter(id, scale);
    await gather();
    await shoot(`dev-gather-${id}`, `Gathered: ${label}`);
    await ungather();
  }

  // ---- Synthetic crowd: stacking + label marker. ----
  await page.evaluate(() => {
    const daComp = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = daComp.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    const mk = (id, cx, cy) => {
      const n = new NodeCtor(0, 0, id, id);
      n.group.x(cx - n.NODE_WIDTH / 2);
      n.group.y(cy - n.NODE_HEIGHT / 2);
      dl.addRawNode(n);
      return n;
    };
    const H = mk('hub', 1000, 800);
    const at = (angle, dist) => [1000 + Math.cos(angle) * dist, 800 + Math.sin(angle) * dist];
    const labelEdges = [];
    for (let i = 0; i < 12; i++) {
      const e = dl.addEdge(H, mk(`dep${i}`, ...at(-1.2 + (2.4 * i) / 11, 500 + (i % 4) * 100)));
      e.tags = ['depends-on'];
      if (i < 5) labelEdges.push(e);
    }
    for (let i = 0; i < 8; i++) {
      dl.addEdge(H, mk(`srv${i}`, ...at(1.5 + (1.2 * i) / 7, 550 + (i % 3) * 120))).tags = ['serves'];
    }
    for (let i = 0; i < 6; i++) {
      dl.addEdge(mk(`par${i}`, ...at(-(Math.PI + 0.5 - i / 5), 450 + (i % 3) * 110)), H).tags = ['depends-on'];
    }
    mk('bystander', ...at(2.9, 250));
    window.__labelEdges = labelEdges;
    dl.batchDraw();
  });
  await page.evaluate(() => {
    const daComp = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = daComp.drawingLayer;
    for (const [i, edge] of window.__labelEdges.entries()) {
      const pts = edge.getPathPoints();
      const mid = {x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2};
      daComp.tweens.forEach(t => t.finish()); daComp.tweens = [];
      daComp.crosshairsLayer.crosshairs.x = dl.x() + mid.x * dl.scaleX();
      daComp.crosshairsLayer.crosshairs.y = dl.y() + mid.y * dl.scaleY();
      daComp.handleCommands({ kind: 'ADD_LABEL' });
      const label = edge.labels[0];
      if (label) label.appendText(`needs ${i}`);
      daComp.handleCommands({ kind: 'EXIT_LABEL_EDIT_MODE' });
      daComp.handleCommands({ kind: 'UNSELECT_ALL' });
    }
  });
  await da('da.handleCommands({kind: "RECENTER_VIEW"});');
  await shoot('crowd-before', 'Synthetic 26-neighbor hub, ungathered');
  await placeOnAndCenter('hub', 0.9);
  await gather();
  await shoot('crowd-gathered', 'Gathered: direction/kind stacks, capped cascade, "…more labels…" marker, bystander pushed out');

  await browser.close();

  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '..') }).toString().trim(); } catch {}
  fs.writeFileSync(path.join(runDir, 'index.html'), pageHtml(
    `gather fisheye — ${stamp}`,
    'Fisheye gather rework',
    `commit <code>${commit}</code> · bearings preserved, sucked in · stacks by direction+kind · label markers`,
    `<div class="row">${shots.map(s => `
      <figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a>
      <figcaption>${s.caption}</figcaption></figure>`).join('')}</div>`,
  ));
  writeRootIndex(OUT_ROOT);
  console.log(`\npublished → https://kidraw.dev.bnjmnbrmn.com/shots/${stamp}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
