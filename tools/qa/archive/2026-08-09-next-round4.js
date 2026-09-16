/* Real-key checks for the two live Next items captured on 2026-08-09. */
const {chromium} = require('@playwright/test');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({viewport: {width: 1600, height: 1000}})).newPage();
  page.on('pageerror', error => console.error('[page error]', error.message));
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});

  const settings = page.locator('details').filter({hasText: 'Settings'}).first();
  await settings.evaluate(element => { element.open = true; });
  const cursor = page.locator('details').filter({hasText: 'Cursor'}).last();
  await cursor.evaluate(element => { element.open = true; });
  const normalSteps = cursor.getByRole('spinbutton', {
    name: 'Normal movement (minor-grid squares):', exact: true,
  });
  await normalSteps.fill('2');
  await normalSteps.evaluate(element => element.blur());

  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      left: km.keyAssignments.movement.left,
      right: km.keyAssignments.movement.right,
    };
  });

  const movementAtScale = async scale => {
    await page.evaluate(scaleValue => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      da.finishTweens();
      da.clearNormalMovementGoal();
      da.drawingLayer.restoreGraph({nodes: [], edges: []});
      da.drawingLayer.position({x: 0, y: 0});
      da.drawingLayer.scale({x: scaleValue, y: scaleValue});
      da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
      da.crosshairsLayer.crosshairs.x = 700;
      da.crosshairsLayer.crosshairs.y = 500;
      da.crosshairsLayer.showCrosshairs();
    }, scale);
    const before = await page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      return {
        logicalX: da.crosshairsInLayerCoords().x,
        screenX: da.crosshairsLayer.crosshairs.x,
        minor: da.drawingLayer.getSubGridSpacing(),
      };
    });
    await page.keyboard.press(keys.right);
    await page.waitForTimeout(180);
    return page.evaluate(beforeState => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      da.finishTweens();
      return {
        minor: da.drawingLayer.getSubGridSpacing(),
        logicalDelta: da.crosshairsInLayerCoords().x - beforeState.logicalX,
        screenDelta: da.crosshairsLayer.crosshairs.x - beforeState.screenX,
      };
    }, before);
  };

  const normalScale = await movementAtScale(1);
  const zoomedOutScale = await movementAtScale(0.25);
  check('Normal movement is configured as two minor-grid squares at 100% zoom',
    Math.abs(normalScale.logicalDelta - 2 * normalScale.minor) < 0.01,
    JSON.stringify(normalScale));
  check('The same square count changes logical distance with the adaptive grid',
    Math.abs(zoomedOutScale.logicalDelta - 2 * zoomedOutScale.minor) < 0.01 &&
      zoomedOutScale.logicalDelta > normalScale.logicalDelta,
    JSON.stringify({normalScale, zoomedOutScale}));

  const resetLabelGraph = async edgeT => page.evaluate(initialT => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const node = (id, x, text) => ({
      id, x, y: 400, text, width: 320, height: 100, fontSize: 14, isSelected: false,
    });
    da.finishTweens();
    da.clearNormalMovementGoal();
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.scale({x: 1, y: 1});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
    da.drawingLayer.restoreGraph({
      nodes: [node('da-left', 150, 'Left endpoint'), node('da-right', 1000, 'Right endpoint')],
      edges: [{
        id: 'da-edge', srcNodeId: 'da-left', destNodeId: 'da-right', isSelected: false,
        labels: [{
          id: 'da-label', x: 0, y: 0, text: 'endpoint-safe label', fontSize: 12,
          isSelected: false, edgeT: initialT, side: 'on',
        }],
      }],
    });
    const label = da.drawingLayer.getDAEdges()[0].labels[0];
    da.crosshairsLayer.crosshairs.x = label.x;
    da.crosshairsLayer.crosshairs.y = label.y;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
  }, edgeT);

  const dragRepeatedly = async direction => {
    await page.keyboard.down('v');
    await page.waitForTimeout(40);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(keys[direction]);
      await page.waitForTimeout(20);
    }
    await page.keyboard.up('v');
    await page.waitForTimeout(80);
    return page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      const edge = da.drawingLayer.getDAEdges()[0];
      const label = edge.labels[0];
      return {
        x: label.x,
        t: label.edgeT,
        width: label.width,
        leftNodeRight: edge.srcNode.group.x() + edge.srcNode.NODE_WIDTH,
        rightNodeLeft: edge.destNode.group.x(),
      };
    });
  };

  await resetLabelGraph(0.5);
  const atLeftBoundary = await dragRepeatedly('left');
  check('Repeated Drag Left stops before the label enters the source node',
    atLeftBoundary.x - atLeftBoundary.width / 2 >= atLeftBoundary.leftNodeRight + 4 - 0.01,
    JSON.stringify(atLeftBoundary));

  await resetLabelGraph(0.5);
  const atRightBoundary = await dragRepeatedly('right');
  check('Repeated Drag Right stops before the label enters the destination node',
    atRightBoundary.x + atRightBoundary.width / 2 <= atRightBoundary.rightNodeLeft - 4 + 0.01,
    JSON.stringify(atRightBoundary));

  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
