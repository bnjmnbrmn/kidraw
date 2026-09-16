/*
 * Repro for the out-of-order key-release repeat bug (dev-status "Known bugs" →
 * key-handling, Bug A in notes/reference-key-event-notation.md):
 *
 *   working:  \m \x /x /m      repeater for m stops at /m
 *   broken:   \m \x /m /x      repeater should stop at /m, keeps firing
 *
 * Concretely (vim profile): hold l (Move Right, repeating), press s (Coarse
 * Move submenu — pushes a submenu, so the stack top changes), release l while
 * s is still held. The l repeater lives in the ROOT submenu's scheduledActions
 * but the keyup is only delivered to the stack top, so the crosshairs keep
 * moving right forever — even after s is also released.
 *
 * Sections:
 *   A. Baseline: hold l alone → crosshairs move; release → they stop.
 *   B. Out-of-order with a plain action key (\l \c /l /c) → stops (control).
 *   C. Out-of-order with a submenu key (\l \s /l, s still held) → must stop.
 *   D. After /s too, no runaway repeater may survive.
 *
 * Run: node tools/repro-repeat-release-order.js  (dev server on :4200)
 */
const { chromium } = require('@playwright/test');

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
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(400);

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const mode = km.keyMenu.currentMode;
    return {
      x: da.crosshairsLayer.crosshairsX(),
      stackDepth: mode.stack.length,
      scheduled: mode.stack.map(s => [...s.scheduledActions.keys()]),
    };
  });

  // Let any in-flight crosshairs tween finish, then wait long enough that a
  // live repeater (interval 100 ms) must have fired between the two samples.
  const settled = async () => {
    await page.waitForTimeout(300);
    const a = await state();
    await page.waitForTimeout(400);
    const b = await state();
    return { moved: b.x !== a.x, a, b };
  };

  // --- A. Baseline: repeat works and clean release stops it ---
  await page.keyboard.down('l');
  await page.waitForTimeout(350);
  await page.keyboard.up('l');
  const afterClean = await settled();
  check('A1: holding l moves the crosshairs right', (await state()).x > 0);
  check('A2: releasing l (alone) stops the repeater', !afterClean.moved,
    `x ${afterClean.a.x} → ${afterClean.b.x}`);

  // --- B. Out-of-order with a plain action key: \l \c /l /c ---
  await page.keyboard.down('l');
  await page.waitForTimeout(250);
  await page.keyboard.down('c');   // Clear Selection: plain action, no submenu
  await page.keyboard.up('l');     // out-of-order release
  const bRes = await settled();
  await page.keyboard.up('c');
  check('B1: \\l \\c /l — repeater stops (plain-action control)', !bRes.moved,
    `x ${bRes.a.x} → ${bRes.b.x}`);

  // --- C. Out-of-order with a submenu key: \l \s /l (s still held) ---
  await page.keyboard.down('l');
  await page.waitForTimeout(250);
  await page.keyboard.down('s');   // Coarse Move… submenu — stack top changes
  const inSub = await state();
  check('C1: s pushes the Coarse Move submenu', inSub.stackDepth === 2,
    `stack depth ${inSub.stackDepth}`);
  await page.keyboard.up('l');     // out-of-order release: THE bug
  const cRes = await settled();
  check('C2: \\l \\s /l — repeater stops on /l', !cRes.moved,
    `x ${cRes.a.x} → ${cRes.b.x}; scheduled after /l: ${JSON.stringify(cRes.b.scheduled)}`);

  // --- D. Releasing s afterwards must leave no runaway repeater ---
  await page.keyboard.up('s');
  const dRes = await settled();
  // The x check alone can false-pass when the crosshairs clamp at the canvas
  // edge — the scheduled-timer map is the ground truth.
  check('D1: after /s no repeater survives', !dRes.moved && dRes.b.scheduled.flat().length === 0,
    `x ${dRes.a.x} → ${dRes.b.x}; scheduled: ${JSON.stringify(dRes.b.scheduled)}`);
  check('D2: back at root submenu', dRes.b.stackDepth === 1,
    `stack depth ${dRes.b.stackDepth}`);

  await browser.close();
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
