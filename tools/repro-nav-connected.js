/*
 * Connected-neighbour priority in move-by-node (Ben, 2026-07-21): a hub node
 * that sits nearly in-line with its neighbours (small vertical gap, wide
 * horizontal spread) was hard to reach because it fell outside the 45° cone
 * from most neighbours. Now a node's directly-connected neighbours are
 * admitted by the loose half-plane and sorted first, so pressing roughly
 * toward a connected node reaches it in one press; unconnected clutter keeps
 * the strict cone.
 *
 * Layout mirrors the "Bugs" hub: HUB is a small node ~90px above a wide row
 * of children C0..C4 (span ~1000px), each connected only to HUB. A separate
 * UNREL node sits between two children, unconnected — it must NOT be grabbed.
 */
const { chromium } = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const mk = (id, cx, cy) => ({id, x: cx - 50, y: cy - 25, text: id, width: 100, height: 50, fontSize: 14, isSelected: false});
    const nodes = [mk('HUB', 700, 300)];
    const xs = [200, 450, 700, 950, 1200];
    xs.forEach((x, i) => nodes.push(mk('C' + i, x, 390)));   // children ~90px below, wide spread
    nodes.push(mk('UNREL', 575, 500));                        // unconnected, below-left of HUB
    const edges = xs.map((_, i) => ({id: 'e' + i, srcNodeId: 'HUB', destNodeId: 'C' + i, isSelected: false, labels: []}));
    da.drawingLayer.restoreGraph({nodes, edges});
    da.drawingLayer.batchDraw();
  });

  const parkOn = (id) => page.evaluate((t) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(x => x.finish()); da.tweens = []; da.nodeDirCycle = null;
    const n = da.drawingLayer.getDANodes().find(n => n.id === t);
    const c = da.getNodeCenterInStageCoordinates(n);
    da.crosshairsLayer.crosshairs.x = c.x; da.crosshairsLayer.crosshairs.y = c.y;
  }, id);
  const at = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const cx = da.crosshairsLayer.crosshairsX(), cy = da.crosshairsLayer.crosshairsY();
    let best = '(none)', bd = 1e9;
    for (const n of da.drawingLayer.getDANodes()) { const c = da.getNodeCenterInStageCoordinates(n); const d = Math.hypot(c.x - cx, c.y - cy); if (d < bd) { bd = d; best = n.id; } }
    return bd < 10 ? best : '(none)';
  });
  const press = async (key) => {
    await page.keyboard.down('g'); await page.waitForTimeout(170);
    await page.keyboard.press(key); await page.waitForTimeout(240);
    await page.keyboard.up('g'); await page.waitForTimeout(200);
  };

  // Every child reaches the hub with a single UP press, even the far outer
  // ones where the hub is nearly horizontal (outside a 45° up cone).
  for (const c of ['C0', 'C1', 'C2', 'C3', 'C4']) {
    await parkOn(c);
    await press('k');
    check(`${c} + up reaches HUB (connected, single press)`, await at() === 'HUB', `landed ${await at()}`);
  }

  // From the hub, down reaches a child (connected, below).
  await parkOn('HUB');
  await press('j');
  check('HUB + down reaches a child', /^C\d$/.test(await at()), `landed ${await at()}`);

  // The unconnected UNREL node is NOT grabbed by a HUB down press over the
  // children (it is below but the children are the connected targets)...
  await parkOn('HUB');
  await press('j');
  check('HUB + down prefers a connected child over the unconnected UNREL', (await at()) !== 'UNREL', `landed ${await at()}`);

  // ...and an unconnected node still obeys the strict cone: from UNREL,
  // pressing up (HUB is up but ~in a cone) works, but pressing left/right
  // must not grab HUB (it is not connected and mostly-vertical from UNREL).
  await parkOn('UNREL');
  await press('l'); // right — HUB is up-ish, not right
  check('unconnected UNREL + right does not grab the mostly-vertical HUB', (await at()) !== 'HUB', `landed ${await at()}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
