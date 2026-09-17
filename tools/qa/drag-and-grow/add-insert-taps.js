/*
 * Stage 1 of the a=add / i=insert model (notes/design-add-insert-model.md),
 * vim profile, real keys:
 *
 *   1. tap `a` on empty canvas → default node at the crosshairs → labelEdit.
 *      The new node is centered and raised to at least 100% zoom for editing.
 *   2. tap `a` over a node → connected default node one slot right → labelEdit.
 *   3. tap `a` over an edge → hint, nothing added.
 *   4. tap `i` over a node → edit its text (append to existing).
 *   5. tap `i` over a label-less edge → empty label created and edited.
 *   6. hold `v` over the new undirected edge + `o` → four-state cycle:
 *      bidirectional → directed one way → directed the other way → undirected.
 */
const {launch, openApp, settled, movedAndSettled, crosshairsOf, afterFrame,
  overlay: waitForOverlay, waitForDA, checker} = require('../harness');

const check = checker();

async function main() {
  const browser = await launch();
  const page = await openApp(browser, {width: 1600, height: 1000});
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

  /** A known graph and a known viewport, so each case starts from the same
   *  place. These cases used to run as a chain — case 2 built the node and
   *  edge that 3, 4 and 5 relied on — so changing any one of them broke the
   *  rest for reasons unrelated to what was being tested. */
  const twoNodes = () => ({
    nodes: [
      {id: 'n1', x: 700, y: 300, text: 'alpha', width: 120, height: 60, fontSize: 14, isSelected: false},
      {id: 'n2', x: 700, y: 700, text: 'beta', width: 120, height: 60, fontSize: 14, isSelected: false},
    ],
    edges: [{id: 'e1', srcNodeId: 'n1', destNodeId: 'n2', isSelected: false, labels: []}],
  });
  const oneNode = () => ({nodes: [twoNodes().nodes[0]], edges: []});

  const reset = (graph) => page.evaluate(g => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    dl.clearAll();
    dl.scale({x: 1, y: 1});
    dl.position({x: 0, y: 0});
    if (g) dl.restoreGraph(g);
    dl.batchDraw();
    window.__statuses = [];
  }, graph);

  /** Park on the chord midpoint of the first edge — clear of both node boxes. */
  const parkOnEdge = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const pts = dl.getDAEdges()[0].getPathPoints();
    const mid = {x: (pts[0].x + pts[pts.length - 1].x) / 2,
                 y: (pts[0].y + pts[pts.length - 1].y) / 2};
    da.crosshairsLayer.crosshairs.x = mid.x * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = mid.y * dl.scaleY() + dl.y();
  });

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

  // --- 2. tap a over a node: self-loop (ledger case 6, revised 2026-08-09) ---
  // Used to add a connected node one slot right; the revision made the tap
  // create a self-loop with the current edge defaults. Growing to a *new*
  // node is the held-`a` flow now (grow-mode.js).
  await reset(oneNode());
  await parkOnNode('alpha');
  await page.keyboard.press('a');
  await afterFrame(page); await settled(page);
  s = await state();
  check('tap a over a node adds a self-loop and no new node',
    s.nodes.length === 1 && s.edges.length === 1
      && s.edges[0].from === 'alpha' && s.edges[0].to === 'alpha',
    JSON.stringify({nodes: s.nodes.length, edges: s.edges}));
  check('the self-loop tap leaves normal mode', s.mode === 'normal', s.mode);

  // --- 3. tap a over a bare edge: new label, straight into Insert ---
  // Ledger row 6b said "no-op + hint" until 2026-09-17; it contradicted the
  // prose in the same design note, and the built behaviour followed the prose.
  await reset(twoNodes());
  await parkOnEdge();
  const before3 = (await state()).nodes.length;
  await page.keyboard.press('a');
  await afterFrame(page); await settled(page);
  s = await state();
  check('tap a over a bare edge adds a label and no node',
    s.nodes.length === before3 && s.edges[0]?.labels?.length === 1,
    JSON.stringify({nodes: s.nodes.length, labels: s.edges[0]?.labels}));
  check('the new edge label opens for editing', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('mid', {delay: 25});
  await escapeToNormal();
  s = await state();
  check('typed text lands on the new edge label', s.edges[0]?.labels?.join() === 'mid',
    JSON.stringify(s.edges[0]?.labels));

  // --- 4. tap i over a node: edit its text ---
  await reset(twoNodes());
  await parkOnNode('beta');
  await page.keyboard.press('i');
  await afterFrame(page); await settled(page);
  s = await state();
  check('tap i over a node enters labelEdit', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('x', {delay: 25});
  await escapeToNormal();
  s = await state();
  check('typed text appended to the node label', s.nodes.some(n => n.text === 'betax'),
    JSON.stringify(s.nodes.map(n => n.text)));

  // --- 5. tap i over the (label-less) edge: creates + edits an empty label ---
  await reset(twoNodes());
  await parkOnEdge();
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
  check('v+o 1: bidirectional with stable endpoints', w.from === start.from && w.to === start.to
    && w.dir === 'bidirectional', JSON.stringify(w));
  check('label anchor stays put without a reversal',
    w.labelT !== null && Math.abs(w.labelT - start.labelT) < 0.001,
    `t ${start.labelT} → ${w.labelT}`);

  await page.keyboard.press('o');
  await page.waitForTimeout(120);
  w = await wiring();
  check('v+o 2: first directed orientation', w.from === start.to && w.to === start.from
    && w.dir === 'directed', JSON.stringify(w));
  check('label anchor mirrors with the reversal',
    w.labelT !== null && Math.abs(w.labelT - (1 - start.labelT)) < 0.001,
    `t ${start.labelT} → ${w.labelT}`);

  await page.keyboard.press('o');
  await page.waitForTimeout(120);
  w = await wiring();
  check('v+o 3: opposite directed orientation', w.from === start.from && w.to === start.to
    && w.dir === 'directed', JSON.stringify(w));

  await page.keyboard.press('o');
  await page.waitForTimeout(120);
  await page.keyboard.up('v');
  await page.waitForTimeout(150);
  w = await wiring();
  check('v+o 4: back to the original undirected wiring', w.from === start.from && w.to === start.to
    && w.dir === 'undirected', JSON.stringify(w));
  check('label anchor restored', Math.abs(w.labelT - start.labelT) < 0.001,
    `t ${start.labelT} → ${w.labelT}`);

  await browser.close();
  console.log(check.failures === 0 ? 'ALL CHECKS PASSED' : `${check.failures} CHECK(S) FAILED`);
  process.exit(check.failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
