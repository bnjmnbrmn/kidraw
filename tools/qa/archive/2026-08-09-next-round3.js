/* Real-key checks for the three live Next items captured on 2026-08-09. */
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

  const node = (id, x, y, text) => ({
    id, x, y, text, width: 140, height: 60, fontSize: 14, isSelected: false,
  });
  const resetView = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.clearNormalMovementGoal();
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.scale({x: 1, y: 1});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
  });

  // Settings-backed fine / normal / coarse cursor movement.
  await resetView();
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.restoreGraph({nodes: [], edges: []});
    da.crosshairsLayer.crosshairs.x = 800;
    da.crosshairsLayer.crosshairs.y = 500;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
  });
  const settings = page.locator('details').filter({hasText: 'Settings'}).first();
  await settings.evaluate(el => { el.open = true; });
  const cursor = page.locator('details').filter({hasText: 'Cursor'}).last();
  await cursor.evaluate(el => { el.open = true; });
  const setMovement = async (name, grid, value) => {
    const input = cursor.getByRole('spinbutton', {
      name: `${name} movement (${grid}-grid squares):`, exact: true,
    });
    await input.fill(String(value));
    await input.evaluate(element => element.blur());
  };
  await setMovement('Fine', 'minor', 2);
  await setMovement('Normal', 'minor', 8);
  await setMovement('Coarse', 'major', 2);
  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      right: km.keyAssignments.movement.right,
      fine: km.keyAssignments.moveSpeed.smaller,
      coarse: km.keyAssignments.moveSpeed.bigger,
    };
  });
  const resetCrosshairs = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.clearNormalMovementGoal();
    da.crosshairsLayer.crosshairs.x = da.drawingLayer.x() + 800 * da.drawingLayer.scaleX();
    da.crosshairsLayer.crosshairs.y = da.drawingLayer.y() + 500 * da.drawingLayer.scaleY();
  });
  const moveAndMeasure = async modifier => {
    await resetCrosshairs();
    if (modifier) await page.keyboard.down(modifier);
    await page.keyboard.press(keys.right);
    if (modifier) await page.keyboard.up(modifier);
    await page.waitForTimeout(180);
    return page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      da.finishTweens();
      return da.crosshairsInLayerCoords().x - 800;
    });
  };
  const fineDistance = await moveAndMeasure(keys.fine);
  const normalDistance = await moveAndMeasure(null);
  const coarseDistance = await moveAndMeasure(keys.coarse);
  check('Fine movement setting counts minor-grid squares', Math.abs(fineDistance - 20) < 0.01,
    `${fineDistance} drawing units`);
  check('Normal movement setting counts minor-grid squares', Math.abs(normalDistance - 80) < 0.01,
    `${normalDistance} drawing units`);
  check('Coarse movement setting counts major-grid squares', Math.abs(coarseDistance - 200) < 0.01,
    `${coarseDistance} drawing units`);

  // Midpoints use only visible nodes. Grid and midpoint candidates carry
  // distinct dash patterns and explicit + / ½ glyphs.
  await resetView();
  await page.evaluate(nodes => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.restoreGraph({nodes, edges: []});
    const anchor = da.drawingLayer.getDANodes().find(item => item.id === 'da-a');
    const center = da.getNodeCenterInLayerCoordinates(anchor);
    da.crosshairsLayer.crosshairs.x = center.x;
    da.crosshairsLayer.crosshairs.y = center.y;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
  }, [
    node('da-a', 300, 250, 'A'),
    node('da-b', 900, 250, 'B'),
    node('da-c', 300, 700, 'C'),
    node('da-offscreen', 3000, 250, 'Offscreen'),
  ]);
  await page.keyboard.down('a');
  await page.waitForTimeout(180);
  const ghostState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const midpointMarker = da.growGhost.getChildren(node =>
      node.getAttr('ghostSource') === 'midpoint')[0];
    const gridMarker = da.growGhost.getChildren(node =>
      node.getAttr('ghostSource') === 'grid')[0];
    return {
      midpointIds: da.growGhostTargets.filter(target => target.source === 'midpoint')
        .map(target => target.id),
      gridCount: da.growGhostTargets.filter(target => target.source === 'grid').length,
      midpointDash: midpointMarker?.dash() ?? [],
      gridDash: gridMarker?.dash() ?? [],
      midpointGlyphs: da.growGhost.find('.grow-insertion-kind-midpoint').map(item => item.text()),
      gridGlyphs: da.growGhost.find('.grow-insertion-kind-grid').map(item => item.text()),
    };
  });
  check('midpoint ghosts exclude offscreen-node pairs',
    ghostState.midpointIds.length === 1 &&
      ghostState.midpointIds.every(id => !id.includes('offscreen')),
    JSON.stringify(ghostState.midpointIds));
  check('source-grid ghosts remain available', ghostState.gridCount > 0,
    `${ghostState.gridCount} grid ghost(s)`);
  check('grid and midpoint ghosts are visually distinct',
    JSON.stringify(ghostState.midpointDash) !== JSON.stringify(ghostState.gridDash) &&
      ghostState.midpointGlyphs.every(text => text === '½') &&
      ghostState.gridGlyphs.every(text => text === '+'),
    JSON.stringify(ghostState));
  await page.keyboard.up('a');
  await page.waitForTimeout(120);

  const resetLabelGraph = async orientation => {
    await resetView();
    await page.evaluate(({orientation}) => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      const makeNode = (id, x, y, text) => ({
        id, x, y, text, width: 140, height: 60, fontSize: 14, isSelected: false,
      });
      const horizontal = orientation === 'horizontal';
      const nodes = horizontal
        ? [makeNode('da-left', 300, 400, 'Left'), makeNode('da-right', 900, 400, 'Right')]
        : [makeNode('da-top', 700, 200, 'Top'), makeNode('da-bottom', 700, 700, 'Bottom')];
      da.drawingLayer.restoreGraph({
        nodes,
        edges: [{
          id: 'da-edge',
          srcNodeId: horizontal ? 'da-right' : 'da-top',
          destNodeId: horizontal ? 'da-left' : 'da-bottom',
          isSelected: false,
          labels: [{
            id: 'da-label', x: 0, y: 0, text: 'label', fontSize: 12,
            isSelected: false, edgeT: 0.5, side: 'on',
          }],
        }],
      });
      const label = da.drawingLayer.getDAEdges()[0].labels[0];
      da.crosshairsLayer.crosshairs.x = label.x;
      da.crosshairsLayer.crosshairs.y = label.y;
      da.crosshairsLayer.showCrosshairs();
      da.drawingLayer.batchDraw();
    }, {orientation});
  };
  const dragLabelLeft = async () => {
    const before = await page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      const label = da.drawingLayer.getDAEdges()[0].labels[0];
      return {x: label.x, y: label.y, t: label.edgeT, side: label.side};
    });
    await page.keyboard.down('v');
    await page.waitForTimeout(40);
    await page.keyboard.press(keys.right === 'l' ? 'h' : 'j');
    await page.waitForTimeout(80);
    await page.keyboard.up('v');
    return page.evaluate(before => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      const label = da.drawingLayer.getDAEdges()[0].labels[0];
      return {before, after: {x: label.x, y: label.y, t: label.edgeT, side: label.side}};
    }, before);
  };

  await resetLabelGraph('horizontal');
  const reversed = await dragLabelLeft();
  check('Drag Left moves left on a reversed horizontal edge',
    reversed.after.x < reversed.before.x,
    JSON.stringify(reversed));

  await resetLabelGraph('vertical');
  const vertical = await dragLabelLeft();
  check('Drag Left uses the left side of a vertical edge',
    vertical.after.x < vertical.before.x && vertical.after.side === 'below' &&
      Math.abs(vertical.after.t - vertical.before.t) < 1e-9,
    JSON.stringify(vertical));

  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
