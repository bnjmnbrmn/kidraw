/* Browser repros for the second live Next batch captured on 2026-08-08. */
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
  const context = await browser.newContext({viewport: {width: 1500, height: 900}});
  const page = await context.newPage();
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle'});
  await page.waitForSelector('#mainDrawingArea canvas');
  await page.evaluate(() => {
    const select = document.querySelector('select.sample-graph-select');
    select.value = 'next-working';
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(200);

  const recovered = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const nodes = da.drawingLayer.getDANodes();
    const next = nodes.find(node => node.id === 'da-48');
    const nextItems = da.drawingLayer.getDAEdges()
      .filter(edge => edge.srcNode === next)
      .map(edge => edge.destNode.label.text())
      .sort();
    return {nodes: nodes.length, edges: da.drawingLayer.getDAEdges().length, nextItems};
  });
  check('the current recovered draft is the 16-node / 15-edge graph',
    recovered.nodes === 16 && recovered.edges === 15,
    `${recovered.nodes} nodes / ${recovered.edges} edges`);
  check('the recovered Next node contains all three current items',
    recovered.nextItems.length === 3 &&
      recovered.nextItems.some(label => label.startsWith("Can't add waypoints to self-loop")) &&
      recovered.nextItems.some(label => label.startsWith('When selecting the endpoint')) &&
      recovered.nextItems.includes("Adding self loops doesn't work"),
    JSON.stringify(recovered.nextItems));

  const putCrosshairsOn = id => page.evaluate(nodeId => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    const node = da.drawingLayer.getDANodes().find(candidate => candidate.id === nodeId);
    const scale = da.drawingLayer.scaleX();
    da.crosshairsLayer.crosshairs.x = da.drawingLayer.x() +
      (node.group.x() + node.NODE_WIDTH / 2) * scale;
    da.crosshairsLayer.crosshairs.y = da.drawingLayer.y() +
      (node.group.y() + node.NODE_HEIGHT / 2) * scale;
    da.crosshairsLayer.showCrosshairs();
    da.refreshCrosshairHoverHighlight();
  }, id);

  // Compare endpoint targeting against Move by Node's node-only tier on the
  // exact same graph, from the exact same origin and key sequence.
  const keys = ['h', 'h', 'j'];
  await putCrosshairsOn('da-48');
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.setGraphItemNavigationStrategy('adaptive-quadrant-rings');
    da.showNodeGrid('nodes');
  });
  const moveByNodeTargets = [];
  const directions = ['left', 'left', 'down'];
  for (const direction of directions) {
    await page.evaluate(nextDirection => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      da.snapToNodeInDirection(nextDirection, 'nodes');
    }, direction);
    await page.waitForTimeout(140);
    moveByNodeTargets.push(await page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      da.finishTweens();
      const scale = da.drawingLayer.scaleX();
      const cx = da.crosshairsLayer.crosshairs.x;
      const cy = da.crosshairsLayer.crosshairs.y;
      return da.drawingLayer.getDANodes().find(node =>
        Math.abs(da.drawingLayer.x() +
          (node.group.x() + node.NODE_WIDTH / 2) * scale - cx) < 4 &&
        Math.abs(da.drawingLayer.y() +
          (node.group.y() + node.NODE_HEIGHT / 2) * scale - cy) < 4)?.id ?? null;
    }));
  }
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.hideNodeGrid();
    const select = document.querySelector('select.sample-graph-select');
    select.value = 'next-working';
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(160);

  await putCrosshairsOn('da-48');
  await page.keyboard.down('a');
  const growTargets = [];
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
    growTargets.push(await page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      return da.growTarget?.id ?? null;
    }));
  }
  await page.keyboard.press('Escape');
  await page.keyboard.up('a');
  check('edge endpoint targeting follows Move by Node quadrant rings',
    JSON.stringify(growTargets) === JSON.stringify(moveByNodeTargets) &&
      growTargets.every(Boolean),
    `move=${JSON.stringify(moveByNodeTargets)}, add=${JSON.stringify(growTargets)}`);

  // Edge selection is sticky after its parent hold is released, so the menu
  // can be traversed as a normal sequence: hold a, tap s, release a, tap l.
  await putCrosshairsOn('da-115');
  const loopCount = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDAEdges()
      .filter(edge => edge.srcNode.id === 'da-115' && edge.destNode.id === 'da-115').length;
  });
  const beforeLoops = await loopCount();
  await page.keyboard.down('a');
  await page.keyboard.press('s');
  await page.keyboard.up('a');
  const sticky = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {active: da.growActive, edge: da.growEdgeMenuActive, mode: km.keyMenu.currentMode.name};
  });
  await page.keyboard.press('l');
  await page.waitForTimeout(100);
  const afterLoops = await loopCount();
  check('Add > Edge remains open after releasing Add',
    sticky.active && sticky.edge && sticky.mode === 'surfaceGrowEdge',
    JSON.stringify(sticky));
  check('the sequential Add > Edge > Self Loop gesture creates the loop',
    afterLoops === beforeLoops + 1, `${beforeLoops} -> ${afterLoops}`);

  // Insert on the middle segment of the freshly-created default loop, then
  // move the selected waypoint. Both the logical and Konva paths must move.
  const waypointResult = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const loop = da.drawingLayer.getDAEdges()
      .find(edge => edge.srcNode.id === 'da-115' && edge.destNode.id === 'da-115');
    const before = loop.getPathPoints().map(point => ({...point}));
    const insertion = {
      x: (before[1].x + before[2].x) / 2,
      y: (before[1].y + before[2].y) / 2,
    };
    const scale = da.drawingLayer.scaleX();
    da.crosshairsLayer.crosshairs.x = da.drawingLayer.x() + insertion.x * scale;
    da.crosshairsLayer.crosshairs.y = da.drawingLayer.y() + insertion.y * scale;
    da.insertWaypointAtCrosshairs();
    const waypoint = loop.waypoints.find(candidate => candidate.isSelected);
    const afterInsert = loop.getPathPoints().map(point => ({...point}));
    loop.moveWaypoint(waypoint, 65, -40);
    const afterMove = loop.getPathPoints().map(point => ({...point}));
    return {
      waypoint: {x: waypoint.x, y: waypoint.y},
      before,
      afterInsert,
      afterMove,
      line: loop.line.points(),
      controlPoints: loop.controlPoints.map(point => ({x: point.x, y: point.y})),
    };
  });
  const logicalChanged = JSON.stringify(waypointResult.afterMove) !==
    JSON.stringify(waypointResult.afterInsert);
  const painted = waypointResult.line.some((value, index) =>
    index % 2 === 0 && value === waypointResult.waypoint.x &&
      waypointResult.line[index + 1] === waypointResult.waypoint.y);
  const stored = waypointResult.controlPoints.some(point =>
    point.x === waypointResult.waypoint.x && point.y === waypointResult.waypoint.y);
  check('inserting a self-loop waypoint preserves the visible loop route',
    waypointResult.afterInsert.length === waypointResult.before.length + 1 &&
      waypointResult.afterInsert[0].x === waypointResult.before[0].x &&
      waypointResult.afterInsert.at(-1).y === waypointResult.before.at(-1).y,
    `${waypointResult.before.length} -> ${waypointResult.afterInsert.length} path points`);
  check('moving that waypoint reshapes the logical, painted, and stored loop',
    logicalChanged && painted && stored,
    `logical=${logicalChanged}, painted=${painted}, stored=${stored}`);

  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
