/*
 * Verify the unified insert/connect hub (vim profile, real keys):
 *
 *   1. hold a → d inserts a box at the crosshairs; releasing a enters
 *      labelEdit (covered more fully in repro-binding-reorg).
 *   2. hold a → hold u → d births a node wired anchor → new (anchor = the
 *      selected node); releasing a drops into labelEdit on the new node.
 *   3. hold a → hold o → c births a circle wired new → anchor.
 *   4. With no anchor (nothing selected, no traversal node), the connected
 *      insert warns and creates nothing — and releasing a must NOT enter
 *      labelEdit.
 *   5. hold a → g inserts a junction and releasing a stays in normal mode
 *      (junctions have no label).
 *   6. Post-insert drag phase: after any hub insert, movement keys drag the
 *      fresh node while a stays held — including after a
 *      connected insert with the connect modifier already released.
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
        text: n.label.text(), shape: n.nodeShape, selected: n.isSelected,
        x: n.konvaGroup.x(), y: n.konvaGroup.y(),
      })),
      edges: da.drawingLayer.getDAEdges().map(e => ({
        from: e.srcNode.label.text() || e.srcNode.nodeShape,
        to: e.destNode.label.text() || e.destNode.nodeShape,
      })),
    };
  });

  const park = (x, y) => page.evaluate(([px, py]) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    da.crosshairsLayer.crosshairs.x = px;
    da.crosshairsLayer.crosshairs.y = py;
  }, [x, y]);

  const escapeToNormal = async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  };

  const selectOnly = (text) => page.evaluate((t) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.unselectAll();
    const node = da.drawingLayer.getDANodes().find(n => n.label.text() === t);
    node.isSelected = true;
    da.drawingLayer.batchDraw();
  }, text);

  // --- 1. Plain insert: i → d, type the anchor's label ---
  await park(400, 300);
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('d');
  await page.waitForTimeout(120);
  await page.keyboard.up('a');
  await page.waitForTimeout(150);
  let s = await state();
  check('a→d inserts a box and enters labelEdit', s.nodes.length === 1 && s.mode === 'labelEdit',
    JSON.stringify({n: s.nodes.length, mode: s.mode}));
  await page.keyboard.type('root', { delay: 25 });
  await escapeToNormal();

  // --- 2. Connected out: anchor selected, i+u+d at an empty spot ---
  await selectOnly('root');
  await park(700, 300);
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.down('u');
  await page.waitForTimeout(150);
  await page.keyboard.press('d');
  await page.waitForTimeout(150);
  await page.keyboard.up('u');
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('a+u+d births a connected node', s.nodes.length === 2 && s.edges.length === 1,
    JSON.stringify({nodes: s.nodes.length, edges: s.edges}));
  // the unlabeled new node reports its shape ('box') as the fallback name
  check('edge wires anchor → new', s.edges[0]?.from === 'root' && s.edges[0]?.to === 'box',
    JSON.stringify(s.edges[0]));
  check('releasing a enters labelEdit on the new node', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('child', { delay: 25 });
  await escapeToNormal();

  // --- 3. Connected in: i+o+c wires new → anchor ---
  await selectOnly('child');
  await park(1000, 300);
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.down('o');
  await page.waitForTimeout(150);
  await page.keyboard.press('c');
  await page.waitForTimeout(150);
  await page.keyboard.up('o');
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  const inEdge = s.edges.find(e => e.to === 'child' && e.from !== 'root');
  check('a+o+c births a circle wired new → anchor', s.nodes.length === 3 && !!inEdge,
    JSON.stringify(s.edges));
  check('new node is a circle', s.nodes.some(n => n.shape === 'circle'), JSON.stringify(s.nodes));
  check('labelEdit again on release', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('input', { delay: 25 });
  await escapeToNormal();

  // --- 4. Anchorless connected insert warns and creates nothing ---
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.unselectAll();
    da.graphNavLastNode = null;
    da.drawingLayer.batchDraw();
  });
  await park(400, 600);
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.down('u');
  await page.waitForTimeout(150);
  await page.keyboard.press('d');
  await page.waitForTimeout(150);
  await page.keyboard.up('u');
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('anchorless a+u+d creates nothing', s.nodes.length === 3 && s.edges.length === 2,
    JSON.stringify({nodes: s.nodes.length, edges: s.edges.length}));
  check('anchorless attempt warns', s.statuses.some(m => m.includes('anchor')),
    JSON.stringify(s.statuses.slice(-2)));
  check('anchorless attempt does not enter labelEdit', s.mode === 'normal', s.mode);

  // --- 5. Junction insert never enters labelEdit ---
  await park(700, 600);
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('g');
  await page.waitForTimeout(120);
  await page.keyboard.up('a');
  await page.waitForTimeout(150);
  s = await state();
  check('a→g inserts a junction', s.nodes.filter(n => n.shape === 'junction').length === 1,
    JSON.stringify(s.nodes.map(n => n.shape)));
  check('junction insert stays in normal mode', s.mode === 'normal', s.mode);

  // --- 6. Post-insert drag phase ---
  // Plain insert: keep holding i after d and drag right with l.
  await escapeToNormal();
  await park(1000, 600);
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('d');
  await page.waitForTimeout(150);
  let before = await state();
  let fresh = before.nodes.find(n => n.selected);
  // right-hand drag keys (hjkl) — the left hand holds the a hub
  await page.keyboard.press('l');
  await page.keyboard.press('l');
  await page.waitForTimeout(150);
  s = await state();
  let after = s.nodes.find(n => n.selected);
  check('l drags the fresh node right while a held', after && fresh && after.x > fresh.x,
    `x ${fresh?.x} → ${after?.x}`);
  await page.keyboard.up('a');
  await page.waitForTimeout(150);
  s = await state();
  check('release after drag still enters labelEdit', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('dragged', { delay: 20 });
  await escapeToNormal();

  // Connected insert: release u first, then drag with only i held.
  await selectOnly('dragged');
  await park(1300, 600);
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.down('u');
  await page.waitForTimeout(150);
  await page.keyboard.press('d');
  await page.waitForTimeout(150);
  await page.keyboard.up('u');
  await page.waitForTimeout(150);
  before = await state();
  fresh = before.nodes.find(n => n.selected);
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await page.waitForTimeout(150);
  s = await state();
  after = s.nodes.find(n => n.selected);
  check('j drags down after releasing the connect modifier (only a held)',
    after && fresh && after.y > fresh.y, `y ${fresh?.y} → ${after?.y}`);
  check('connected edge exists from the drag anchor', s.edges.some(e => e.from === 'dragged'),
    JSON.stringify(s.edges));
  await page.keyboard.up('a');
  await page.waitForTimeout(150);
  s = await state();
  check('labelEdit after connected drag phase', s.mode === 'labelEdit', s.mode);
  await escapeToNormal();

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
