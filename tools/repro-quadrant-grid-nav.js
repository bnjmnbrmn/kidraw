/*
 * Adaptive quadrant graph-item navigation, real vim-profile keys.
 *
 *   g→o selects a rectangular adaptive grid divided by fixed diagonals.
 *   hjkl remain screen directions. Main-axis travel stays in the current
 *   N/S/E/W region; changing hjkl direction re-origins before moving; n/p
 *   tilt the origin's goal ray south/north.
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
      mk('west-1', 620, 200),
      mk('west-2', 540, 200),
      mk('west-3', 460, 200),
      // Keep this far enough from the viewport margin that the j step does
      // not also trigger the separate automatic-pan re-origining rule.
      mk('turn-down', 460, 300),
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
  const park = async id => page.evaluate(nodeId => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(tween => tween.finish()); da.tweens = [];
    const node = da.drawingLayer.getDANodes().find(candidate => candidate.id === nodeId);
    const center = da.getNodeCenterInStageCoordinates(node);
    da.crosshairsLayer.crosshairs.x = center.x;
    da.crosshairsLayer.crosshairs.y = center.y;
    da.crosshairsLayer.batchDraw();
  }, id);

  await page.keyboard.down('g'); await page.waitForTimeout(120);
  await press('o');
  const overlay = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      strategy: da.graphItemNavigationStrategy,
      origin: da.quadrantOriginInStage(),
      originMarkers: da.nodeGridGroup?.find('.quadrant-grid-origin').length ?? 0,
      diagonals: da.nodeGridGroup?.find('.quadrant-grid-diagonal-boundary').length ?? 0,
      ghostDiagonals: da.nodeGridGroup?.find('.quadrant-grid-ghost-diagonal').length ?? 0,
      activeQuadrants: da.nodeGridGroup?.find('.quadrant-grid-active-quadrant').length ?? 0,
      goalRays: da.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0,
      rows: da.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0,
      columns: da.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0,
      rowFills: da.nodeGridGroup?.find('.quadrant-grid-row-band').length ?? 0,
      columnFills: da.nodeGridGroup?.find('.quadrant-grid-column-band').length ?? 0,
      boundaryOpacities: [
        ...(da.nodeGridGroup?.find('.quadrant-grid-row-boundary') ?? []),
        ...(da.nodeGridGroup?.find('.quadrant-grid-column-boundary') ?? []),
      ].map(line => line.opacity()),
      fillOpacities: [
        ...(da.nodeGridGroup?.find('.quadrant-grid-row-band') ?? []),
        ...(da.nodeGridGroup?.find('.quadrant-grid-column-band') ?? []),
      ].map(fill => fill.opacity()),
      stops: da.navStops('labels').map(stop => ({id: stop.id, x: stop.cx, y: stop.cy})),
    };
  });
  check('g→o shows a deliberately faint rectangular movement grid',
    overlay.strategy === 'adaptive-quadrant-grid' && overlay.originMarkers === 1 &&
      overlay.diagonals === 0 && overlay.goalRays === 0 &&
      overlay.ghostDiagonals === 4 && overlay.activeQuadrants === 0 &&
      overlay.rows >= 1 && overlay.columns >= 1 &&
      overlay.rowFills >= 1 && overlay.columnFills >= 1 &&
      overlay.boundaryOpacities.every(opacity => opacity <= 0.1) &&
      overlay.fillOpacities.every(opacity => opacity <= 0.012),
    JSON.stringify(overlay));

  const initialAngle = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantGoalAngle);
  await press('n');
  const southAngle = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantGoalAngle);
  const rayAfterN = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0;
  });
  await press('p');
  const northAgainAngle = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantGoalAngle);
  const rayAfterP = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0;
  });
  check('n tilts the goal ray south and p tilts it north',
    Math.sin(southAngle) > Math.sin(initialAngle) &&
      Math.sin(northAgainAngle) < Math.sin(southAngle) &&
      rayAfterN === 1 && rayAfterP === 1,
    `${initialAngle.toFixed(3)} → ${southAngle.toFixed(3)} → ${northAgainAngle.toFixed(3)}`);
  await page.waitForTimeout(1700);
  const fadedRay = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0;
  });
  check('the n/p goal ray fades away', fadedRay === 0, `${fadedRay} rays remain`);

  await press('l');
  const first = await at();
  const firstFrames = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const starts = name => da.nodeGridGroup?.find(`.${name}`)
      .map(line => line.points().slice(0, 2)) ?? [];
    return {
      ghost: starts('quadrant-grid-ghost-diagonal'),
      activeBoundaries: starts('quadrant-grid-diagonal-boundary'),
      activeQuadrants: da.nodeGridGroup?.find('.quadrant-grid-active-quadrant')
        .map(shape => shape.points()) ?? [],
      rows: da.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0,
      columns: da.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0,
    };
  });
  await press('l');
  const second = await at();
  const secondFrames = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const starts = name => da.nodeGridGroup?.find(`.${name}`)
      .map(line => line.points().slice(0, 2)) ?? [];
    return {
      ghost: starts('quadrant-grid-ghost-diagonal'),
      activeBoundaries: starts('quadrant-grid-diagonal-boundary'),
      activeQuadrants: da.nodeGridGroup?.find('.quadrant-grid-active-quadrant')
        .map(shape => shape.points()) ?? [],
      rows: da.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0,
      columns: da.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0,
    };
  });
  check('rightward travel in east skips a north-quadrant column',
    first === 'east-1' && second === 'east-2',
    `${first} → ${second}`);
  const allStartAt = (starts, x, y) => starts.length === 4 &&
    starts.every(([sx, sy]) => Math.abs(sx - x) < 2 && Math.abs(sy - y) < 2);
  check('only the pronounced ghost diagonals follow the crosshairs',
    allStartAt(firstFrames.ghost, 800, 200) &&
      allStartAt(secondFrames.ghost, 940, 220) &&
      firstFrames.activeBoundaries.length === 0 &&
      secondFrames.activeBoundaries.length === 0,
    JSON.stringify({firstFrames, secondFrames}));
  check('the active quadrant wash remains above the faint movement grid',
    firstFrames.activeQuadrants.length === 1 &&
      secondFrames.activeQuadrants.length === 1 &&
      firstFrames.activeQuadrants[0][2] > firstFrames.activeQuadrants[0][0] &&
      firstFrames.activeQuadrants[0][4] > firstFrames.activeQuadrants[0][0] &&
      secondFrames.activeQuadrants[0][2] > secondFrames.activeQuadrants[0][0] &&
      secondFrames.activeQuadrants[0][4] > secondFrames.activeQuadrants[0][0] &&
      firstFrames.rows >= 1 && firstFrames.columns >= 1 &&
      secondFrames.rows >= 1 && secondFrames.columns >= 1,
    JSON.stringify({firstFrames, secondFrames}));

  await press('k');
  const up = await at();
  check('hjkl otherwise remain ordinary screen-direction grid movement',
    up === 'east-up', up);

  await press('h');
  const inward = await at();
  await press('h');
  const farther = await at();
  check('a new horizontal run uses the turn point as its origin',
    inward === 'east-1' && farther === 'origin',
    `${inward} → ${farther}`);

  await page.keyboard.up('g'); await page.waitForTimeout(120);
  await park('origin');
  await page.keyboard.down('g'); await page.waitForTimeout(120);
  await press('h');
  const left1 = await at();
  await press('h');
  const left2 = await at();
  await press('h');
  const left3 = await at();
  const originBeforeTurn = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantOriginInStage());
  await press('j');
  const downAfterTurn = await at();
  const originAfterTurn = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).quadrantOriginInStage());
  check('h h h j re-origins at the third landing, then moves down',
    left1 === 'west-1' && left2 === 'west-2' && left3 === 'west-3' &&
      downAfterTurn === 'turn-down' &&
      Math.abs(originBeforeTurn.x - 700) < 2 &&
      Math.abs(originBeforeTurn.y - 200) < 2 &&
      Math.abs(originAfterTurn.x - 460) < 2 &&
      Math.abs(originAfterTurn.y - 200) < 2,
    JSON.stringify({left1, left2, left3, downAfterTurn, originBeforeTurn, originAfterTurn}));

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
    Math.abs(beforePan.origin.y - beforePan.crosshairs.y) > 20 &&
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
