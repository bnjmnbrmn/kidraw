/*
 * Verify Center on Xhairs (r → c, vim profile): vim-zz for the canvas.
 * Pans the view so the graph point under the crosshairs lands at screen
 * center; the crosshairs stay over the same graph point; zoom unchanged.
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
    const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const cx = da.crosshairsLayer.crosshairsX();
    const cy = da.crosshairsLayer.crosshairsY();
    return {
      stage: { w: da.stage.width(), h: da.stage.height() },
      scale: dl.scaleX(),
      xh: { x: cx, y: cy },
      // graph point currently under the crosshairs
      layerPt: { x: (cx - dl.x()) / dl.scaleX(), y: (cy - dl.y()) / dl.scaleY() },
    };
  });

  // Park the crosshairs well off-center (screen coords).
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    da.crosshairsLayer.crosshairs.x = 210;
    da.crosshairsLayer.crosshairs.y = 780;
  });
  const before = await state();
  const offCenter = Math.hypot(before.xh.x - before.stage.w / 2, before.xh.y - before.stage.h / 2);
  check('crosshairs start off-center', offCenter > 200, offCenter.toFixed(0));

  // r held → c
  await page.keyboard.down('r');
  await page.waitForTimeout(250);
  await page.keyboard.press('c');
  await page.waitForTimeout(150);
  await page.keyboard.up('r');
  await page.waitForTimeout(700); // let the recenter tween finish

  const after = await state();
  check('crosshairs land at screen center',
    Math.abs(after.xh.x - after.stage.w / 2) < 1.5 && Math.abs(after.xh.y - after.stage.h / 2) < 1.5,
    `(${after.xh.x.toFixed(1)},${after.xh.y.toFixed(1)}) vs center (${after.stage.w / 2},${after.stage.h / 2})`);
  const drift = Math.hypot(after.layerPt.x - before.layerPt.x, after.layerPt.y - before.layerPt.y);
  check('same graph point stays under the crosshairs', drift < 1, `drift=${drift.toFixed(2)}px`);
  check('zoom unchanged', Math.abs(after.scale - before.scale) < 1e-9, `${before.scale} → ${after.scale}`);

  // Idempotent: running it again keeps everything put.
  await page.keyboard.down('r');
  await page.waitForTimeout(250);
  await page.keyboard.press('c');
  await page.waitForTimeout(150);
  await page.keyboard.up('r');
  await page.waitForTimeout(700);
  const again = await state();
  const drift2 = Math.hypot(again.layerPt.x - after.layerPt.x, again.layerPt.y - after.layerPt.y);
  check('second invocation is a no-op', drift2 < 1
    && Math.abs(again.xh.x - again.stage.w / 2) < 1.5, `drift=${drift2.toFixed(2)}px`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
