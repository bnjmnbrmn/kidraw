/*
 * Stage 2 of the a=add / i=insert model: the held-a grow mode over a node
 * (notes/design-add-insert-model.md), vim profile, real keys:
 *
 *   1. hold a over a node, release with no keypress → the tap default:
 *      connected node one slot below + labelEdit (pristine release).
 *   2. hold a + l → target hops to the node on the right (ghost edge);
 *      release → edge anchor→target, NO new node, normal mode.
 *   3. hold a + l + o + o → directionality cycled twice (rev, undirected);
 *      release → undirected edge.
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

  // --- 1. pristine release = default add-below ---
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  let s = await state();
  check('holding a over a node enters grow mode', s.growActive === true, `growActive=${s.growActive}`);
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('pristine release quick-adds below', s.nodes.length === 4 && s.edges.length === 1
    && s.edges[0].from === 'A', JSON.stringify(s.edges));
  check('pristine release enters labelEdit', s.mode === 'labelEdit', s.mode);
  await page.keyboard.type('D', { delay: 25 });
  await escapeToNormal();

  // --- 2. targeting: hold a + l → B; release wires A→B ---
  await parkOnNode('A');
  const before = await state();
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('l');
  await page.waitForTimeout(150);
  s = await state();
  check('movement keys are captured (crosshairs still)', s.xh.x === before.xh.x && s.xh.y === before.xh.y,
    JSON.stringify({before: before.xh, after: s.xh}));
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('release wires anchor→target, no new node', s.nodes.length === 4
    && s.edges.some(e => e.from === 'A' && e.to === 'B' && e.dir === 'directed'), JSON.stringify(s.edges));
  check('stays in normal mode after existing-target commit', s.mode === 'normal', s.mode);
  check('grow mode exited', (await state()).growActive === false);

  // --- 3. o cycles directionality before commit ---
  await parkOnNode('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('l');
  await page.keyboard.press('o');
  await page.keyboard.press('o');
  await page.waitForTimeout(150);
  await page.keyboard.up('a');
  await page.waitForTimeout(200);
  s = await state();
  check('o o before release commits an undirected edge',
    s.edges.some(e => e.from === 'A' && e.to === 'B' && e.dir === 'undirected'), JSON.stringify(s.edges));

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

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
