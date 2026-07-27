/*
 * Stage 1 of the a=add / i=insert model (notes/design-add-insert-model.md),
 * vim profile, real keys:
 *
 *   1. tap `a` on empty canvas → default node at the crosshairs → labelEdit.
 *      The new node is centered and raised to at least 100% zoom for editing.
 *   2. tap `a` over a node → connected default node one slot below → labelEdit.
 *   3. tap `a` over an edge → hint, nothing added.
 *   4. tap `i` over a node → edit its text (append to existing).
 *   5. tap `i` over a label-less edge → empty label created and edited.
 *   6. hold `v` over an edge + `o` → four-state cycle: forward → reversed
 *      (endpoints swapped, labels mirrored) → undirected → bidirectional →
 *      back to the original wiring.
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
    // Reproduce the dogfood case: the graph is zoomed far out when a new
    // node is added and immediately needs readable label editing.
    da.drawingLayer.scale({x: 0.25, y: 0.25});
    da.drawingLayer.position({x: 0, y: 0});
    window.__statuses = [];
    da.daOut.subscribe(n => { if (n.kind === 'status-message') window.__statuses.push(n.message); });
  });

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const dl = da.drawingLayer;
    const scale = dl.scaleX();
    return {
      mode: km.keyMenu.currentMode.name,
      scale,
      stageCenter: {x: da.stage.width() / 2, y: da.stage.height() / 2},
      statuses: window.__statuses ?? [],
      nodes: da.drawingLayer.getDANodes().map(n => ({
        text: n.label.text(),
        x: n.konvaGroup.x(),
        y: n.konvaGroup.y(),
        stageX: dl.x() + (n.konvaGroup.x() + n.NODE_WIDTH / 2) * scale,
        stageY: dl.y() + (n.konvaGroup.y() + n.NODE_HEIGHT / 2) * scale,
        selected: n.isSelected,
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
  await page.waitForTimeout(420);
  let s = await state();
  check('tap a on empty creates a node and enters labelEdit',
    s.nodes.length === 1 && s.mode === 'labelEdit', JSON.stringify({n: s.nodes.length, mode: s.mode}));
  const editingNode = s.nodes[0];
  check('new node is centered and zoomed to a readable editing scale',
    s.scale >= 1 &&
      Math.abs(editingNode.stageX - s.stageCenter.x) < 4 &&
      Math.abs(editingNode.stageY - s.stageCenter.y) < 4,
    JSON.stringify({
      scale: s.scale,
      node: {x: editingNode.stageX, y: editingNode.stageY},
      center: s.stageCenter,
    }));
  await page.keyboard.type('alpha', { delay: 25 });
  await escapeToNormal();

  // --- 2. tap a over a node: connected quick-add below ---
  await parkOnNode('alpha');
  await page.keyboard.press('a');
  await page.waitForTimeout(420);
  s = await state();
  const alpha = s.nodes.find(n => n.text === 'alpha');
  const fresh = s.nodes.find(n => n.text === '');
  check('tap a over a node adds a connected node', s.nodes.length === 2 && s.edges.length === 1
    && s.edges[0].from === 'alpha', JSON.stringify(s.edges));
  check('new node sits below the anchor', fresh && alpha && fresh.y > alpha.y + 100,
    `anchor y=${alpha?.y}, new y=${fresh?.y}`);
  check('labelEdit after quick-add below', s.mode === 'labelEdit', s.mode);
  check('connected quick-add centers its new editable node',
    fresh &&
      Math.abs(fresh.stageX - s.stageCenter.x) < 4 &&
      Math.abs(fresh.stageY - s.stageCenter.y) < 4,
    JSON.stringify({
      node: fresh && {x: fresh.stageX, y: fresh.stageY},
      center: s.stageCenter,
    }));
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

  // --- 6. v+o cycles selected-edge directionality through all four states ---
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.unselectAll();
    const edge = da.drawingLayer.getDAEdges()[0];
    edge.isSelected = true;
    // Off-centre anchor so the t → 1-t mirroring is actually observable.
    if (edge.labels[0]) edge.setLabelAnchor(edge.labels[0], 0.2, edge.labels[0].side);
    da.drawingLayer.batchDraw();
  });
  const wiring = () => page.evaluate(() => {
    const e = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer.getDAEdges()[0];
    return {from: e.srcNode.label.text(), to: e.destNode.label.text(), dir: e.directedness,
            labelT: e.labels[0]?.edgeT ?? null};
  });
  const start = await wiring();
  await page.keyboard.down('v');
  await page.waitForTimeout(200);

  await page.keyboard.press('o');
  await page.waitForTimeout(120);
  let w = await wiring();
  check('v+o 1: endpoints reversed, still directed', w.from === start.to && w.to === start.from
    && w.dir === 'directed', JSON.stringify(w));
  check('label anchor mirrored with the reversal',
    w.labelT !== null && Math.abs(w.labelT - (1 - start.labelT)) < 0.001,
    `t ${start.labelT} → ${w.labelT}`);

  await page.keyboard.press('o');
  await page.waitForTimeout(120);
  w = await wiring();
  check('v+o 2: undirected', w.dir === 'undirected', JSON.stringify(w));

  await page.keyboard.press('o');
  await page.waitForTimeout(120);
  w = await wiring();
  check('v+o 3: bidirectional', w.dir === 'bidirectional', JSON.stringify(w));

  await page.keyboard.press('o');
  await page.waitForTimeout(120);
  await page.keyboard.up('v');
  await page.waitForTimeout(150);
  w = await wiring();
  check('v+o 4: back to the original forward wiring', w.from === start.from && w.to === start.to
    && w.dir === 'directed', JSON.stringify(w));
  check('label anchor restored', Math.abs(w.labelT - start.labelT) < 0.001,
    `t ${start.labelT} → ${w.labelT}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
