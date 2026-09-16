/* Repro for da-195: hold v over empty canvas, move with the drag keys →
 * a marquee grows from the anchor and everything it touches is selected. */
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
      up: km.keyAssignments.drag.up,
      left: km.keyAssignments.drag.left,
      down: km.keyAssignments.drag.down,
      right: km.keyAssignments.drag.right,
      coarse: km.keyAssignments.dragSpeed.bigger,
      select: km.keyAssignments.root.selectDragSubmenu,
    };
  });
  console.log('keys:', JSON.stringify(keys));

  const setup = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.cancelDragAnimation?.();
    da.clearNormalMovementGoal();
    da.drawingLayer.restoreGraph({
      nodes: [
        {id: 'da-a', x: 500, y: 300, text: 'A', width: 100, height: 60, fontSize: 14, isSelected: false},
        {id: 'da-b', x: 700, y: 300, text: 'B', width: 100, height: 60, fontSize: 14, isSelected: false},
        {id: 'da-c', x: 1300, y: 700, text: 'C', width: 100, height: 60, fontSize: 14, isSelected: false},
        {id: 'da-pre', x: 120, y: 800, text: 'Pre', width: 100, height: 60, fontSize: 14, isSelected: true},
      ],
      edges: [{
        id: 'da-e', srcNodeId: 'da-a', destNodeId: 'da-b', isSelected: false,
        labels: [{id: 'da-l', x: 0, y: 0, text: 'ab', fontSize: 12, isSelected: false, edgeT: 0.5, side: 'on'}],
      }],
    });
    da.drawingLayer.scale({x: 1, y: 1});
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
    // Crosshairs over empty space above-left of A and B
    da.crosshairsLayer.crosshairs.x = 420;
    da.crosshairsLayer.crosshairs.y = 220;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
  });

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const marquee = da.crosshairsLayer.findOne('.area-select-marquee');
    return {
      selectedNodes: da.drawingLayer.getSelectedDANodes().map(n => n.id).sort(),
      selectedEdges: da.drawingLayer.getSelectedDAEdges().map(e => e.id),
      selectedLabels: da.drawingLayer.getDAEdges().flatMap(e => e.labels).filter(l => l.isSelected).map(l => l.id),
      marqueeVisible: !!marquee && marquee.visible(),
      nodeAX: da.drawingLayer.getDANodes().find(n => n.id === 'da-a').group.x(),
    };
  });

  // 1. Grow the marquee over A, B and the edge; release; selection persists.
  await setup();
  await page.keyboard.down(keys.select);
  await page.waitForTimeout(80);
  await page.keyboard.press(keys.right);   // toward A
  await page.waitForTimeout(60);
  const early = await state();
  check('marquee appears during the gesture', early.marqueeVisible);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(keys.right);
    await page.waitForTimeout(50);
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press(keys.down);
    await page.waitForTimeout(50);
  }
  const during = await state();
  check('marquee over A+B selects both nodes live',
    during.selectedNodes.includes('da-a') && during.selectedNodes.includes('da-b'),
    JSON.stringify(during.selectedNodes));
  check('edge between A and B is captured', during.selectedEdges.includes('da-e'),
    JSON.stringify(during.selectedEdges));
  check('pre-existing selection is untouched', during.selectedNodes.includes('da-pre'),
    JSON.stringify(during.selectedNodes));
  check('nodes are selected, not dragged', during.nodeAX === 500, `x=${during.nodeAX}`);
  await page.keyboard.up(keys.select);
  await page.waitForTimeout(120);
  const after = await state();
  check('selection persists after release',
    after.selectedNodes.includes('da-a') && after.selectedNodes.includes('da-b') &&
    after.selectedNodes.includes('da-pre'),
    JSON.stringify(after.selectedNodes));
  check('marquee disappears on release', !after.marqueeVisible);

  // 2. Shrinking the box releases marquee captures, never the prior selection.
  await setup();
  await page.keyboard.down(keys.select);
  await page.waitForTimeout(80);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(keys.right);
    await page.waitForTimeout(50);
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press(keys.down);
    await page.waitForTimeout(50);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(keys.left);   // shrink back
    await page.waitForTimeout(50);
  }
  const shrunk = await state();
  await page.keyboard.up(keys.select);
  check('shrinking the box deselects what it released',
    !shrunk.selectedNodes.includes('da-a') && !shrunk.selectedNodes.includes('da-b'),
    JSON.stringify(shrunk.selectedNodes));
  check('prior selection survives the shrink', shrunk.selectedNodes.includes('da-pre'),
    JSON.stringify(shrunk.selectedNodes));

  // 3. Coarse tier grows the box a major-grid multiple per press.
  await setup();
  await page.keyboard.down(keys.select);
  await page.waitForTimeout(80);
  await page.keyboard.down(keys.coarse);
  await page.waitForTimeout(60);
  await page.keyboard.press(keys.right);
  await page.waitForTimeout(80);
  await page.keyboard.press(keys.down);
  await page.waitForTimeout(80);
  await page.keyboard.up(keys.coarse);
  const coarse = await state();
  await page.keyboard.up(keys.select);
  check('one coarse step reaches the far node',
    coarse.selectedNodes.includes('da-c'), JSON.stringify(coarse.selectedNodes));

  // 4. Held v over an item still drags it (area select only on empty space).
  await setup();
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.crosshairsLayer.crosshairs.x = 550;  // over node A
    da.crosshairsLayer.crosshairs.y = 330;
  });
  await page.keyboard.down(keys.select);
  await page.waitForTimeout(80);
  await page.keyboard.press(keys.right);
  await page.waitForTimeout(400);
  await page.keyboard.up(keys.select);
  await page.waitForTimeout(100);
  const dragged = await state();
  check('held v over a node still drags it', dragged.nodeAX > 500,
    `x=${dragged.nodeAX}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
