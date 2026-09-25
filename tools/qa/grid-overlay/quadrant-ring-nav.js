/*
 * Adaptive quadrant-ring graph-item navigation, real vim-profile keys.
 *
 *   g→r selects four independently spaced quarter-ring systems.
 *   Repeating one direction walks outward through that quadrant one item at
 *   a time; changing direction re-origins before starting the new run.
 */
const {launch, openApp, settled, movedAndSettled, crosshairsOf, afterFrame, overlay, waitForDA, checker} =
  require('../harness');

const check = checker();

async function main() {
  const browser = await launch();
  const page = await openApp(browser, {width: 1400, height: 900});

  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
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
    // Start on where the origin node actually renders, not the fixture's
    // nominal center: nodes auto-size to their labels, so parking on the
    // nominal coordinate captures a quadrant origin a few pixels off every
    // real stop.
    const originNode = da.drawingLayer.getDANodes().find(n => n.id === 'origin');
    const originCenter = da.getNodeCenterInStageCoordinates(originNode);
    da.crosshairsLayer.crosshairs.x = originCenter.x;
    da.crosshairsLayer.crosshairs.y = originCenter.y;
    da.drawingLayer.batchDraw();
  });

  const press = async key => {
    await page.keyboard.press(key);
    await afterFrame(page); await settled(page);
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
    return da.navGrid.graphItemNavigationStrategy;
  });
  check('adaptive quadrant rings are the session default',
    defaultStrategy === 'adaptive-quadrant-rings',
    String(defaultStrategy));

  await page.keyboard.down('g');
  await page.waitForTimeout(120);
  // The rings strategy moved g-r → g-u on 2026-08-30: 'r' is the same finger
  // as the 'g' it is held with.
  await press('u');

  const overlay = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      strategy: da.navGrid.graphItemNavigationStrategy,
      stage: {width: da.stage.width(), height: da.stage.height()},
      origin: da.navGrid.quadrantOriginInStage(),
      origins: da.navGrid.nodeGridGroup?.find('.quadrant-ring-origin').length ?? 0,
      diagonals: da.navGrid.nodeGridGroup?.find('.quadrant-ring-diagonal').length ?? 0,
      boundaries: da.navGrid.nodeGridGroup?.find('.quadrant-ring-boundary').length ?? 0,
      bands: da.navGrid.nodeGridGroup?.find('.quadrant-ring-band').length ?? 0,
      activeBands: da.navGrid.nodeGridGroup?.find('.quadrant-ring-active-band').length ?? 0,
      rectangularBoundaries:
        (da.navGrid.nodeGridGroup?.find('.quadrant-grid-row-boundary').length ?? 0) +
        (da.navGrid.nodeGridGroup?.find('.quadrant-grid-column-boundary').length ?? 0),
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
    return da.navGrid.nodeGridGroup?.find('.quadrant-ring-active-band').length ?? 0;
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
    return da.navGrid.quadrantOriginInStage();
  });
  await press('j');
  const afterTurn = await at();
  const originAfterTurn = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.navGrid.quadrantOriginInStage();
  });
  // The origin re-anchors on the stop you turned at, so compare against where
  // those nodes actually render: they auto-size to their labels, and the
  // fixture's nominal centers are a few pixels out (notably in y).
  const centers = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const center = id => {
      const n = da.drawingLayer.getDANodes().find(n => n.id === id);
      return n ? da.getNodeCenterInStageCoordinates(n) : null;
    };
    return {origin: center('origin'), eastFar: center('east-far')};
  });
  const near = (a, b) => a && b && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
  check('a direction change re-origins, then enters the new quadrant',
    afterTurn === 'turn-south' &&
      near(originBeforeTurn, centers.origin) &&
      near(originAfterTurn, centers.eastFar),
    JSON.stringify({afterTurn, originBeforeTurn, originAfterTurn, centers}));

  await page.keyboard.up('g');
  await page.waitForTimeout(120);
  const released = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      visible: da.navGrid.nodeGridVisible,
      origin: da.navGrid.quadrantOriginLayer,
      overlay: da.navGrid.nodeGridGroup,
    };
  });
  check('releasing g clears the ring frame and its origin',
    !released.visible && released.origin === null && released.overlay === null,
    JSON.stringify(released));

  await browser.close();
  if (check.failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
