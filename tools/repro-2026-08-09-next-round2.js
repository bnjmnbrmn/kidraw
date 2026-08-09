/* Browser repros for the two live Next items captured on 2026-08-09. */
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
  await page.waitForTimeout(150);

  const putCrosshairsOnNode = id => page.evaluate(nodeId => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    const node = da.drawingLayer.getDANodes().find(candidate => candidate.id === nodeId);
    da.crosshairsLayer.crosshairs.x = da.drawingLayer.x() +
      (node.group.x() + node.NODE_WIDTH / 2) * da.drawingLayer.scaleX();
    da.crosshairsLayer.crosshairs.y = da.drawingLayer.y() +
      (node.group.y() + node.NODE_HEIGHT / 2) * da.drawingLayer.scaleY();
    da.crosshairsLayer.showCrosshairs();
    da.refreshCrosshairHoverHighlight();
  }, id);

  const putCrosshairsOnEdge = id => page.evaluate(edgeId => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    const edge = da.drawingLayer.getDAEdges().find(candidate => candidate.id === edgeId);
    const points = edge.getPathPoints();
    let best = {length: -1, a: points[0], b: points[1]};
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > best.length) best = {length, a, b};
    }
    const p = {x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2};
    da.crosshairsLayer.crosshairs.x = da.drawingLayer.x() + p.x * da.drawingLayer.scaleX();
    da.crosshairsLayer.crosshairs.y = da.drawingLayer.y() + p.y * da.drawingLayer.scaleY();
    da.crosshairsLayer.showCrosshairs();
    da.refreshCrosshairHoverHighlight();
  }, id);

  // Tap Add over a real edge. It should create one selected label and put the
  // keyboard straight into Insert mode, without a held-submenu release.
  await putCrosshairsOnEdge('da-144');
  const beforeLabels = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDAEdges().find(edge => edge.id === 'da-144').labels.length;
  });
  await page.keyboard.press('a');
  await page.waitForTimeout(100);
  const afterAdd = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const edge = da.drawingLayer.getDAEdges().find(candidate => candidate.id === 'da-144');
    return {
      labels: edge.labels.length,
      selected: edge.labels.filter(label => label.isSelected).length,
      mode: km.keyMenu.currentMode.name,
    };
  });
  check('tap Add over an edge creates exactly one label',
    afterAdd.labels === beforeLabels + 1 && afterAdd.selected === 1,
    JSON.stringify(afterAdd));
  check('tap-created edge label enters Insert mode',
    afterAdd.mode === 'labelEdit', afterAdd.mode);
  await page.keyboard.type('edge');
  const edgeLabelText = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDAEdges().find(edge => edge.id === 'da-144').labels.at(-1).label;
  });
  check('typing goes into the tap-created edge label', edgeLabelText === 'edge', edgeLabelText);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const setRepeat = async (edit, delay, interval) => {
    const settings = page.locator('details').filter({hasText: 'Settings'});
    if (await settings.count()) await settings.first().evaluate(el => { el.open = true; });
    const cursor = page.locator('details').filter({hasText: 'Cursor'}).last();
    await cursor.evaluate(el => { el.open = true; });
    const prefix = edit ? 'Edit repeat' : 'Repeat';
    const delayInput = cursor.getByRole('spinbutton', {name: `${prefix} delay (ms):`, exact: true});
    const intervalInput = cursor.getByRole('spinbutton', {name: `${prefix} interval (ms):`, exact: true});
    await delayInput.fill(String(delay));
    await intervalInput.fill(String(interval));
    await intervalInput.evaluate(input => input.blur());
  };

  // Observe commands emitted by the real document-key path, not only the
  // configuration object installed on a rebuilt key card.
  await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    window.__nextRepeatCommands = [];
    km.keyMenuOut.subscribe(command => window.__nextRepeatCommands.push(command));
  });
  const holdAndCount = async (key, ms) => {
    await page.evaluate(() => { window.__nextRepeatCommands.length = 0; });
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    return page.evaluate(() => window.__nextRepeatCommands.length);
  };

  await setRepeat(false, 1000, 400);
  const slowNormal = await holdAndCount('h', 500);
  check('Repeat delay controls the real normal-mode timer', slowNormal === 1,
    `${slowNormal} action(s)`);
  await setRepeat(false, 50, 100);
  const fastNormal = await holdAndCount('l', 500);
  check('Repeat interval controls the real normal-mode cadence', fastNormal >= 4,
    `${fastNormal} action(s)`);

  await putCrosshairsOnNode('da-143');
  await page.keyboard.press('i');
  await page.keyboard.press('i');
  await setRepeat(true, 1000, 400);
  const slowStart = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDANodes().find(node => node.id === 'da-143').label.text().length;
  });
  await page.keyboard.down('z');
  await page.waitForTimeout(500);
  await page.keyboard.up('z');
  const slowEdit = await page.evaluate(start => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDANodes().find(node => node.id === 'da-143').label.text().length - start;
  }, slowStart);
  check('Edit repeat delay controls the real text timer', slowEdit === 1,
    `${slowEdit} insertion(s)`);

  await setRepeat(true, 50, 100);
  const fastStart = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDANodes().find(node => node.id === 'da-143').label.text().length;
  });
  await page.keyboard.down('q');
  await page.waitForTimeout(500);
  await page.keyboard.up('q');
  const fastEdit = await page.evaluate(start => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDANodes().find(node => node.id === 'da-143').label.text().length - start;
  }, fastStart);
  check('Edit repeat interval controls the real text cadence', fastEdit >= 4,
    `${fastEdit} insertion(s)`);

  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
