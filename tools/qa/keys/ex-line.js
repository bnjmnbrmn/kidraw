/*
 * Repro for da-165: the ex line (vim `:` command mode).
 *
 *   1. ':' in normal mode opens a focused command line.
 *   2. Typing into it does NOT leak into the graph (the keymenu ignores
 *      keystrokes aimed at a native field) — the old failure mode would be
 *      ':w' moving the crosshairs or inserting a node.
 *   3. Escape closes it and hands the keyboard back to the keymenu.
 *   4. Enter runs the command; an unknown one reports itself.
 *   5. :w without a vault says so rather than failing silently.
 *   6. Up walks command history.
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

  const graphSize = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    return {nodes: dl.getDANodes().length, edges: dl.getDAEdges().length};
  });
  const crosshairs = () => page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {x: Math.round(c.crosshairsLayer.crosshairs.x), y: Math.round(c.crosshairsLayer.crosshairs.y)};
  });
  const lineOpen = () => page.evaluate(() => !!document.querySelector('app-ex-line'));
  const fieldText = () => page.evaluate(() => {
    const el = document.querySelector('app-ex-line input');
    return el ? el.value : null;
  });
  const focused = () => page.evaluate(() =>
    document.activeElement?.tagName === 'INPUT');
  const status = () => page.evaluate(() => {
    const el = document.querySelector('app-header .status-message');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  });

  check('ex line starts closed', !(await lineOpen()));

  const before = await graphSize();
  const xhBefore = await crosshairs();

  await page.keyboard.press('Shift+Semicolon');   // ':'
  await page.waitForTimeout(300);
  check('":" opens the ex line', await lineOpen());
  check('the field takes focus', await focused());

  // The critical one: these letters must go to the field, not the graph.
  // 'w' is Style, 'h/j/k/l' move the crosshairs, 'a' is the add hub.
  await page.keyboard.type('w hjkl a');
  await page.waitForTimeout(250);
  check('typing lands in the field', (await fieldText()) === 'w hjkl a',
    JSON.stringify(await fieldText()));
  const during = await graphSize();
  check('typing did not change the graph',
    during.nodes === before.nodes && during.edges === before.edges,
    `${JSON.stringify(before)} -> ${JSON.stringify(during)}`);
  const xhDuring = await crosshairs();
  check('typing did not move the crosshairs',
    xhDuring.x === xhBefore.x && xhDuring.y === xhBefore.y,
    `${JSON.stringify(xhBefore)} -> ${JSON.stringify(xhDuring)}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes the ex line', !(await lineOpen()));

  // Keyboard is back with the keymenu: a movement key moves again.
  await page.keyboard.press('l');
  await page.waitForTimeout(250);
  const xhAfter = await crosshairs();
  check('keymenu has the keyboard back after Escape', xhAfter.x !== xhDuring.x,
    `${JSON.stringify(xhDuring)} -> ${JSON.stringify(xhAfter)}`);

  // An unknown command reports itself.
  await page.keyboard.press('Shift+Semicolon');
  await page.waitForTimeout(200);
  await page.keyboard.type('nonsense');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('Enter closes the line', !(await lineOpen()));
  check('unknown command is reported', (await status()).includes('Not an editor command'),
    await status());

  // :w with no vault connected explains itself.
  await page.keyboard.press('Shift+Semicolon');
  await page.waitForTimeout(200);
  await page.keyboard.type('w');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(':w without a vault explains itself', (await status()).toLowerCase().includes('vault'),
    await status());

  // History: Up recalls the previous command.
  await page.keyboard.press('Shift+Semicolon');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  check('Up recalls the last command', (await fieldText()) === 'w',
    JSON.stringify(await fieldText()));
  await page.keyboard.press('Escape');

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
