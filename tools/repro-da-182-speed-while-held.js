/*
 * Repro for da-182: "Pressing s while holding, e.g., h, doesn't seem to be
 * making the movement faster. Same thing with d/slower."
 *
 * The speed keys are held submenus, so the documented order is hold-s then
 * press-h. This checks the other order — the one a hand actually does when
 * it is already moving and wants to go faster: h down and repeating, then s
 * pressed on top of it.
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
    return {movement: JSON.parse(JSON.stringify(km.keyAssignments.movement)),
            moveSpeed: JSON.parse(JSON.stringify(km.keyAssignments.moveSpeed))};
  });
  console.log('keys:', JSON.stringify(keys));

  // Record the tier of every movement command the drawing area receives.
  await page.evaluate(() => {
    window.__tiers = [];
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    km.keyMenuOut.subscribe(c => {
      if (typeof c.kind === 'string' && c.kind.startsWith('MOVE_CROSSHAIRS_')) {
        window.__tiers.push(c.gridTier ?? 'normal');
      }
    });
  });
  const drain = () => page.evaluate(() => { const t = window.__tiers; window.__tiers = []; return t; });

  // Baseline: the documented order, hold s then tap h.
  await page.keyboard.down(keys.moveSpeed.bigger);
  await page.waitForTimeout(120);
  await page.keyboard.press(keys.movement.left);
  await page.waitForTimeout(120);
  await page.keyboard.up(keys.moveSpeed.bigger);
  await page.waitForTimeout(150);
  const documented = await drain();
  check('hold s then press h gives a coarse move',
    documented.length > 0 && documented.every(t => t === 'coarse'),
    JSON.stringify(documented));

  // The reported case: hold h until it is repeating, then press s on top.
  await drain();
  await page.keyboard.down(keys.movement.left);
  await page.waitForTimeout(900);              // let the repeat get going
  const beforeSpeedKey = await drain();
  await page.keyboard.down(keys.moveSpeed.bigger);
  await page.waitForTimeout(900);              // keep repeating, now with s held
  const withSpeedKey = await drain();
  await page.keyboard.up(keys.moveSpeed.bigger);
  await page.keyboard.up(keys.movement.left);
  await page.waitForTimeout(150);

  console.log(`  repeats before s: ${beforeSpeedKey.length} ${JSON.stringify([...new Set(beforeSpeedKey)])}`);
  console.log(`  repeats while s held: ${withSpeedKey.length} ${JSON.stringify([...new Set(withSpeedKey)])}`);

  check('the held movement actually repeats', beforeSpeedKey.length > 0,
    `${beforeSpeedKey.length} moves`);
  check('pressing s while h is held switches the repeat to coarse',
    withSpeedKey.length > 0 && withSpeedKey.every(t => t === 'coarse'),
    JSON.stringify([...new Set(withSpeedKey)]));

  // And the same for the fine key.
  await drain();
  await page.keyboard.down(keys.movement.left);
  await page.waitForTimeout(900);
  await drain();
  await page.keyboard.down(keys.moveSpeed.smaller);
  await page.waitForTimeout(900);
  const withFine = await drain();
  await page.keyboard.up(keys.moveSpeed.smaller);
  await page.keyboard.up(keys.movement.left);
  await page.waitForTimeout(150);
  check('pressing d while h is held switches the repeat to fine',
    withFine.length > 0 && withFine.every(t => t === 'fine'),
    JSON.stringify([...new Set(withFine)]));

  // Releasing the speed key returns to normal without releasing the mover.
  await drain();
  await page.keyboard.down(keys.movement.left);
  await page.waitForTimeout(700);
  await page.keyboard.down(keys.moveSpeed.bigger);
  await page.waitForTimeout(500);
  await drain();
  await page.keyboard.up(keys.moveSpeed.bigger);
  await page.waitForTimeout(800);
  const afterRelease = await drain();
  await page.keyboard.up(keys.movement.left);
  // A repeat already scheduled when s came up may still land coarse; what
  // matters is that the run settles to normal and stays there.
  const settled = afterRelease.slice(afterRelease.indexOf('normal'));
  check('releasing s returns the still-held repeat to normal',
    afterRelease.includes('normal') && settled.every(t => t === 'normal'),
    JSON.stringify(afterRelease));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
