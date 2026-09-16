/*
 * Stage 2 of the a=add / i=insert model: the held-a grow mode over a node
 * (notes/design-add-insert-model.md), vim profile, real keys:
 *
 *   1. hold a over a node, release with no keypress → the tap default:
 *      connected node one slot right + labelEdit (pristine release).
 *   2. hold a + l + l → target cycles past the quick-added node to B
 *      on the right (ghost edge);
 *      release → edge anchor→target, NO new node, normal mode.
 *   3. hold a + l + l + o + o → default undirected directionality cycled
 *      twice (bidirectional, directed); release → directed edge.
 *   4. hold a + l + h (come home to the anchor) → release commits nothing.
 *   5. While the grow mode is held, movement keys do NOT move the
 *      crosshairs (keymenu suspended).
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

  check('header always identifies an unbacked graph as Untitled',
    (await page.locator('.file-chip').textContent())?.trim() === 'Untitled');

  // Three unconnected nodes: anchor A, B to its right, C below-left.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const mk = (id, x, y, text) => ({
      id, x, y, text, width: 120, height: 60, fontSize: 14, isSelected: false,
    });
    da.drawingLayer.restoreGraph({
      nodes: [mk('da-1', 400, 300, 'A'), mk('da-2', 900, 300, 'B'), mk('da-3', 300, 700, 'C')],
      edges: [],
    });
    da.drawingLayer.batchDraw();
    window.__statuses = [];
    da.daOut.subscribe(n => { if (n.kind === 'status-message') window.__statuses.push(n.message); });
  });

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      mode: km.keyMenu.currentMode.name,
      statuses: window.__statuses ?? [],
      growActive: da.growActive,
      xh: { x: da.crosshairsLayer.crosshairsX(), y: da.crosshairsLayer.crosshairsY() },
      nodes: da.drawingLayer.getDANodes().map(n => ({ text: n.label.text(), y: n.konvaGroup.y() })),
      edges: da.drawingLayer.getDAEdges().map(e => ({
        from: e.srcNode.label.text(), to: e.destNode.label.text(), dir: e.directedness,
      })),
    };
  });

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

  // --- 1. pristine release = default add-right ---
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  let s = await state();
  check('holding a over a node shows targeting controls', s.growActive === true
    && s.mode === 'surfaceGrowTargeting', JSON.stringify({growActive: s.growActive, mode: s.mode}));
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('pristine release quick-adds right', s.nodes.length === 4 && s.edges.length === 1
    && s.edges[0].from === 'A', JSON.stringify(s.edges));
  check('pristine release enters labelEdit', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('D', { delay: 25 });
  await escapeToNormal();

  // --- 2. targeting: hold a + l + l → cycle past D to B; release wires A—B ---
  await parkOnNode('A');
  const before = await state();
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('l');
  await page.keyboard.press('l');
  await page.waitForTimeout(150);
  s = await state();
  check('movement keys are captured (crosshairs still)', s.xh.x === before.xh.x && s.xh.y === before.xh.y,
    JSON.stringify({before: before.xh, after: s.xh}));
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('release wires anchor→target, no new node', s.nodes.length === 4
    && s.edges.some(e => e.from === 'A' && e.to === 'B' && e.dir === 'undirected'), JSON.stringify(s.edges));
  check('stays in normal mode after existing-target commit', s.mode === 'normal', s.mode);
  check('grow mode exited', (await state()).growActive === false);

  // --- 3. o cycles directionality before commit ---
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('l');
  await page.keyboard.press('l');
  await page.keyboard.press('o');
  await page.keyboard.press('o');
  await page.waitForTimeout(150);
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('o o before release commits a directed edge',
    s.edges.some(e => e.from === 'A' && e.to === 'B' && e.dir === 'directed'), JSON.stringify(s.edges));

  // --- 4. come home to cancel ---
  const edgeCount = s.edges.length;
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('l');
  await page.waitForTimeout(100);
  await page.keyboard.press('h');
  await page.waitForTimeout(100);
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('hopping back onto the anchor commits nothing', s.edges.length === edgeCount
    && s.nodes.length === 4 && s.mode === 'normal', JSON.stringify({edges: s.edges.length, mode: s.mode}));

  // --- 5. / fuzzy target search (sticky phase) ---
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('/');
  await page.waitForTimeout(250);
  let popup = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return { open: da.navPopupOpen, purpose: da.navPopupPurpose, grow: da.growActive };
  });
  const targetMenuMode = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-keymenu')).keyMenu.currentMode.name);
  check('/ opens the target search popup and updates the keymenu',
    popup.open && popup.purpose === 'grow-target'
      && targetMenuMode === 'surfaceGrowTargetPopup',
    JSON.stringify({...popup, menu: targetMenuMode}));
  await page.keyboard.up('a'); // sticky: releasing a must not commit
  await page.waitForTimeout(150);
  s = await state();
  const edgesBeforeSearch = s.edges.length;
  check('releasing a with the popup open commits nothing', s.growActive === true
    && (await page.evaluate(() => window.ng.getComponent(document.querySelector('app-drawing-area')).navPopupOpen)),
    JSON.stringify({grow: s.growActive}));
  await page.keyboard.type('c', { delay: 40 });
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  s = await state();
  check('Enter commits the edge to the searched node', s.edges.length === edgesBeforeSearch + 1
    && s.edges.some(e => e.from === 'A' && e.to === 'C'), JSON.stringify(s.edges));
  check('grow mode fully exited after search commit', s.growActive === false && s.mode === 'normal',
    JSON.stringify({grow: s.growActive, mode: s.mode}));

  // --- 6. Esc in the search cancels the whole add ---
  const edgeCount2 = s.edges.length;
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('/');
  await page.waitForTimeout(250);
  await page.keyboard.up('a');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  s = await state();
  check('Esc Esc cancels the add from the search popup', s.edges.length === edgeCount2
    && s.growActive === false && s.mode === 'normal'
    && s.statuses.some(m => m.includes('Add canceled')),
    JSON.stringify({edges: s.edges.length, grow: s.growActive, mode: s.mode}));

  // --- 7. a+f type popup → placement → release commits new node ---
  const nodesBefore7 = s.nodes.length;
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  popup = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return { open: da.navPopupOpen, purpose: da.navPopupPurpose };
  });
  const typeMenuMode = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-keymenu')).keyMenu.currentMode.name);
  check('a+f opens the type popup and updates the keymenu', popup.open
    && popup.purpose === 'grow-type' && typeMenuMode === 'surfaceGrowTypePopup',
    JSON.stringify({...popup, menu: typeMenuMode}));
  await page.keyboard.press('j'); // highlight Circle
  await page.waitForTimeout(120);
  await page.keyboard.up('f');    // release selects → placement mode
  await page.waitForTimeout(250);
  let placing = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return { placing: da.growPlacing, shape: da.growShape, open: da.navPopupOpen,
      menu: km.keyMenu.currentMode.name };
  });
  check('releasing f selects the type and enters placement', placing.placing === true
    && placing.shape === 'circle' && !placing.open
    && placing.menu === 'surfaceGrowPlacement', JSON.stringify(placing));
  await page.keyboard.press('l'); // rough throw right
  await page.keyboard.press('l'); // grid step right
  await page.waitForTimeout(120);
  await page.keyboard.up('a');    // commit
  await page.waitForTimeout(250);
  s = await state();
  const circle = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const A = da.drawingLayer.getDANodes().find(n => n.label.text() === 'A');
    const c = da.drawingLayer.getDANodes().find(n => n.nodeShape === 'circle');
    return c ? { x: c.konvaGroup.x(), ax: A.konvaGroup.x(), edge: c.connectedEdges.length } : null;
  });
  check('release commits a connected circle placed to the right', s.nodes.length === nodesBefore7 + 1
    && circle && circle.x > circle.ax && circle.edge === 1, JSON.stringify(circle));
  check('placement commit enters labelEdit', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('E', { delay: 25 });
  await escapeToNormal();

  // --- 8. sticky placement: a released during popup, Enter commits ---
  const nodesBefore8 = (await state()).nodes.length;
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  await page.keyboard.up('a');   // sticky — popup owns the flow now
  await page.waitForTimeout(120);
  await page.keyboard.up('f');   // selects Box (top row)
  await page.waitForTimeout(250);
  await page.keyboard.press('h'); // rough throw left
  await page.waitForTimeout(120);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  s = await state();
  check('sticky placement commits on Enter', s.nodes.length === nodesBefore8 + 1
    && s.mode === 'labelEdit', JSON.stringify({n: s.nodes.length, mode: s.mode}));
  await escapeToNormal();

  // --- 9. Escape in placement cancels ---
  const nodesBefore9 = (await state()).nodes.length;
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  await page.keyboard.up('f');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('Escape in placement cancels without creating', s.nodes.length === nodesBefore9
    && s.growActive === false && s.mode === 'normal',
    JSON.stringify({n: s.nodes.length, grow: s.growActive, mode: s.mode}));

  // --- 10. Empty-canvas a+f uses the type popup and creates a free node ---
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.crosshairsLayer.crosshairs.x = 1450;
    da.crosshairsLayer.crosshairs.y = 850;
  });
  const before10 = await state();
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  popup = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {open: da.navPopupOpen, purpose: da.navPopupPurpose, anchor: da.growAnchor,
      menu: km.keyMenu.currentMode.name};
  });
  check('empty-canvas a+f opens the type popup', popup.open
    && popup.purpose === 'grow-type' && popup.anchor === null
    && popup.menu === 'surfaceGrowTypePopup', JSON.stringify(popup));
  await page.keyboard.press('j');
  await page.keyboard.press('j'); // Diamond
  await page.keyboard.up('f');
  await page.waitForTimeout(200);
  await page.keyboard.up('a');
  await page.waitForTimeout(250);
  s = await state();
  const freeDiamond = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const nodes = da.drawingLayer.getDANodes();
    const node = nodes[nodes.length - 1];
    return {shape: node.nodeShape, edges: node.connectedEdges.length};
  });
  check('empty-canvas type choice commits a free diamond',
    s.nodes.length === before10.nodes.length + 1 && s.edges.length === before10.edges.length
      && freeDiamond.shape === 'diamond' && freeDiamond.edges === 0 && s.mode === 'labelEdit',
    JSON.stringify({node: freeDiamond, mode: s.mode}));

  // --- 10. grow-mode target hop cycles (reaches an otherwise-shadowed node) ---
  // Anchor X; U1 straight up (near); U2 up-and-right — in X's up cone but NOT
  // in U1's up cone, so plain walking dead-ends at U1 while cycling reaches U2.
  await escapeToNormal();
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const mk = (id, cx, cy) => ({id, x: cx - 60, y: cy - 30, text: id, width: 120, height: 60, fontSize: 14, isSelected: false});
    da.drawingLayer.restoreGraph({nodes: [mk('X', 600, 700), mk('U1', 600, 500), mk('U2', 750, 450)], edges: []});
    const dl = da.drawingLayer, X = dl.getDANodes().find(n => n.id === 'X'), p = X.group.position();
    da.crosshairsLayer.crosshairs.x = (p.x + X.NODE_WIDTH / 2) * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = (p.y + X.NODE_HEIGHT / 2) * dl.scaleY() + dl.y();
  });
  const growTarget = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.growTarget ? da.growTarget.label.text() : null;
  });
  await page.keyboard.down('a');
  await page.waitForTimeout(260);
  await page.keyboard.press('k'); // up
  await page.waitForTimeout(160);
  check('grow up #1 targets the near node U1', await growTarget() === 'U1', `target ${await growTarget()}`);
  await page.keyboard.press('k'); // up again — cycles past U1 to U2
  await page.waitForTimeout(160);
  check('grow up #2 cycles to U2 (shadowed from U1, unreachable by walking)',
    await growTarget() === 'U2', `target ${await growTarget()}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.up('a');
  await page.waitForTimeout(150);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
