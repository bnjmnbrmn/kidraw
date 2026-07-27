/*
 * Adaptive quadrant-ring graph-item navigation, real vim-profile keys.
 *
 *   g→r selects four independently spaced quarter-ring systems.
 *   Repeating one direction walks outward through that quadrant one item at
 *   a time; changing direction re-origins before starting the new run.
 */
const {chromium} = require('@playwright/test');

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
  const page = await (await browser.newContext({
    viewport: {width: 1400, height: 900},
  })).newPage();
  page.on('pageerror', error => console.error('[page error]', error.message));
  await page.goto('http://localhost:4200', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(tween => tween.finish());
    da.tweens = [];
    const mk = (id, cx, cy) => ({
      id,
      x: cx - 30,
      y: cy - 18,
      text: id,
      width: 60,
      height: 36,
      fontSize: 12,
      isSelected: false,
    });
    da.drawingLayer.restoreGraph({
      nodes: [
        mk('origin', 250, 200),
        mk('east-near', 320, 200),
        mk('east-middle', 390, 220),
        mk('east-far', 470, 160),
        mk('north-near', 250, 120),
        mk('north-far', 290, 65),
        mk('south-near', 240, 280),
        mk('south-far', 220, 340),
        mk('west-near', 180, 190),
        mk('west-far', 70, 160),
        // South of east-far, but not in the original origin's East quadrant.
        mk('turn-south', 360, 350),
      ],
      edges: [],
    });
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.scale({x: 1, y: 1});
    da.crosshairsLayer.crosshairs.x = 250;
    da.crosshairsLayer.crosshairs.y = 200;
    da.drawingLayer.batchDraw();
  });

  const press = async key => {
    await page.keyboard.press(key);
    await page.waitForTimeout(220);
  };
  const at = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const cx = da.crosshairsLayer.crosshairsX();
    const cy = da.crosshairsLayer.crosshairsY();
    let best = '(none)';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of da.drawingLayer.getDANodes()) {
      const center = da.getNodeCenterInStageCoordinates(node);
      const distance = Math.hypot(center.x - cx, center.y - cy);
      if (distance < bestDistance) {
        best = node.id;
        bestDistance = distance;
      }
    }
    return bestDistance < 8 ? best : '(none)';
  });

  const defaultStrategy = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.graphItemNavigationStrategy;
  });
  check('adaptive quadrant rings are the session default',
    defaultStrategy === 'adaptive-quadrant-rings',
    String(defaultStrategy));

  await page.keyboard.down('g');
  await page.waitForTimeout(120);
  await press('r');

  const overlay = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      strategy: da.graphItemNavigationStrategy,
      stage: {width: da.stage.width(), height: da.stage.height()},
      origin: da.quadrantOriginInStage(),
      origins: da.nodeGridGroup?.find('.quadrant-ring-origin').length ?? 0,
      diagonals: da.nodeGridGroup?.find('.quadrant-ring-diagonal').length ?? 0,
      boundaries: da.nodeGridGroup?.find('.quadrant-ring-boundary').length ?? 0,
      bands: da.nodeGridGroup?.find('.quadrant-ring-band').length ?? 0,
      activeBands: da.nodeGridGroup?.find('.quadrant-ring-active-band').length ?? 0,
      rectangularBoundaries:
        (da.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0) +
        (da.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0),
    };
  });
  check('g→r selects quarter rings without replacing the rectangular option',
    overlay.strategy === 'adaptive-quadrant-rings' &&
      overlay.origins === 1 &&
      overlay.diagonals === 4 &&
      overlay.boundaries >= 5 &&
      overlay.bands >= 3 &&
      overlay.activeBands === 0 &&
      overlay.rectangularBoundaries === 0,
    JSON.stringify(overlay));

  await press('l');
  const first = await at();
  const firstActiveBands = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.nodeGridGroup?.find('.quadrant-ring-active-band').length ?? 0;
  });
  await press('l');
  const second = await at();
  await press('l');
  const third = await at();
  check('repeated l walks the East quarter-rings outward',
    first === 'east-near' &&
      second === 'east-middle' &&
      third === 'east-far' &&
      firstActiveBands === 1,
    `${first} → ${second} → ${third}; active bands=${firstActiveBands}`);

  const originBeforeTurn = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.quadrantOriginInStage();
  });
  await press('j');
  const afterTurn = await at();
  const originAfterTurn = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.quadrantOriginInStage();
  });
  check('a direction change re-origins, then enters the new quadrant',
    afterTurn === 'turn-south' &&
      Math.abs(originBeforeTurn.x - 250) < 2 &&
      Math.abs(originBeforeTurn.y - 200) < 2 &&
      Math.abs(originAfterTurn.x - 470) < 2 &&
      Math.abs(originAfterTurn.y - 160) < 2,
    JSON.stringify({afterTurn, originBeforeTurn, originAfterTurn}));

  await page.keyboard.up('g');
  await page.waitForTimeout(120);
  const released = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      visible: da.nodeGridVisible,
      origin: da.quadrantOriginLayer,
      overlay: da.nodeGridGroup,
    };
  });
  check('releasing g clears the ring frame and its origin',
    !released.visible && released.origin === null && released.overlay === null,
    JSON.stringify(released));

  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
