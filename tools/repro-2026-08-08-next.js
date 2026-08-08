/* Browser repros for the live Next items captured on 2026-08-08. */
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

  const putCrosshairsOn = id => page.evaluate(nodeId => {
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

  // Natural nested hold: Add… → Edge… → Self Loop.
  await putCrosshairsOn('da-141');
  await page.keyboard.down('a');
  await page.waitForTimeout(40);
  await page.keyboard.down('s');
  await page.waitForTimeout(40);
  await page.keyboard.down('l');
  await page.waitForTimeout(40);
  await page.keyboard.up('l');
  await page.waitForTimeout(40);
  await page.keyboard.up('s');
  await page.keyboard.up('a');
  await page.waitForTimeout(100);
  let selfLoops = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDAEdges()
      .filter(edge => edge.srcNode.id === 'da-141' && edge.destNode.id === 'da-141').length;
  });
  check('Add > Edge > Self Loop works in exact nested order', selfLoops === 1,
    `${selfLoops} loop(s)`);

  // Human chords can roll the leaf down a few milliseconds before the
  // submenu key. This used to turn l into a rightward target hop.
  await putCrosshairsOn('da-141');
  await page.keyboard.down('a');
  await page.keyboard.down('l');
  await page.keyboard.down('s');
  await page.keyboard.up('l');
  await page.keyboard.up('s');
  await page.keyboard.up('a');
  await page.waitForTimeout(100);
  selfLoops = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDAEdges()
      .filter(edge => edge.srcNode.id === 'da-141' && edge.destNode.id === 'da-141').length;
  });
  check('rolled Self Loop chord cannot become an ordinary rightward edge', selfLoops === 2,
    `${selfLoops} loop(s)`);

  // Change the actual Settings inputs, then hold one inserted character.
  const setEditRepeat = async (delay, interval) => {
    const settings = page.locator('details').filter({hasText: 'Settings'});
    if (await settings.count()) await settings.first().evaluate(el => { el.open = true; });
    const cursor = page.locator('details').filter({hasText: 'Cursor'}).last();
    await cursor.evaluate(el => { el.open = true; });
    const delayInput = cursor.locator('label').filter({hasText: 'Edit repeat delay'}).locator('input');
    const intervalInput = cursor.locator('label').filter({hasText: 'Edit repeat interval'}).locator('input');
    await delayInput.fill(String(delay));
    await intervalInput.fill(String(interval));
    await intervalInput.evaluate(input => input.blur());
  };

  await putCrosshairsOn('da-139');
  await page.keyboard.press('i');
  await page.keyboard.press('i');
  await setEditRepeat(1000, 400);
  const slowStartLength = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDANodes().find(candidate => candidate.id === 'da-139').label.text().length;
  });
  await page.keyboard.down('z');
  await page.waitForTimeout(500);
  await page.keyboard.up('z');
  const slowRepeat = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const node = da.drawingLayer.getDANodes().find(candidate => candidate.id === 'da-139');
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      text: node.label.text(),
      mode: km.keyMenu.currentMode.name,
      stack: km.keyMenu.currentMode.stack.map(submenu => submenu.config._repeatConfig),
    };
  });
  check('changing Edit repeat settings keeps the active edit session',
    slowRepeat.mode === 'labelEdit', slowRepeat.mode);
  check('Edit repeat delay is applied immediately',
    slowRepeat.text.length - slowStartLength === 1 &&
      slowRepeat.stack[0].initialDelayMs === 1000,
    `${slowRepeat.text.length - slowStartLength} insertion(s), ${JSON.stringify(slowRepeat.stack[0])}`);

  await setEditRepeat(50, 100);
  const fastStartLength = slowRepeat.text.length;
  await page.keyboard.down('q');
  await page.waitForTimeout(500);
  await page.keyboard.up('q');
  const fastRepeat = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const node = da.drawingLayer.getDANodes().find(candidate => candidate.id === 'da-139');
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      text: node.label.text(),
      mode: km.keyMenu.currentMode.name,
      stack: km.keyMenu.currentMode.stack.map(submenu => submenu.config._repeatConfig),
    };
  });
  check('Edit repeat interval changes the held typing cadence',
    fastRepeat.mode === 'labelEdit' && fastRepeat.text.length - fastStartLength >= 4 &&
      fastRepeat.stack[0].intervalMs === 100,
    `${fastRepeat.text.length - fastStartLength} insertion(s), ${JSON.stringify(fastRepeat.stack[0])}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Alternate at Bugs' lower boundary. The same approach direction should
  // not rediscover Bugs after every tiny reversal.
  const bugs = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.clearNormalMovementGoal();
    const node = da.drawingLayer.getDANodes().find(candidate => candidate.id === 'da-4');
    const scale = da.drawingLayer.scaleX();
    const centerX = node.group.x() + node.NODE_WIDTH / 2;
    const bottom = node.group.y() + node.NODE_HEIGHT;
    da.crosshairsLayer.crosshairs.x = da.drawingLayer.x() + centerX * scale;
    da.crosshairsLayer.crosshairs.y = da.drawingLayer.y() + (bottom + 200) * scale;
    da.crosshairsLayer.showCrosshairs();
    return {centerX, bottom};
  });
  const trace = [];
  for (const key of ['k', 'k', 'k', 'k', 'j', 'k', 'j', 'k']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
    trace.push(await page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      const hover = da.drawingLayer.findOne('.crosshair-hover-highlight');
      const p = da.crosshairsInLayerCoords();
      return {
        y: Math.round(p.y * 10) / 10,
        semantic: da.normalMovementHoverTarget,
        hover: hover ? {
          kind: hover.getAttr('targetKind'), id: hover.getAttr('targetId'),
        } : null,
      };
    }));
  }
  const bugsHits = trace.filter(item => item.semantic?.kind === 'node' &&
    item.semantic.id === 'da-4').length;
  check('alternating over Bugs does not repeatedly rediscover the same boundary',
    bugsHits === 1, `${bugsHits} Bugs hits: ${JSON.stringify(trace)}`);

  // A held key repeats at roughly the tween duration. Semantic feedback must
  // therefore be drawn at selection time, not after the tween.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.clearNormalMovementGoal();
    const node = da.drawingLayer.getDANodes().find(candidate => candidate.id === 'da-4');
    const scale = da.drawingLayer.scaleX();
    const centerX = node.group.x() + node.NODE_WIDTH / 2;
    const bottom = node.group.y() + node.NODE_HEIGHT;
    da.crosshairsLayer.crosshairs.x = da.drawingLayer.x() + centerX * scale;
    da.crosshairsLayer.crosshairs.y = da.drawingLayer.y() + (bottom + 200) * scale;
    da.crosshairsLayer.showCrosshairs();
  });
  await page.keyboard.down('k');
  let edgeLandingSeen = false;
  let edgeTraceSeen = false;
  for (let elapsed = 0; elapsed < 900; elapsed += 20) {
    await page.waitForTimeout(20);
    const sample = await page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      const hover = da.drawingLayer.findOne('.crosshair-hover-highlight');
      return {
        semantic: da.normalMovementHoverTarget,
        hover: hover ? {kind: hover.getAttr('targetKind'), id: hover.getAttr('targetId')} : null,
      };
    });
    if (sample.semantic?.kind === 'edge') {
      edgeLandingSeen = true;
      if (sample.hover?.kind === 'edge' && sample.hover.id === sample.semantic.id) {
        edgeTraceSeen = true;
      }
    }
  }
  await page.keyboard.up('k');
  check('held movement highlights an encountered edge before the next repeat',
    edgeLandingSeen && edgeTraceSeen,
    `landing=${edgeLandingSeen}, trace=${edgeTraceSeen}`);

  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
