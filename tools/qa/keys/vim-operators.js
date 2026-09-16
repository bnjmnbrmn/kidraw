/*
 * Repro for da-343: "Support dd, dw, cw, ciw, diw, and so on."
 *
 * `c` already took a motion (cw, cc, c$). This adds `d` as its twin — same
 * ranges, but staying in normal mode — and the `i` text object, so ciw/diw
 * work. Each case types a known string, puts the caret somewhere specific,
 * runs the command with real keys, and checks the resulting text AND which
 * mode it left you in (c ends in insert, d does not).
 */
const {chromium} = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(600);

  const mode = () => page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-keymenu')).keyMenu.currentMode.name);
  const text = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    return dl.getDANodes()[0].label.text();
  });

  /* Put the node into vim-normal label edit with known text and caret. */
  const setup = (value, caret) => page.evaluate(([value, caret]) => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    dl.unselectAll();
    const n = dl.getDANodes()[0];
    n.isSelected = true;
    // The edit key acts on whatever the crosshairs are over.
    c.crosshairsLayer.crosshairs.x = (n.group.x() + n.NODE_WIDTH / 2) * dl.scaleX() + dl.x();
    c.crosshairsLayer.crosshairs.y = (n.group.y() + n.NODE_HEIGHT / 2) * dl.scaleY() + dl.y();
    n.label.text(value);
    n.applyTextOverflow();
    n._cursorIndex = caret;
    n.updateCursorPosition();
    dl.batchDraw();
  }, [value, caret]);

  // Enter label edit, then vim-normal.
  const enterVimNormal = async () => {
    const m = await mode();
    if (m === 'labelEditVimNormal') return;
    if (m === 'labelEdit') { await page.keyboard.press('Escape'); await page.waitForTimeout(150); return; }
    await page.keyboard.press('i');            // graph normal -> label edit
    await page.waitForTimeout(200);
    if ((await mode()) === 'labelEdit') {
      await page.keyboard.press('Escape');     // -> vim normal
      await page.waitForTimeout(200);
    }
  };

  await setup('seed', 0);
  await enterVimNormal();
  console.log('mode:', await mode());

  /* Run one operator command and report the outcome. */
  const run = async (name, value, caret, keys, expectText, expectMode) => {
    await setup(value, caret);
    await enterVimNormal();
    await setup(value, caret);
    for (const k of keys) {
      await page.keyboard.press(k);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(150);
    const got = await text();
    const gotMode = await mode();
    const ok = got === expectText && gotMode.startsWith(expectMode);
    check(`${name}: ${JSON.stringify(value)} -> ${JSON.stringify(expectText)}`, ok,
      `got ${JSON.stringify(got)} in ${gotMode}`);
    // Leave things in vim-normal for the next case.
    if (gotMode === 'labelEdit' || gotMode === 'labelEditCaps') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
  };

  // caret index 4 = the 'b' of "beta" in "alpha beta gamma"
  const S = 'alpha beta gamma';

  await run('dw  (delete word)',        S, 6, ['d', 'w'], 'alpha gamma',      'labelEditVimNormal');
  // Vim's own asymmetry: cw stops at the word end (leaving both spaces),
  // dw closes the gap to the next word.
  await run('cw  (change word)',        S, 6, ['c', 'w'], 'alpha  gamma',     'labelEdit');
  await run('diw (delete inner word)',  S, 8, ['d', 'i', 'w'], 'alpha  gamma','labelEditVimNormal');
  await run('ciw (change inner word)',  S, 8, ['c', 'i', 'w'], 'alpha  gamma','labelEdit');
  await run('dd  (delete line)',        S, 6, ['d', 'd'], '',                 'labelEditVimNormal');
  await run('cc  (change line)',        S, 6, ['c', 'c'], '',                 'labelEdit');
  await run('db  (delete word back)',   S, 6, ['d', 'b'], 'beta gamma',       'labelEditVimNormal');
  await run('d0  (delete to line start)', S, 6, ['d', '0'], 'beta gamma',     'labelEditVimNormal');

  // Escape must abandon a pending operator without eating the next key.
  await setup(S, 6);
  await enterVimNormal();
  await setup(S, 6);
  await page.keyboard.press('d');
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('x');           // should delete one char, not a word
  await page.waitForTimeout(200);
  check('Escape abandons a pending d', (await text()) === 'alpha eta gamma',
    JSON.stringify(await text()));

  // A pending operator followed by a meaningless key does nothing at all.
  await setup(S, 6);
  await enterVimNormal();
  await setup(S, 6);
  await page.keyboard.press('d');
  await page.waitForTimeout(120);
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  check('d followed by a non-motion is a no-op', (await text()) === S,
    JSON.stringify(await text()));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
