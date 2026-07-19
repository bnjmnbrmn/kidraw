/*
 * Stage 1 of the a=add / i=insert model (notes/design-add-insert-model.md),
 * vim profile, real keys:
 *
 *   1. tap `a` on empty canvas → default node at the crosshairs → labelEdit.
 *   2. tap `a` over a node → connected default node one slot below → labelEdit.
 *   3. tap `a` over an edge → hint, nothing added.
 *   4. tap `i` over a node → edit its text (append to existing).
 *   5. tap `i` over a label-less edge → empty label created and edited.
 *   6. hold `v` over an edge + `o` → directedness cycles D→U→B→D.
 */
const { chromium } = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.clearAll();
    window.__statuses = [];
    da.daOut.subscribe(n => { if (n.kind === 'status-message') window.__statuses.push(n.message); });
  });

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      mode: km.keyMenu.currentMode.name,
      statuses: window.__statuses ?? [],
      nodes: da.drawingLayer.getDANodes().map(n => ({
        text: n.label.text(), x: n.konvaGroup.x(), y: n.konvaGroup.y(), selected: n.isSelected,
      })),
      edges: da.drawingLayer.getDAEdges().map(e => ({
        from: e.srcNode.label.text() || 'unnamed',
        to: e.destNode.label.text() || 'unnamed',
        dir: e.directedness,
        labels: e.labels.map(l => l.label),
      })),
    };
  });

  const park = (x, y) => page.evaluate(([px, py]) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    da.crosshairsLayer.crosshairs.x = px;
    da.crosshairsLayer.crosshairs.y = py;
  }, [x, y]);

  const parkOnNode = (text) => page.evaluate((t) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t2 => t2.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const node = dl.getDANodes().find(n => n.label.text() === t);
    const pos = node.group.position();
    da.crosshairsLayer.crosshairs.x = (pos.x + node.NODE_WIDTH / 2) * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = (pos.y + node.NODE_HEIGHT / 2) * dl.scaleY() + dl.y();
  }, text);

  const escapeToNormal = async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  };

  // --- 1. tap a on empty ---
  await park(400, 300);
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  let s = await state();
  check('tap a on empty creates a node and enters labelEdit',
    s.nodes.length === 1 && s.mode === 'labelEdit', JSON.stringify({n: s.nodes.length, mode: s.mode}));
  await page.keyboard.type('alpha', { delay: 25 });
  await escapeToNormal();

  // --- 2. tap a over a node: connected quick-add below ---
  await parkOnNode('alpha');
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  s = await state();
  const alpha = s.nodes.find(n => n.text === 'alpha');
  const fresh = s.nodes.find(n => n.text === '');
  check('tap a over a node adds a connected node', s.nodes.length === 2 && s.edges.length === 1
    && s.edges[0].from === 'alpha', JSON.stringify(s.edges));
  check('new node sits below the anchor', fresh && alpha && fresh.y > alpha.y + 100,
    `anchor y=${alpha?.y}, new y=${fresh?.y}`);
  check('labelEdit after quick-add below', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('beta', { delay: 25 });
  await escapeToNormal();

  // --- 3. tap a over an edge: hint only ---
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const edge = dl.getDAEdges()[0];
    const pts = edge.getPathPoints();
    // geometric midpoint of the chord — clear of both node boxes on this
    // vertical edge
    const mid = {x: (pts[0].x + pts[pts.length - 1].x) / 2,
                 y: (pts[0].y + pts[pts.length - 1].y) / 2};
    da.crosshairsLayer.crosshairs.x = mid.x * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = mid.y * dl.scaleY() + dl.y();
  });
  const beforeCount = (await state()).nodes.length;
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  s = await state();
  check('tap a over an edge adds nothing and hints', s.nodes.length === beforeCount
    && s.mode === 'normal' && s.statuses.some(m => m.includes('Edge under crosshairs')),
    JSON.stringify({n: s.nodes.length, mode: s.mode, statuses: s.statuses.slice(-1)}));

  // --- 4. tap i over a node: edit its text ---
  await parkOnNode('beta');
  await page.keyboard.press('i');
  await page.waitForTimeout(200);
  s = await state();
  check('tap i over a node enters labelEdit', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('x', { delay: 25 });
  await escapeToNormal();
  s = await state();
  check('typed text appended to the node label', s.nodes.some(n => n.text === 'betax'),
    JSON.stringify(s.nodes.map(n => n.text)));

  // --- 5. tap i over the (label-less) edge: creates + edits an empty label ---
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const edge = dl.getDAEdges()[0];
    const pts = edge.getPathPoints();
    const mid = {x: (pts[0].x + pts[pts.length - 1].x) / 2,
                 y: (pts[0].y + pts[pts.length - 1].y) / 2};
    da.crosshairsLayer.crosshairs.x = mid.x * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = mid.y * dl.scaleY() + dl.y();
  });
  await page.keyboard.press('i');
  await page.waitForTimeout(200);
  s = await state();
  check('tap i over a label-less edge enters labelEdit', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('link', { delay: 25 });
  await escapeToNormal();
  s = await state();
  check('edge gained the typed label', s.edges[0]?.labels?.join() === 'link',
    JSON.stringify(s.edges[0]?.labels));

  // --- 6. v+o cycles selected-edge directedness ---
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.unselectAll();
    const edge = da.drawingLayer.getDAEdges()[0];
    edge.isSelected = true;
    da.drawingLayer.batchDraw();
  });
  await page.keyboard.down('v');
  await page.waitForTimeout(200);
  await page.keyboard.press('o');
  await page.waitForTimeout(100);
  s = await state();
  check('v+o: directed → undirected', s.edges[0].dir === 'undirected', s.edges[0].dir);
  await page.keyboard.press('o');
  await page.waitForTimeout(100);
  s = await state();
  check('v+o again: undirected → bidirectional', s.edges[0].dir === 'bidirectional', s.edges[0].dir);
  await page.keyboard.press('o');
  await page.waitForTimeout(100);
  await page.keyboard.up('v');
  await page.waitForTimeout(150);
  s = await state();
  check('v+o third: back to directed', s.edges[0].dir === 'directed', s.edges[0].dir);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
