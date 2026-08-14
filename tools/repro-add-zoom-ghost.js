/* Repro for da-198: zoomed out, tap `a` over empty space (insert node +
 * label edit), type, exit, zoom in — a transient extra node appears.
 * Inspect the layers for stray ghost groups at each step. */
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
      add: km.keyAssignments.root.insertSubmenu ?? 'a',
      zoomInRoot: km.keyAssignments.panZoom.zoomIn,
      panZoom: km.keyAssignments.panZoom.submenu,
    };
  });
  console.log('keys:', JSON.stringify(keys));

  const ghostCensus = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const names = [];
    for (const layer of [da.drawingLayer, da.crosshairsLayer]) {
      layer.find('Group').forEach(g => {
        const n = g.name();
        if (n && n !== '' && g.visible()) names.push(n);
      });
    }
    return {
      names: names.filter(n => /ghost|grow|insert/i.test(n)),
      nodeCount: da.drawingLayer.getDANodes().length,
      scale: da.drawingLayer.scaleX(),
      mode: window.ng.getComponent(document.querySelector('app-keymenu')).currentMode?.name ?? null,
    };
  });

  // Zoomed-out empty canvas, crosshairs over empty space
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.drawingLayer.restoreGraph({
      nodes: [{id: 'da-far', x: 3000, y: 2000, text: 'Far away', width: 140, height: 60, fontSize: 14, isSelected: false}],
      edges: [],
    });
    da.drawingLayer.scale({x: 0.25, y: 0.25});
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
    da.crosshairsLayer.crosshairs.x = 700;
    da.crosshairsLayer.crosshairs.y = 400;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
  });

  // Tap `a` over empty space → insert node + label edit. The insert flow
  // auto-zooms to a legible scale; the edit lens must not survive that zoom
  // as a phantom second node (da-198).
  await page.keyboard.press(keys.add);
  await page.waitForTimeout(300);
  const during = await ghostCensus();
  console.log('after add tap:', JSON.stringify(during));
  check('edit lens is not left behind by the insert auto-zoom',
    !during.names.includes('label-edit-ghost') || during.scale < 1,
    JSON.stringify(during));

  // Type a label and exit label edit
  await page.keyboard.type('hello');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const afterExit = await ghostCensus();
  console.log('after exit label edit:', JSON.stringify(afterExit));
  check('no ghost overlays linger after label edit exits',
    afterExit.names.length === 0, JSON.stringify(afterExit.names));

  // Zoom in twice (r submenu → zoom key), the reported trigger
  await page.keyboard.down(keys.panZoom);
  await page.waitForTimeout(60);
  await page.keyboard.press(keys.zoomInRoot);
  await page.waitForTimeout(450);
  await page.keyboard.press(keys.zoomInRoot);
  await page.waitForTimeout(450);
  await page.keyboard.up(keys.panZoom);
  await page.waitForTimeout(400);
  const afterZoom = await ghostCensus();
  console.log('after zoom in x2:', JSON.stringify(afterZoom));
  check('no ghost overlays after zooming in', afterZoom.names.length === 0,
    JSON.stringify(afterZoom.names));
  check('exactly the two real nodes exist', afterZoom.nodeCount === 2,
    `nodeCount=${afterZoom.nodeCount}`);

  // The lens itself must still serve its purpose: editing an existing node
  // at low zoom (no auto-zoom in that path) shows the readable overlay.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.drawingLayer.scale({x: 0.25, y: 0.25});
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
    const node = da.drawingLayer.getDANodes()[0];
    da.drawingLayer.unselectAll();
    node.isSelected = true;
    node.setCursorToEnd();
    node.showCursor();
    da.refreshLabelEditGhost();
  });
  await page.waitForTimeout(100);
  const lens = await ghostCensus();
  console.log('low-zoom existing-node edit:', JSON.stringify(lens));
  check('edit lens still appears for a low-zoom existing-node edit',
    lens.names.includes('label-edit-ghost'), JSON.stringify(lens.names));

  await page.screenshot({path: 'test-output/add-zoom-ghost.png'});
  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
