/*
 * Adaptive quadrant graph-item navigation, real vim-profile keys.
 *
 *   g→o selects a rectangular adaptive grid divided by fixed diagonals.
 *   hjkl remain screen directions. Main-axis travel stays in the current
 *   N/S/E/W region; n/p tilt the origin's goal ray south/north.
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
    const mk = (id, cx, cy) => ({
      id, x: cx - 30, y: cy - 18, text: id,
      width: 60, height: 36, fontSize: 12, isSelected: false,
    });
    const nodes = [
      mk('origin', 700, 200),
      mk('east-1', 800, 200),
      // This is the next Cartesian column but belongs to north. A rightward
      // step from east-1 must skip it.
      mk('north-decoy', 860, 20),
      mk('east-2', 940, 220),
      mk('east-up', 930, 120),
      mk('south', 700, 360),
      mk('west', 540, 200),
    ];
    da.drawingLayer.restoreGraph({nodes, edges: []});
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.scale({x: 1, y: 1});
    da.crosshairsLayer.crosshairs.x = 700;
    da.crosshairsLayer.crosshairs.y = 200;
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
    return {
      strategy: da.graphItemNavigationStrategy,
      origin: da.quadrantOriginInStage(),
      originMarkers: da.nodeGridGroup?.find('.quadrant-grid-origin').length ?? 0,
      diagonals: da.nodeGridGroup?.find('.quadrant-grid-diagonal-boundary').length ?? 0,
      goalRays: da.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0,
      rows: da.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0,
      columns: da.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0,
      rowBoundaries: da.nodeGridGroup?.find('.quadrant-grid-row-boundary').map(line => line.points()) ?? [],
      columnBoundaries: da.nodeGridGroup?.find('.quadrant-grid-column-boundary').map(line => line.points()) ?? [],
      stops: da.navStops('labels').map(stop => ({id: stop.id, x: stop.cx, y: stop.cy})),
    };
  });
  check('g→o selects a rectangular quadrant grid',
    overlay.strategy === 'adaptive-quadrant-grid' && overlay.originMarkers === 1 &&
      overlay.diagonals === 4 && overlay.goalRays === 1 &&
      overlay.rows >= 1 && overlay.columns >= 1,
    JSON.stringify(overlay));

  const initialAngle = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantGoalAngle);
  await press('n');
  const southAngle = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantGoalAngle);
  await press('p');
  const northAgainAngle = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantGoalAngle);
  check('n tilts the goal ray south and p tilts it north',
    Math.sin(southAngle) > Math.sin(initialAngle) &&
      Math.sin(northAgainAngle) < Math.sin(southAngle),
    `${initialAngle.toFixed(3)} → ${southAngle.toFixed(3)} → ${northAgainAngle.toFixed(3)}`);

  await press('l');
  const first = await at();
  await press('l');
  const second = await at();
  check('rightward travel in east skips a north-quadrant column',
    first === 'east-1' && second === 'east-2',
    `${first} → ${second}`);

  await press('k');
  const up = await at();
  check('hjkl otherwise remain ordinary screen-direction grid movement',
    up === 'east-up', up);

  await press('h');
  const inward = await at();
  await press('h');
  const originAgain = await at();
  await press('h');
  const crossed = await at();
  check('the origin is a gateway between opposite quadrants',
    inward === 'east-1' && originAgain === 'origin' && crossed === 'west',
    `${inward} → ${originAgain} → ${crossed}`);

  const beforePan = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {origin: da.quadrantOriginInStage(), crosshairs: {
      x: da.crosshairsLayer.crosshairsX(),
      y: da.crosshairsLayer.crosshairsY(),
    }};
  });
  const afterPan = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.x(da.drawingLayer.x() - 40);
    da.redrawNodeGrid();
    return {origin: da.quadrantOriginInStage(), crosshairs: {
      x: da.crosshairsLayer.crosshairsX(),
      y: da.crosshairsLayer.crosshairsY(),
    }};
  });
  check('a viewport change resets the origin to the crosshairs',
    Math.abs(beforePan.origin.x - beforePan.crosshairs.x) > 20 &&
      Math.abs(afterPan.origin.x - afterPan.crosshairs.x) < 2 &&
      Math.abs(afterPan.origin.y - afterPan.crosshairs.y) < 2,
    JSON.stringify({beforePan, afterPan}));

  await page.keyboard.up('g'); await page.waitForTimeout(120);
  const releasedOrigin = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantOriginLayer);
  check('releasing g clears the quadrant origin', releasedOrigin === null, JSON.stringify(releasedOrigin));

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => { console.error(error); process.exit(1); });
