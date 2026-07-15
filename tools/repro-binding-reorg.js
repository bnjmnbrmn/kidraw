/*
 * Verify the 2026-07-13 keymenu binding reorg end to end with real key events
 * (vim profile, the default):
 *
 *   1. Root `a` opens the Insert submenu: hold a → tap d creates a node and
 *      releasing a drops into label-edit mode.
 *   2. Root `f` opens Move by graph: hold f → tap n (Jump Outgoing) moves the
 *      crosshairs to a neighbor node.
 *   3. Root `g` is unbound.
 *   4. The `m` File submenu has the new shape: n New, o Open… (vault),
 *      s Save As… (vault), i Import File…, e Export File…, and no
 *      Save Graph / Load Graph localStorage entries.
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
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      mode: km.keyMenu.currentMode.name,
      nodeCount: da.drawingLayer.getDANodes().length,
      xh: { x: da.crosshairsLayer.crosshairsX(), y: da.crosshairsLayer.crosshairsY() },
    };
  });

  // --- 4. Menu structure (static config probe) ---
  const menu = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const root = km.buildRootSubmenuConfig();
    const summarize = (entry) => entry ? { label: entry.actionLabel ?? entry.submenuLabel ?? null, ctor: entry.constructor.name } : null;
    const misc = km.buildMiscSubmenuConfig();
    const miscLabels = {};
    for (const [k, v] of Object.entries(misc)) {
      if (k !== '_repeatConfig') miscLabels[k] = v.actionLabel;
    }
    return { a: summarize(root['a']), f: summarize(root['f']), g: summarize(root['g']), m: summarize(root['m']), miscLabels };
  });
  check('root a is the Insert submenu', menu.a?.label === 'Insert...', JSON.stringify(menu.a));
  check('root f is Move by graph', menu.f?.label === 'Move by graph...', JSON.stringify(menu.f));
  check('root g toggles keyboard visibility', menu.g?.label === 'Hide Keyboard', JSON.stringify(menu.g));
  check('root m is File...', menu.m?.label === 'File...', JSON.stringify(menu.m));
  check('m→n New Graph', menu.miscLabels['n'] === 'New Graph', JSON.stringify(menu.miscLabels));
  check('m→o Open… (vault)', menu.miscLabels['o'] === 'Open…');
  check('m→s Save As… (vault)', menu.miscLabels['s'] === 'Save As…');
  check('m→i Import File…', menu.miscLabels['i'] === 'Import File…');
  check('m→e Export File…', menu.miscLabels['e'] === 'Export File…');
  const labels = Object.values(menu.miscLabels);
  check('no Save Graph / Load Graph entries', !labels.includes('Save Graph') && !labels.includes('Load Graph'), JSON.stringify(labels));

  // --- 1. Hold a → tap d inserts a node; release a → label edit ---
  // Park the crosshairs on empty canvas first.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    da.crosshairsLayer.crosshairs.x = 120;
    da.crosshairsLayer.crosshairs.y = 520;
  });
  let before = await state();
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('d');
  await page.waitForTimeout(120);
  await page.keyboard.up('a');
  await page.waitForTimeout(150);
  let s = await state();
  check('hold a + d inserts a node', s.nodeCount === before.nodeCount + 1, `${before.nodeCount} → ${s.nodeCount}`);
  check('releasing a after insert enters label edit', s.mode === 'labelEdit', s.mode);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  s = await state();
  check('escape escape returns to normal mode', s.mode === 'normal', s.mode);

  // --- 2. Hold f → tap n jumps along the graph ---
  // Put the crosshairs on a node that has an outgoing edge.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const src = dl.getDAEdges()[0].srcNode;
    const pos = src.group.position();
    const cx = pos.x + src.NODE_WIDTH / 2;
    const cy = pos.y + src.NODE_HEIGHT / 2;
    da.crosshairsLayer.crosshairs.x = cx * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = cy * dl.scaleY() + dl.y();
  });
  before = await state();
  await page.keyboard.down('f');
  await page.waitForTimeout(250);
  await page.keyboard.press('n'); // first press selects an outgoing edge
  await page.waitForTimeout(200);
  await page.keyboard.press('n'); // second press walks along it
  await page.waitForTimeout(400);
  await page.keyboard.up('f');
  await page.waitForTimeout(400);
  s = await state();
  const moved = Math.hypot(s.xh.x - before.xh.x, s.xh.y - before.xh.y) > 5;
  check('hold f + n,n selects an edge then traverses along it (crosshairs moved)', moved,
    `(${before.xh.x.toFixed(0)},${before.xh.y.toFixed(0)}) → (${s.xh.x.toFixed(0)},${s.xh.y.toFixed(0)})`);
  check('node count unchanged by traversal', s.nodeCount === before.nodeCount, `${s.nodeCount}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
