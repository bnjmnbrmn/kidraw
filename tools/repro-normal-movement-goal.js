/*
 * Verify the refined ordinary-movement behavior:
 *   1. a node crossed by the goal line stops at its boundary, not its center;
 *   2. a genuinely nearby off-line node still snaps + returns;
 *   3. normal held-key repeat pauses before repeating;
 *   4. node/waypoint/label/edge hover traces use selection hit priority;
 *   5. the dashed goal line and grid time out together.
 */
const {chromium} = require('@playwright/test');

function check(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1400, height: 900}});
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle'});
  await page.waitForSelector('#mainDrawingArea canvas');

  await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    c.drawingLayer.restoreGraph({
      nodes: [{
        id: 'da-1', x: 320, y: 270, text: 'cross me',
        width: 120, height: 120, fontSize: 14, isSelected: false,
      }],
      edges: [],
    });
    c.drawingLayer.position({x: 0, y: 0});
    c.drawingLayer.scale({x: 1, y: 1});
    c.crosshairsLayer.crosshairs.x = 300;
    c.crosshairsLayer.crosshairs.y = 300;
  });

  const state = () => page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const node = c.drawingLayer.getDANodes()[0];
    return {
      x: c.crosshairsLayer.crosshairs.x,
      y: c.crosshairsLayer.crosshairs.y,
      nodeCenter: node ? {
        x: node.group.x() + node.NODE_WIDTH / 2,
        y: node.group.y() + node.NODE_HEIGHT / 2,
      } : null,
      goalLine: c.drawingLayer.find('.normal-movement-goal-line').length,
      grid: c.drawingLayer.gridVisible,
    };
  });
  const near = (a, b) => Math.abs(a - b) <= 3;

  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  const snapped = await state();
  check('crossing node stops at its encountered boundary, not its center',
    near(snapped.x, 320) && near(snapped.y, 300) &&
      !near(snapped.x, snapped.nodeCenter.x),
    JSON.stringify(snapped));
  check('goal line appears with the movement grid',
    snapped.goalLine === 1 && snapped.grid);

  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  const passedThrough = await state();
  check('next l continues through the node on the goal line',
    near(passedThrough.x, 370) && near(passedThrough.y, 300),
    JSON.stringify(passedThrough));

  // A line that narrowly misses the node still gets the magnetic center +
  // perpendicular return behavior.
  await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    c.finishTweens();
    c.drawingLayer.restoreGraph({
      nodes: [{
        id: 'da-2', x: 280, y: 220, text: 'near me',
        width: 120, height: 120, fontSize: 14, isSelected: false,
      }],
      edges: [],
    });
    c.crosshairsLayer.crosshairs.x = 300;
    c.crosshairsLayer.crosshairs.y = 200;
    c.clearNormalMovementGoal();
  });
  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  let nearby = await state();
  check('nearby off-line node still snaps to its center',
    near(nearby.x, nearby.nodeCenter.x) && near(nearby.y, nearby.nodeCenter.y),
    JSON.stringify(nearby));
  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  nearby = await state();
  check('off-line snap still returns perpendicularly to the goal',
    near(nearby.x, nearby.nodeCenter.x) && near(nearby.y, 200),
    JSON.stringify(nearby));

  // The root movement menu now fires immediately, waits 300 ms, then repeats
  // every 200 ms. At 180 ms there must still be exactly one movement.
  await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    c.finishTweens();
    c.drawingLayer.restoreGraph({nodes: [], edges: []});
    c.crosshairsLayer.crosshairs.x = 300;
    c.crosshairsLayer.crosshairs.y = 500;
    c.clearNormalMovementGoal();
  });
  await page.keyboard.down('l');
  await page.waitForTimeout(180);
  let repeatedX = (await state()).x;
  check('held movement pauses before its first repeat', near(repeatedX, 350), `x=${repeatedX}`);
  await page.waitForTimeout(250);
  repeatedX = (await state()).x;
  await page.keyboard.up('l');
  check('held movement repeats at the restrained cadence',
    repeatedX >= 385 && repeatedX <= 405, `x=${repeatedX}`);

  // One graph containing all target kinds. A waypoint lies directly on its
  // edge; it must win that ambiguity.
  const hoverKinds = await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    c.finishTweens();
    const dl = c.drawingLayer;
    dl.restoreGraph({
      nodes: [
        {id: 'da-10', x: 100, y: 100, text: 'A', width: 120, height: 120, fontSize: 14, isSelected: false},
        {id: 'da-11', x: 600, y: 100, text: 'B', width: 120, height: 120, fontSize: 14, isSelected: false},
      ],
      edges: [{
        id: 'da-12', srcNodeId: 'da-10', destNodeId: 'da-11', isSelected: false,
        controlPoints: [{x: 410, y: 240, waypointId: 'da-13'}],
        labels: [{
          id: 'da-14', x: 0, y: 0, text: 'edge label', fontSize: 12,
          isSelected: false, edgeT: 0.85, side: 'above',
        }],
      }],
    });
    dl.position({x: 0, y: 0});
    dl.scale({x: 1, y: 1});
    const xh = c.crosshairsLayer.crosshairs;
    const place = (p) => {
      xh.x = p.x;
      xh.y = p.y;
      c.refreshCrosshairHoverHighlight();
      const trace = dl.findOne('.crosshair-hover-highlight');
      return trace ? {
        kind: trace.getAttr('targetKind'),
        id: trace.getAttr('targetId'),
        selected: dl.getDANodes().some(n => n.isSelected) ||
          dl.getDAEdges().some(e => e.isSelected ||
            e.waypoints.some(w => w.isSelected) ||
            e.labels.some(l => l.isSelected)),
      } : null;
    };
    const edge = dl.getDAEdges()[0];
    const waypoint = edge.waypoints[0];
    const label = edge.labels[0];
    const path = edge.getPathPoints();
    const edgePoint = {
      x: (path[0].x + path[1].x) / 2,
      y: (path[0].y + path[1].y) / 2,
    };
    return {
      node: place({x: 160, y: 160}),
      edge: place(edgePoint),
      waypoint: place({x: waypoint.x, y: waypoint.y}),
      label: place({x: label.x, y: label.y}),
    };
  });
  for (const kind of ['node', 'edge', 'waypoint', 'label']) {
    check(`crosshair hover distinctly highlights the ${kind}`,
      hoverKinds[kind]?.kind === kind && hoverKinds[kind]?.selected === false,
      JSON.stringify(hoverKinds[kind]));
  }

  await page.waitForTimeout(5200);
  const faded = await state();
  check('goal line and grid time out together',
    faded.goalLine === 0 && !faded.grid, JSON.stringify(faded));

  await browser.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
