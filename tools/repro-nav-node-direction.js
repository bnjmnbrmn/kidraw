/*
 * Move-by-node picks the node genuinely in the pressed direction, not a
 * mostly-perpendicular one that happens to be nearer (da-88: "sometimes hard
 * to get the node I want when navigating by node"). The direction gate is a
 * 45° cone: a node counts for `right` only if it is more rightward than
 * vertical, etc.
 *
 *   1. Bug case: a near-straight-down node with a small rightward jitter must
 *      NOT be grabbed by a RIGHT press when a true-right node exists.
 *   2. A clean ~35° diagonal is reachable by the closer axis (RIGHT) but not
 *      the farther one (DOWN).
 *   3. A steep ~68° node is DOWN-only; a RIGHT press finds nothing.
 *   4. End-to-end: the move-by-node submenu (g) jump lands on the on-axis
 *      node, driven by real keys.
 *   5. Repeated-press cycling: on the 3-node counterexample where A is
 *      otherwise unreachable, C up then up lands on A (steps through the
 *      cone's candidates); a third up stays; a different direction resets.
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

  const N = (id, x, y) => ({id, x, y, text: id, width: 120, height: 60, fontSize: 14, isSelected: false});

  // Load a layout and park the crosshairs on node A's center.
  const load = (nodes) => page.evaluate((nn) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    da.drawingLayer.restoreGraph({nodes: nn, edges: []});
    const dl = da.drawingLayer, A = dl.getDANodes().find(n => n.id === 'A');
    const p = A.group.position();
    da.crosshairsLayer.crosshairs.x = (p.x + A.NODE_WIDTH / 2) * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = (p.y + A.NODE_HEIGHT / 2) * dl.scaleY() + dl.y();
    da.drawingLayer.batchDraw();
  }, nodes);

  const pick = (dir) => page.evaluate((d) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const n = da.findNodeInDirection(d);
    return n ? n.id : null;
  }, dir);

  // --- 1. bug case ---
  await load([N('A', 600, 400), N('D', 630, 600), N('R', 1100, 400)]);
  check('RIGHT skips the near-straight-down jitter node, picks the true-right node',
    await pick('right') === 'R', `got ${await pick('right')}`);
  check('DOWN still picks the down node', await pick('down') === 'D', `got ${await pick('down')}`);

  // --- 2. clean 35° diagonal ---
  await load([N('A', 600, 400), N('DR', 950, 650)]);  // +350,+250 ≈ 35° from horizontal
  check('35° diagonal reachable by its dominant axis (RIGHT)', await pick('right') === 'DR');
  check('35° diagonal NOT reachable by its minor axis (DOWN)', await pick('down') === null,
    `got ${await pick('down')}`);

  // --- 3. steep 68° node ---
  await load([N('A', 600, 400), N('S', 720, 700)]);  // +120,+300 ≈ 68° from horizontal
  check('steep node is not grabbed by a RIGHT press', await pick('right') === null,
    `got ${await pick('right')}`);
  check('steep node is reachable by DOWN', await pick('down') === 'S');

  // --- 4. end-to-end via the move-by-node submenu (g) ---
  await load([N('A', 600, 400), N('D', 630, 600), N('R', 1100, 400)]);
  await page.keyboard.down('g');
  await page.waitForTimeout(220);
  await page.keyboard.press('l'); // jump right
  await page.waitForTimeout(250);
  await page.keyboard.up('g');
  await page.waitForTimeout(300);
  const onR = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const R = dl.getDANodes().find(n => n.id === 'R');
    const cx = da.crosshairsLayer.crosshairsX(), cy = da.crosshairsLayer.crosshairsY();
    const rc = {x: (R.konvaGroup.x() + R.NODE_WIDTH / 2) * dl.scaleX() + dl.x(),
                y: (R.konvaGroup.y() + R.NODE_HEIGHT / 2) * dl.scaleY() + dl.y()};
    return Math.hypot(cx - rc.x, cy - rc.y) < 5;
  });
  check('g→l jump lands the crosshairs on the true-right node', onR);

  // --- 5. repeated-press cycling reaches an otherwise-unreachable node ---
  // The proven counterexample: A only ever falls in a cone where B or C wins.
  await load([N('A', 450, 550), N('B', 100, 800), N('C', 200, 900)]);
  // park on C
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer, C = dl.getDANodes().find(n => n.id === 'C'), p = C.group.position();
    da.crosshairsLayer.crosshairs.x = (p.x + C.NODE_WIDTH / 2) * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = (p.y + C.NODE_HEIGHT / 2) * dl.scaleY() + dl.y();
  });
  const at = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer, cx = da.crosshairsLayer.crosshairsX(), cy = da.crosshairsLayer.crosshairsY();
    let best = '(none)', bd = 1e9;
    for (const n of dl.getDANodes()) {
      const c = {x: (n.konvaGroup.x() + n.NODE_WIDTH / 2) * dl.scaleX() + dl.x(),
                 y: (n.konvaGroup.y() + n.NODE_HEIGHT / 2) * dl.scaleY() + dl.y()};
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d < bd) { bd = d; best = n.id; }
    }
    return bd < 6 ? best : '(none)';
  });
  const jump = async (key) => {
    await page.keyboard.down('g'); await page.waitForTimeout(200);
    await page.keyboard.press(key); await page.waitForTimeout(280);
    await page.keyboard.up('g'); await page.waitForTimeout(250);
  };
  await jump('k'); // up
  check('C + up lands on the nearer node B', await at() === 'B', `at ${await at()}`);
  await jump('k'); // up again — cycle to the next candidate
  check('C + up + up cycles to the otherwise-unreachable A', await at() === 'A', `at ${await at()}`);
  await jump('k'); // up again — cycle exhausted, stays
  check('a third up stays on A (cycle exhausted, no wrap)', await at() === 'A', `at ${await at()}`);
  await jump('j'); // down — different direction resets the cycle
  check('a different direction starts a fresh cycle (down from A → C)', await at() === 'C', `at ${await at()}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
