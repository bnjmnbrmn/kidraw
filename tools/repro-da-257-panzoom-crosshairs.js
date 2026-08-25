/*
 * Repro for da-257: "Show crosshairs while Pan/Zoom key is held down."
 *
 * The grid + crosshairs fade out after a few idle seconds. Holding the
 * Pan/Zoom key is a statement of intent to move the view, so the crosshairs
 * should come back for the duration of the hold — you cannot aim a pan at
 * something you cannot see.
 */
const {chromium} = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({viewport: {width: 1600, height: 1000}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(500);

  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {panZoom: JSON.parse(JSON.stringify(km.keyAssignments.panZoom)),
            movement: JSON.parse(JSON.stringify(km.keyAssignments.movement))};
  });
  console.log('panZoom submenu key:', keys.panZoom.submenu);

  const visible = () => page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return c.crosshairsLayer.crosshairs.konvaGroup.visible();
  });

  // Nudge once so the indicators are up, then wait out the fade.
  await page.keyboard.press(keys.movement.right);
  await page.waitForTimeout(400);
  check('crosshairs are visible right after a move', (await visible()) === true,
    String(await visible()));

  console.log('waiting out the idle fade...');
  await page.waitForTimeout(7000);
  check('crosshairs fade out when idle', (await visible()) === false,
    String(await visible()));

  // The bug: hold Pan/Zoom and they should come back.
  await page.keyboard.down(keys.panZoom.submenu);
  await page.waitForTimeout(400);
  const whileHeld = await visible();
  check('crosshairs are visible while the Pan/Zoom key is held',
    whileHeld === true, String(whileHeld));

  // And they must stay up for the whole hold, past the fade timeout.
  await page.waitForTimeout(7000);
  const stillHeld = await visible();
  check('crosshairs stay visible for a long Pan/Zoom hold',
    stillHeld === true, String(stillHeld));

  await page.keyboard.up(keys.panZoom.submenu);
  await page.waitForTimeout(300);
  check('crosshairs are still up immediately after release', (await visible()) === true,
    String(await visible()));

  // The pin must not disable the fade permanently.
  console.log('waiting out the fade again, after release...');
  await page.waitForTimeout(7000);
  check('the idle fade resumes once the key is released', (await visible()) === false,
    String(await visible()));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
