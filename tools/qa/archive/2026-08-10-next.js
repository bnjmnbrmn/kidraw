/* Real-key checks for the four live Next items captured on 2026-08-10. */
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

  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      up: km.keyAssignments.movement.up,
      left: km.keyAssignments.movement.left,
      down: km.keyAssignments.movement.down,
      right: km.keyAssignments.movement.right,
      coarse: km.keyAssignments.moveSpeed.bigger,
      select: km.keyAssignments.root.selectDragSubmenu,
      add: km.keyAssignments.root.editSubmenu,
      link: km.keyAssignments.root.go,
    };
  });
  const node = (id, x, y, text, width = 140, height = 60) => ({
    id, x, y, text, width, height, fontSize: 14, isSelected: false,
  });
  const resetView = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.clearNormalMovementGoal();
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.scale({x: 1, y: 1});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
  });

  // A vertical drag from above must stop on the edge before continuing below.
  await resetView();
  await page.evaluate(nodes => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.restoreGraph({
      nodes,
      edges: [{
        id: 'da-edge', srcNodeId: 'da-left', destNodeId: 'da-right', isSelected: false,
        labels: [{
          id: 'da-label', x: 0, y: 0, text: 'return me', fontSize: 12,
          isSelected: false, edgeT: 0.5, side: 'above',
        }],
      }],
    });
    const label = da.drawingLayer.getDAEdges()[0].labels[0];
    da.crosshairsLayer.crosshairs.x = label.x;
    da.crosshairsLayer.crosshairs.y = label.y;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
  }, [node('da-left', 300, 300, 'Left'), node('da-right', 1000, 650, 'Right')]);
  await page.keyboard.down(keys.select);
  await page.waitForTimeout(40);
  await page.keyboard.press(keys.down);
  await page.waitForTimeout(80);
  await page.keyboard.up(keys.select);
  const onEdge = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const edge = da.drawingLayer.getDAEdges()[0];
    const label = edge.labels[0];
    return {side: label.side, labelX: label.x, labelY: label.y, t: label.edgeT};
  });
  check('Drag Down returns an above-edge label onto a diagonal edge before crossing it',
    onEdge.side === 'on' && Math.abs(onEdge.t - 0.5) < 0.01,
    JSON.stringify(onEdge));

  // Coarse movement may snap along the requested axis, but never the other.
  const settings = page.locator('details').filter({hasText: 'Settings'}).first();
  await settings.evaluate(element => { element.open = true; });
  const cursor = page.locator('details').filter({hasText: 'Cursor'}).last();
  await cursor.evaluate(element => { element.open = true; });
  const coarseSteps = cursor.getByRole('spinbutton', {
    name: 'Coarse movement (major-grid squares):', exact: true,
  });
  await coarseSteps.fill('1');
  await coarseSteps.evaluate(element => element.blur());
  await resetView();
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.restoreGraph({nodes: [], edges: []});
    da.crosshairsLayer.crosshairs.x = 723;
    da.crosshairsLayer.crosshairs.y = 437;
    da.crosshairsLayer.showCrosshairs();
  });
  const crosshairs = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    return da.crosshairsInLayerCoords();
  });
  const beforeCoarse = await crosshairs();
  await page.keyboard.down(keys.coarse);
  await page.keyboard.press(keys.right);
  await page.keyboard.up(keys.coarse);
  await page.waitForTimeout(180);
  const afterHorizontal = await crosshairs();
  check('Coarse horizontal movement preserves the exact vertical coordinate',
    afterHorizontal.x > beforeCoarse.x && Math.abs(afterHorizontal.y - beforeCoarse.y) < 0.01,
    JSON.stringify({beforeCoarse, afterHorizontal}));
  await page.keyboard.down(keys.coarse);
  await page.keyboard.press(keys.down);
  await page.keyboard.up(keys.coarse);
  await page.waitForTimeout(180);
  const afterVertical = await crosshairs();
  check('Coarse vertical movement preserves the exact horizontal coordinate',
    afterVertical.y > afterHorizontal.y && Math.abs(afterVertical.x - afterHorizontal.x) < 0.01,
    JSON.stringify({afterHorizontal, afterVertical}));

  // Midpoint ghosts are a star centered on the node under the crosshairs.
  await resetView();
  await page.evaluate(nodes => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.restoreGraph({nodes, edges: []});
    const anchor = da.drawingLayer.getDANodes().find(item => item.id === 'da-anchor');
    const center = da.getNodeCenterInLayerCoordinates(anchor);
    da.crosshairsLayer.crosshairs.x = center.x;
    da.crosshairsLayer.crosshairs.y = center.y;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
  }, [
    node('da-anchor', 300, 250, 'Anchor'),
    node('da-b', 900, 250, 'B'),
    node('da-c', 600, 500, 'C'),
  ]);
  await page.keyboard.down(keys.add);
  await page.waitForTimeout(180);
  const midpointIds = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.growGhostTargets.filter(target => target.source === 'midpoint')
      .map(target => target.id);
  });
  check('Midpoint ghosts only join the crosshairs node to visible peers',
    midpointIds.length === 2 && midpointIds.every(id => id.includes('da-anchor')) &&
      !midpointIds.some(id => id.includes('da-b:da-c')),
    JSON.stringify(midpointIds));
  await page.keyboard.press('Escape');
  await page.keyboard.up(keys.add);

  // Link-nav release clears its preview without accepting it as movement.
  await resetView();
  await page.evaluate(nodes => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.restoreGraph({
      nodes,
      edges: [{
        id: 'da-link', srcNodeId: 'da-source', destNodeId: 'da-dest',
        isSelected: false, labels: [],
      }],
    });
    const source = da.drawingLayer.getDANodes().find(item => item.id === 'da-source');
    const center = da.getNodeCenterInLayerCoordinates(source);
    da.crosshairsLayer.crosshairs.x = center.x;
    da.crosshairsLayer.crosshairs.y = center.y;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
  }, [node('da-source', 400, 350, 'Source'), node('da-dest', 1000, 350, 'Dest')]);
  await page.keyboard.down(keys.link);
  await page.waitForTimeout(150);
  const beforeRelease = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      crosshairs: da.crosshairsInLayerCoords(),
      source: da.linkNavSource?.id ?? null,
      focus: da.graphNavEdge?.id ?? null,
    };
  });
  await page.keyboard.up(keys.link);
  await page.waitForTimeout(100);
  const afterRelease = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      crosshairs: da.crosshairsInLayerCoords(),
      source: da.linkNavSource?.id ?? null,
      focus: da.graphNavEdge?.id ?? null,
      landed: da.graphNavLastNode?.id ?? null,
    };
  });
  check('Releasing Move by Link exits without traversing its focused edge',
    beforeRelease.source === 'da-source' && beforeRelease.focus === 'da-link' &&
      afterRelease.source === null && afterRelease.focus === null &&
      afterRelease.landed === 'da-source' &&
      Math.abs(afterRelease.crosshairs.x - beforeRelease.crosshairs.x) < 0.01 &&
      Math.abs(afterRelease.crosshairs.y - beforeRelease.crosshairs.y) < 0.01,
    JSON.stringify({beforeRelease, afterRelease}));

  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
