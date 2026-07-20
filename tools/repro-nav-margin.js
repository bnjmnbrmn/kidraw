/*
 * Navigating to a node must leave it fully readable, not clipped by the
 * drawing-area edge (Ben, 2026-07-20): the crosshairs' keep-out band from
 * the viewport edge grows to half the landed-on node's rendered box.
 *
 *   1. Jump right (move-by-node) onto a wide card far off-screen: the whole
 *      card ends up inside the viewport.
 *   2. Same jump onto a small node: the band stays at its 60px floor (no
 *      gratuitous over-panning).
 *   3. The band never exceeds 40% of the viewport, so a card wider than the
 *      screen still lands (clamped) rather than deadlocking movement.
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

  /** Build a two-node graph: anchor at the left, target far to the right. */
  const setup = (targetWidth) => page.evaluate((w) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    da.drawingLayer.restoreGraph({
      nodes: [
        {id: 'da-1', x: 100, y: 400, text: 'A', width: 120, height: 60, fontSize: 14,
         isSelected: false, textOverflowMode: 'clip'},
        {id: 'da-2', x: 1800, y: 400, text: 'wide target card', width: w, height: 70,
         fontSize: 14, isSelected: false, textOverflowMode: 'clip'},
      ],
      edges: [],
    });
    // Reset the view, then park the crosshairs on A.
    da.drawingLayer.x(0); da.drawingLayer.y(0);
    const n = da.drawingLayer.getDANodes()[0];
    da.crosshairsLayer.crosshairs.x = n.konvaGroup.x() + n.NODE_WIDTH / 2;
    da.crosshairsLayer.crosshairs.y = n.konvaGroup.y() + n.NODE_HEIGHT / 2;
    da.drawingLayer.batchDraw();
  }, targetWidth);

  /** Target node box in stage (screen) coordinates, after the jump. */
  const targetBox = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const n = dl.getDANodes()[1];
    const s = dl.scaleX();
    return {
      left: n.konvaGroup.x() * s + dl.x(),
      right: (n.konvaGroup.x() + n.NODE_WIDTH) * s + dl.x(),
      top: n.konvaGroup.y() * s + dl.y(),
      bottom: (n.konvaGroup.y() + n.NODE_HEIGHT) * s + dl.y(),
      stageW: da.stage.width(),
      stageH: da.stage.height(),
      xh: da.crosshairsLayer.crosshairsX(),
    };
  });

  // move-by-node is the g submenu; l = jump right.
  const jumpRight = async () => {
    await page.keyboard.down('g');
    await page.waitForTimeout(220);
    await page.keyboard.press('l');
    await page.waitForTimeout(200);
    await page.keyboard.up('g');
    await page.waitForTimeout(300);
  };

  // --- 1. wide card lands fully visible ---
  await setup(280);
  await jumpRight();
  let b = await targetBox();
  check('jumped onto the wide card', Math.abs(b.xh - (b.left + b.right) / 2) < 2,
    `xh=${b.xh.toFixed(0)} card center=${((b.left + b.right) / 2).toFixed(0)}`);
  check('wide card is fully inside the viewport',
    b.left >= 0 && b.right <= b.stageW && b.top >= 0 && b.bottom <= b.stageH,
    `left=${b.left.toFixed(0)} right=${b.right.toFixed(0)} stageW=${b.stageW}`);

  // --- 2. small node keeps the 60px floor (no over-panning) ---
  await setup(80);
  await jumpRight();
  b = await targetBox();
  check('small node also fully visible', b.left >= 0 && b.right <= b.stageW,
    `left=${b.left.toFixed(0)} right=${b.right.toFixed(0)}`);
  check('small node does not over-pan (band stays near its floor)',
    b.stageW - b.xh <= 70, `gap=${(b.stageW - b.xh).toFixed(0)}px`);

  // --- 3. absurdly wide card: band clamps, movement still works ---
  await setup(1800);
  await jumpRight();
  b = await targetBox();
  check('over-wide card still jumps (band clamped at 40% of viewport)',
    b.xh <= b.stageW * 0.6 + 1 && b.xh >= b.stageW * 0.4 - 1,
    `xh=${b.xh.toFixed(0)} stageW=${b.stageW}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
