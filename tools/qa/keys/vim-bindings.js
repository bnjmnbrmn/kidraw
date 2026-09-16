/*
 * Repro for da-265: "Better match the vim behavior of search and
 * copy/cut/paste (y for copy, p for paste). Might need a secondary mode
 * searching where n and p will cycle."
 *
 * Vim's answer to the cycling question is n / N, not n / p — which is what
 * frees p to be Paste. So:
 *   y        tap  -> copy      (hold still opens cut/paste)
 *   p        tap  -> paste
 *   /  n  N       -> search, next match, previous match
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
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.__cmds = [];
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    km.keyMenuOut.subscribe(c => window.__cmds.push(c.kind));
  });
  const drain = () => page.evaluate(() => { const c = window.__cmds; window.__cmds = []; return c; });

  const graph = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    return {nodes: dl.getDANodes().length,
            sel: dl.getDANodes().filter(n => n.isSelected).map(n => n.id)};
  });
  const selectFirst = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    dl.unselectAll();
    dl.getDANodes()[0].isSelected = true;
    dl.batchDraw();
  });
  const placeCrosshairs = (lx, ly) => page.evaluate(([lx, ly]) => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    c.crosshairsLayer.crosshairs.x = lx * dl.scaleX() + dl.x();
    c.crosshairsLayer.crosshairs.y = ly * dl.scaleY() + dl.y();
  }, [lx, ly]);

  // y taps to copy.
  await selectFirst();
  await drain();
  await page.keyboard.press('y');
  await page.waitForTimeout(250);
  check('tapping y copies', (await drain()).includes('COPY_SELECTION'));

  // p pastes.
  const before = await graph();
  await placeCrosshairs(900, 700);
  await drain();
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  const cmds = await drain();
  const after = await graph();
  check('tapping p pastes', cmds.includes('PASTE_CLIPBOARD'), JSON.stringify(cmds));
  check('the paste actually added a node', after.nodes === before.nodes + 1,
    `${before.nodes} -> ${after.nodes}`);
  await page.keyboard.press('u');   // undo the paste
  await page.waitForTimeout(250);

  // Holding y still reaches cut and paste.
  await drain();
  await page.keyboard.down('y');
  await page.waitForTimeout(120);
  const held = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const m = km.keyMenu.currentMode;
    const top = m.stack[m.stack.length - 1];
    return Object.entries(top.keys || {})
      .filter(([, k]) => k && k.label)
      .map(([key, k]) => `${key}:${k.label}`);
  });
  await page.keyboard.up('y');
  await page.waitForTimeout(150);
  check('holding y still opens cut/paste',
    held.some(r => /Cut/.test(r)) && held.some(r => /Paste/.test(r)), JSON.stringify(held));

  // Search cycling is n / N, and p is no longer Prev Match.
  await drain();
  await page.keyboard.press('n');
  await page.waitForTimeout(200);
  check('n is Next Match', (await drain()).includes('SEARCH_NEXT_MATCH'));

  await drain();
  await page.keyboard.press('Shift+KeyN');
  await page.waitForTimeout(200);
  const prevCmds = await drain();
  check('Shift+N is Prev Match', prevCmds.includes('SEARCH_PREV_MATCH'),
    JSON.stringify(prevCmds));
  check('Shift+N does not also paste', !prevCmds.includes('PASTE_CLIPBOARD'),
    JSON.stringify(prevCmds));

  await drain();
  await page.keyboard.press('p');
  await page.waitForTimeout(200);
  const pCmds = await drain();
  check('p is no longer Prev Match', !pCmds.includes('SEARCH_PREV_MATCH'),
    JSON.stringify(pCmds));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
