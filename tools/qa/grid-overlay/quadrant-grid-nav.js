/*
 * Adaptive quadrant graph-item navigation, real vim-profile keys.
 *
 *   g→o selects a rectangular adaptive grid divided by fixed diagonals.
 *   hjkl remain screen directions. Main-axis travel stays in the current
 *   N/S/E/W region; changing hjkl direction re-origins before moving; n/p
 *   tilt the origin's goal ray south/north.
 */
const {launch, openApp, settled, movedAndSettled, crosshairsOf, afterFrame, overlay: waitForOverlay, waitForDA, checker} =
  require('../harness');

const check = checker();

async function main() {
  const browser = await launch();
  const page = await openApp(browser, {width: 1400, height: 900});

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
    // Start on where the origin node actually renders, not the fixture's
    // nominal centre: nodes auto-size to their labels, so parking on the
    // nominal coordinate captures a quadrant origin a few pixels off every
    // real stop.
    const originNode = da.drawingLayer.getDANodes().find(n => n.id === 'origin');
    const originCentre = da.getNodeCenterInStageCoordinates(originNode);
    da.crosshairsLayer.crosshairs.x = originCentre.x;
    da.crosshairsLayer.crosshairs.y = originCentre.y;
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
    await afterFrame(page); await settled(page);
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

  await page.keyboard.down('g'); await waitForOverlay(page, true);
  await press('o');
  const overlay = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      strategy: da.navGrid.graphItemNavigationStrategy,
      origin: da.navGrid.quadrantOriginInStage(),
      originMarkers: da.navGrid.nodeGridGroup?.find('.quadrant-grid-origin').length ?? 0,
      diagonals: da.navGrid.nodeGridGroup?.find('.quadrant-grid-diagonal-boundary').length ?? 0,
      ghostDiagonals: da.navGrid.nodeGridGroup?.find('.quadrant-grid-ghost-diagonal').length ?? 0,
      activeQuadrants: da.navGrid.nodeGridGroup?.find('.quadrant-grid-active-quadrant').length ?? 0,
      goalRays: da.navGrid.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0,
      rows: da.navGrid.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0,
      columns: da.navGrid.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0,
      rowFills: da.navGrid.nodeGridGroup?.find('.quadrant-grid-row-band').length ?? 0,
      columnFills: da.navGrid.nodeGridGroup?.find('.quadrant-grid-column-band').length ?? 0,
      boundaryOpacities: [
        ...(da.navGrid.nodeGridGroup?.find('.quadrant-grid-row-boundary') ?? []),
        ...(da.navGrid.nodeGridGroup?.find('.quadrant-grid-column-boundary') ?? []),
      ].map(line => line.opacity()),
      fillOpacities: [
        ...(da.navGrid.nodeGridGroup?.find('.quadrant-grid-row-band') ?? []),
        ...(da.navGrid.nodeGridGroup?.find('.quadrant-grid-column-band') ?? []),
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
    window.ng.getComponent(document.querySelector('app-drawing-area')).navGrid.quadrantGoalAngle);
  await press('n');
  const southAngle = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).navGrid.quadrantGoalAngle);
  const rayAfterN = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.navGrid.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0;
  });
  await press('p');
  const northAgainAngle = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).navGrid.quadrantGoalAngle);
  const rayAfterP = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.navGrid.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0;
  });
  check('n tilts the goal ray south and p tilts it north',
    Math.sin(southAngle) > Math.sin(initialAngle) &&
      Math.sin(northAgainAngle) < Math.sin(southAngle) &&
      rayAfterN === 1 && rayAfterP === 1,
    `${initialAngle.toFixed(3)} → ${southAngle.toFixed(3)} → ${northAgainAngle.toFixed(3)}`);
  // Stays: the goal ray's fade is the thing under test, not a guess about scheduling.
  await page.waitForTimeout(1700);
  const fadedRay = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.navGrid.nodeGridGroup?.find('.quadrant-grid-goal-ray').length ?? 0;
  });
  check('the n/p goal ray fades away', fadedRay === 0, `${fadedRay} rays remain`);

  await press('l');
  const first = await at();
  const firstFrames = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const starts = name => da.navGrid.nodeGridGroup?.find(`.${name}`)
      .map(line => line.points().slice(0, 2)) ?? [];
    return {
      ghost: starts('quadrant-grid-ghost-diagonal'),
      activeBoundaries: starts('quadrant-grid-diagonal-boundary'),
      activeQuadrants: da.navGrid.nodeGridGroup?.find('.quadrant-grid-active-quadrant')
        .map(shape => shape.points()) ?? [],
      rows: da.navGrid.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0,
      columns: da.navGrid.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0,
    };
  });
  await press('l');
  const second = await at();
  const secondFrames = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const starts = name => da.navGrid.nodeGridGroup?.find(`.${name}`)
      .map(line => line.points().slice(0, 2)) ?? [];
    return {
      ghost: starts('quadrant-grid-ghost-diagonal'),
      activeBoundaries: starts('quadrant-grid-diagonal-boundary'),
      activeQuadrants: da.navGrid.nodeGridGroup?.find('.quadrant-grid-active-quadrant')
        .map(shape => shape.points()) ?? [],
      rows: da.navGrid.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0,
      columns: da.navGrid.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0,
    };
  });
  check('rightward travel in east skips a north-quadrant column',
    first === 'east-1' && second === 'east-2',
    `${first} → ${second}`);
  const allStartAt = (starts, x, y) => starts.length === 4 &&
    starts.every(([sx, sy]) => Math.abs(sx - x) < 2 && Math.abs(sy - y) < 2);
  const ghostCentres = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const centre = id => {
      const n = da.drawingLayer.getDANodes().find(n => n.id === id);
      return n ? da.getNodeCenterInStageCoordinates(n) : null;
    };
    return {east1: centre('east-1'), east2: centre('east-2')};
  });
  check('only the pronounced ghost diagonals follow the crosshairs',
    allStartAt(firstFrames.ghost, ghostCentres.east1.x, ghostCentres.east1.y) &&
      allStartAt(secondFrames.ghost, ghostCentres.east2.x, ghostCentres.east2.y) &&
      firstFrames.activeBoundaries.length === 0 &&
      secondFrames.activeBoundaries.length === 0,
    JSON.stringify({firstFrames, secondFrames, ghostCentres}));
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

  await page.keyboard.up('g'); await waitForOverlay(page, false);
  await park('origin');
  await page.keyboard.down('g'); await waitForOverlay(page, true);
  await press('h');
  const left1 = await at();
  await press('h');
  const left2 = await at();
  await press('h');
  const left3 = await at();
  const originBeforeTurn = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).navGrid.quadrantOriginInStage());
  await press('j');
  const downAfterTurn = await at();
  const originAfterTurn = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).navGrid.quadrantOriginInStage());
  // Compare against where those nodes actually render, not the fixture's
  // nominal centres — they auto-size to their labels.
  const originCentres = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const centre = id => {
      const n = da.drawingLayer.getDANodes().find(n => n.id === id);
      return n ? da.getNodeCenterInStageCoordinates(n) : null;
    };
    return {origin: centre('origin'), west3: centre('west-3')};
  });
  const nearCentre = (a, b) => a && b && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
  check('h h h j re-origins at the third landing, then moves down',
    left1 === 'west-1' && left2 === 'west-2' && left3 === 'west-3' &&
      downAfterTurn === 'turn-down' &&
      nearCentre(originBeforeTurn, originCentres.origin) &&
      nearCentre(originAfterTurn, originCentres.west3),
    JSON.stringify({left1, left2, left3, downAfterTurn, originBeforeTurn, originAfterTurn, originCentres}));

  const beforePan = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {origin: da.navGrid.quadrantOriginInStage(), crosshairs: {
      x: da.crosshairsLayer.crosshairsX(),
      y: da.crosshairsLayer.crosshairsY(),
    }};
  });
  const afterPan = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.x(da.drawingLayer.x() - 40);
    da.navGrid.redrawNodeGrid();
    return {origin: da.navGrid.quadrantOriginInStage(), crosshairs: {
      x: da.crosshairsLayer.crosshairsX(),
      y: da.crosshairsLayer.crosshairsY(),
    }};
  });
  check('a viewport change resets the origin to the crosshairs',
    Math.abs(beforePan.origin.y - beforePan.crosshairs.y) > 20 &&
      Math.abs(afterPan.origin.x - afterPan.crosshairs.x) < 2 &&
      Math.abs(afterPan.origin.y - afterPan.crosshairs.y) < 2,
    JSON.stringify({beforePan, afterPan}));

  await page.keyboard.up('g'); await waitForOverlay(page, false);
  const releasedOrigin = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).navGrid.quadrantOriginLayer);
  check('releasing g clears the quadrant origin', releasedOrigin === null, JSON.stringify(releasedOrigin));

  await browser.close();
  console.log(check.failures === 0 ? 'ALL CHECKS PASSED' : `${check.failures} CHECK(S) FAILED`);
  process.exit(check.failures === 0 ? 0 : 1);
}

main().catch(error => { console.error(error); process.exit(1); });
