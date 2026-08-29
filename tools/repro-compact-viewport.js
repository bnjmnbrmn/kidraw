/* Ben's 2026-08-17 feedback on the compact keymenu (da-200):
 *   - side is a Settings option, and the panel moves with it
 *   - modifier rows (Ctrl / Shift / CapsLock) are not listed at all: the
 *     panel shows the keys the full card draws, and no others (da-432)
 *   - the panel's width is excluded from the usable viewport, both for
 *     fit/recenter and for the pan-on-move margin
 *   - the panel is only as tall as its rows                              */
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
      toggle: km.keyAssignments.root.toggleVisibility,
      right: km.keyAssignments.movement.right,
      recenter: km.keyAssignments.panZoom.recenterView,
      panZoom: km.keyAssignments.panZoom.submenu,
    };
  });

  const panelBox = () => page.evaluate(() => {
    const el = document.querySelector('app-compact-keymenu .compact-keymenu');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {left: r.left, right: r.right, top: r.top, bottom: r.bottom,
            width: r.width, height: r.height};
  });
  const rows = () => page.evaluate(() =>
    [...document.querySelectorAll('app-compact-keymenu .row')].map(r => ({
      key: r.querySelector('.key')?.textContent?.trim(),
      label: r.querySelector('.label')?.textContent?.trim(),
    })));
  const inset = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.viewportInset;
  });

  // --- compact display on ---
  await page.keyboard.press(keys.toggle);
  await page.waitForTimeout(250);

  // 1. The panel lists what the card draws — the three letter rows — and
  // nothing else. Ctrl, Shift and CapsLock still work; they are just not
  // shown in either view (da-432).
  const rowList = await rows();
  const CARD_KEYS = new Set([...'qwertyuiop', ...'asdfghjkl', ';', ...'zxcvbnm', ',', '.', '/']);
  const offCard = rowList.filter(r => !CARD_KEYS.has(r.key));
  check('no modifier rows', offCard.length === 0, JSON.stringify(offCard));
  check('no leftover "More Ctrl" rows',
    !rowList.some(r => r.label === 'More Ctrl'));
  check('the letter rows are still listed', rowList.length > 20, `rows=${rowList.length}`);

  // 2. Panel height tracks its rows, not the whole viewport.
  const box = await panelBox();
  const rowCount = rowList.length;
  check('panel is not full height', box.height < 950,
    `h=${Math.round(box.height)} for ${rowCount} rows`);
  check('panel height is close to its content',
    box.height < rowCount * 30 + 60,
    `h=${Math.round(box.height)} rows=${rowCount}`);

  // 3. Viewport inset matches the panel, on the right by default.
  const ins = await inset();
  check('drawing area insets on the right by default',
    ins.right > 0 && ins.left === 0, JSON.stringify(ins));
  check('inset covers the panel width',
    ins.right >= box.width, `inset=${ins.right} panel=${Math.round(box.width)}`);

  // 4. The crosshairs stop before the panel instead of sliding under it.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.drawingLayer.restoreGraph({nodes: [], edges: []});
    da.drawingLayer.scale({x: 1, y: 1});
    da.drawingLayer.position({x: 0, y: 0});
    da.crosshairsLayer.crosshairs.x = 200;
    da.crosshairsLayer.crosshairs.y = 400;
    da.crosshairsLayer.showCrosshairs();
  });
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(keys.right);
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(400);
  const stopped = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    return {x: da.crosshairsLayer.crosshairs.x, stageW: da.stage.width()};
  });
  const panelLeft = (await panelBox()).left;
  check('crosshairs never travel under the panel',
    stopped.x < panelLeft, `x=${Math.round(stopped.x)} panelLeft=${Math.round(panelLeft)}`);

  // 5. Fit-to-content centres in the usable area, not the whole stage.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.drawingLayer.restoreGraph({nodes: [
      {id: 'da-1', x: 0, y: 0, text: 'A', width: 120, height: 60, fontSize: 14, isSelected: false},
      {id: 'da-2', x: 900, y: 500, text: 'B', width: 120, height: 60, fontSize: 14, isSelected: false},
    ], edges: []});
    da.fitViewToContent();
  });
  await page.waitForTimeout(250);
  const fitted = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const nodes = da.drawingLayer.getDANodes();
    const s = da.drawingLayer.scaleX();
    const xs = nodes.flatMap(n => [n.group.x(), n.group.x() + n.NODE_WIDTH]);
    const ys = nodes.flatMap(n => [n.group.y(), n.group.y() + n.NODE_HEIGHT]);
    const toStage = v => da.drawingLayer.x() + v * s;
    return {
      contentCenterX: (toStage(Math.min(...xs)) + toStage(Math.max(...xs))) / 2,
      usableCenterX: da.viewportInset.left +
        (da.stage.width() - da.viewportInset.left - da.viewportInset.right) / 2,
      stageCenterX: da.stage.width() / 2,
      maxRight: toStage(Math.max(...xs)),
    };
  });
  check('fitted content centres on the usable area',
    Math.abs(fitted.contentCenterX - fitted.usableCenterX) < 2,
    JSON.stringify({content: Math.round(fitted.contentCenterX), usable: Math.round(fitted.usableCenterX)}));
  check('fitted content clears the panel',
    fitted.maxRight < panelLeft,
    `right=${Math.round(fitted.maxRight)} panelLeft=${Math.round(panelLeft)}`);

  // 6. Switching the side setting moves the panel and the inset.
  // Drive the real <select> in Settings rather than calling the handler, so
  // the change runs inside Angular's zone exactly as a user's would.
  await page.evaluate(() => {
    const details = document.querySelector('app-header details.settings-dropdown');
    if (details) details.open = true;
  });
  const sideSelect = page.locator('app-header select').filter({
    has: page.locator('option[value="left"]'),
  }).last();
  await sideSelect.selectOption('left');
  await page.waitForTimeout(400);
  const leftBox = await panelBox();
  const leftIns = await inset();
  check('panel docks left when the setting says left',
    leftBox.left < 40, `left=${Math.round(leftBox.left)}`);
  check('inset follows the side setting',
    leftIns.left > 0 && leftIns.right === 0, JSON.stringify(leftIns));

  await page.screenshot({path: 'test-output/compact-left.png'});
  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
