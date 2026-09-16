/*
 * Repro for da-257: "Show crosshairs while Pan/Zoom key is held down."
 *
 * The grid + crosshairs fade out after a few idle seconds. Holding the
 * Pan/Zoom key is a statement of intent to move the view, so the crosshairs
 * should come back for the duration of the hold — you cannot aim a pan at
 * something you cannot see.
 */
const {launch, openApp, settled, movedAndSettled, crosshairsOf, afterFrame,
  overlay: waitForOverlay, waitForDA, checker} = require('../harness');

const check = checker();

async function main() {
  const browser = await launch();
  const page = await openApp(browser, {width: 1600, height: 1000});

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

  console.log(check.failures ? `\n${check.failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(check.failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
