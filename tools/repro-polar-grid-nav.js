/*
 * Adaptive polar graph-item navigation, real vim-profile keys.
 *
 *   g→o selects the polar strategy and fixes the origin for that g hold.
 *   hjkl rotate their outward/inward/clockwise/counterclockwise roles by
 *   quadrant; n/p provide explicit clockwise/counterclockwise movement.
 *   Releasing g clears the origin; the next hold captures a new one.
 */
const { chromium } = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_BIN || undefined});
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  page.on('pageerror', error => console.error('[page error]', error.message));
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(tween => tween.finish()); da.tweens = [];
    const mk = (id, cx, cy) => ({id, x: cx - 30, y: cy - 18, text: id, width: 60, height: 36, fontSize: 12, isSelected: false});
    const ox = 700, oy = 200;
    const nodes = [mk('origin', ox, oy)];
    for (const [name, dx, dy] of [['e', 1, 0], ['s', 0, 1], ['w', -1, 0], ['n', 0, -1]]) {
      nodes.push(mk(`inner-${name}`, ox + dx * 100, oy + dy * 100));
      nodes.push(mk(`outer-${name}`, ox + dx * 160, oy + dy * 160));
    }
    da.drawingLayer.restoreGraph({nodes, edges: []});
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.scale({x: 1, y: 1});
    da.crosshairsLayer.crosshairs.x = ox;
    da.crosshairsLayer.crosshairs.y = oy;
    da.drawingLayer.batchDraw();
  });

  const at = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const cx = da.crosshairsLayer.crosshairsX(), cy = da.crosshairsLayer.crosshairsY();
    let best = '(none)', distance = Infinity;
    for (const node of da.drawingLayer.getDANodes()) {
      const center = da.getNodeCenterInStageCoordinates(node);
      const d = Math.hypot(center.x - cx, center.y - cy);
      if (d < distance) { distance = d; best = node.id; }
    }
    return distance < 8 ? best : '(none)';
  });
  const press = async key => {
    await page.keyboard.press(key);
    await page.waitForTimeout(220);
  };

  await page.keyboard.down('g'); await page.waitForTimeout(120);
  await press('o');
  const overlay = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const origin = da.polarOriginInStage();
    return {
      strategy: da.graphItemNavigationStrategy,
      origin,
      originMarkers: da.nodeGridGroup?.find('.polar-grid-origin').length ?? 0,
      rings: da.nodeGridGroup?.find('.polar-grid-ring-boundary').length ?? 0,
      spokes: da.nodeGridGroup?.find('.polar-grid-spoke-boundary').length ?? 0,
      markers: da.nodeGridGroup?.find('.polar-grid-membership-marker').length ?? 0,
    };
  });
  check('g→o selects a rendered adaptive polar grid',
    overlay.strategy === 'adaptive-polar-grid' && overlay.originMarkers === 1 &&
      overlay.rings >= 1 && overlay.spokes === 4 && overlay.markers === 8,
    JSON.stringify(overlay));
  check('polar origin begins at the item under the crosshairs',
    Math.abs(overlay.origin.x - 700) < 2 && Math.abs(overlay.origin.y - 200) < 2,
    JSON.stringify(overlay.origin));

  await press('l'); const a = await at(); // origin: right chooses east
  await press('l'); const b = await at(); // east quadrant: right = outward
  await press('j'); const c = await at(); // east quadrant: down = clockwise
  await press('k'); const d = await at(); // south quadrant: up = inward
  await press('h'); const e = await at(); // south quadrant: left = clockwise
  check('hjkl rotate polar roles with the current quadrant',
    [a, b, c, d, e].join(',') === 'inner-e,outer-e,outer-s,inner-s,inner-w',
    [a, b, c, d, e].join(' → '));

  await press('n'); const n = await at();
  await press('p'); const p = await at();
  check('n/p move explicitly clockwise/counterclockwise',
    n === 'inner-n' && p === 'inner-w', `${n} → ${p}`);

  const heldOrigin = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.polarOriginLayer;
  });
  check('origin stays fixed for the full g hold',
    Math.abs(heldOrigin.x - 700) < 2 && Math.abs(heldOrigin.y - 200) < 2,
    JSON.stringify(heldOrigin));

  await page.keyboard.up('g'); await page.waitForTimeout(120);
  const releasedOrigin = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.polarOriginLayer;
  });
  check('releasing g clears the polar origin', releasedOrigin === null, JSON.stringify(releasedOrigin));

  await page.keyboard.down('g'); await page.waitForTimeout(150);
  const nextOrigin = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.polarOriginLayer;
  });
  check('the next g hold captures the current item as a new origin',
    Math.abs(nextOrigin.x - 600) < 2 && Math.abs(nextOrigin.y - 200) < 2,
    JSON.stringify(nextOrigin));
  await page.keyboard.up('g');

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => { console.error(error); process.exit(1); });
