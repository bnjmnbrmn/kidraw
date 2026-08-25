/*
 * da-163, pinpointing: releasing Shift before the Quote key leaves the
 * keymenu unable to produce another `"`. Dumps mode + submenu stack around
 * the sequence to show what state is left behind.
 */
const {chromium} = require('@playwright/test');

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({viewport: {width: 1600, height: 1000}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.__cmds = [];
    document.addEventListener('keydown', e => window.__cmds.push(
      `keydown ${JSON.stringify(e.key)} code=${e.code} repeat=${e.repeat}`), true);
    document.addEventListener('keyup', e => window.__cmds.push(
      `keyup   ${JSON.stringify(e.key)} code=${e.code}`), true);
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    // Patch KMSubmenu.handleKeyDown to report dispatch decisions.
    const proto = Object.getPrototypeOf(km.keyMenu.currentMode.stack[0]);
    const orig = proto.handleKeyDown;
    proto.handleKeyDown = function (event) {
      const rk = this.resolveKey ? this.resolveKey(event) : '?';
      window.__cmds.push(`  dispatch depth=${this.depth} key=${JSON.stringify(rk)} bound=${!!this.keys[rk]} help=${this.helpModeActive} sched=${this.mode && this.mode.actionSchedulingEnabled}`);
      return orig.call(this, event);
    };
    km.keyMenuOut.subscribe(c => window.__cmds.push(c.kind + (c.value !== undefined ? ' ' + JSON.stringify(c.value) : '')));
  });

  const keys = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-keymenu')).keyAssignments.root);

  await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer, n = dl.getDANodes()[0];
    c.crosshairsLayer.crosshairs.x = n.konvaGroup.x() * dl.scaleX() + dl.x();
    c.crosshairsLayer.crosshairs.y = n.konvaGroup.y() * dl.scaleY() + dl.y();
  });

  await page.keyboard.press(keys.editText);
  await page.waitForTimeout(250);
  await page.keyboard.press('i');
  await page.waitForTimeout(250);

  const state = () => page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const m = km.keyMenu.currentMode;
    const top = m.stack[m.stack.length - 1];
    const highlighted = Object.entries(top.keys || {})
      .filter(([, k]) => k && k.highlight).map(([s]) => s);
    return {
      mode: m.name,
      stackDepth: m.stack.length,
      stackKeys: JSON.stringify(m.submenuKeyStringStack),
      actionSchedulingEnabled: m.actionSchedulingEnabled,
      topHighlighted: highlighted,
      topScheduled: top.scheduledActions ? [...top.scheduledActions.keys()] : null,
    };
  });
  const drain = () => page.evaluate(() => { const c = window.__cmds; window.__cmds = []; return c; });

  const badQuote = async () => {
    await page.keyboard.down('Shift'); await page.waitForTimeout(30);
    await page.keyboard.down('Quote'); await page.waitForTimeout(30);
    await page.keyboard.up('Shift');   await page.waitForTimeout(30);
    await page.keyboard.up('Quote');   await page.waitForTimeout(60);
  };
  const goodQuote = async () => {
    await page.keyboard.down('Shift'); await page.waitForTimeout(30);
    await page.keyboard.press('Quote'); await page.waitForTimeout(30);
    await page.keyboard.up('Shift');   await page.waitForTimeout(60);
  };

  const PAUSE = parseInt(process.env.PAUSE_MS || '0', 10);
  const pause = async () => { if (PAUSE) await page.waitForTimeout(PAUSE); };
  console.log(`PAUSE_MS=${PAUSE}`);
  console.log('baseline           ', JSON.stringify(await state()));
  await drain();

  await badQuote();
  console.log('cmds after bad #1  ', JSON.stringify(await drain()));
  console.log('state after bad #1 ', JSON.stringify(await state()));

  await pause();
  await badQuote();
  console.log('cmds after bad #2  ', JSON.stringify(await drain()));
  console.log('state after bad #2 ', JSON.stringify(await state()));

  await pause();
  await goodQuote();
  console.log('cmds after good    ', JSON.stringify(await drain()));
  console.log('state after good   ', JSON.stringify(await state()));

  await goodQuote();
  console.log('cmds after good #2 ', JSON.stringify(await drain()));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
