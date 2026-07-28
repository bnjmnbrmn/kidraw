/*
 * Verify ordinary vim movement's snap/return goal-line behavior:
 *   1. `l` snaps from the horizontal goal line to a nearby node center.
 *   2. the next `l` returns perpendicularly to that node's projection.
 *   3. the dashed goal line appears with the grid and both time out together.
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
        id: 'da-1', x: 270, y: 270, text: 'snap me',
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
      nodeCenter: {
        x: node.group.x() + node.NODE_WIDTH / 2,
        y: node.group.y() + node.NODE_HEIGHT / 2,
      },
      goalLine: c.drawingLayer.find('.normal-movement-goal-line').length,
      grid: c.drawingLayer.gridVisible,
    };
  });
  const near = (a, b) => Math.abs(a - b) <= 3;

  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  const snapped = await state();
  check('first l snaps to the nearby node center',
    near(snapped.x, snapped.nodeCenter.x) && near(snapped.y, snapped.nodeCenter.y),
    JSON.stringify(snapped));
  check('goal line appears with the movement grid',
    snapped.goalLine === 1 && snapped.grid);

  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  const returned = await state();
  check('next l returns perpendicularly to the goal line',
    near(returned.x, snapped.nodeCenter.x) && near(returned.y, 300),
    JSON.stringify(returned));

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
