/* Repro for da-200: the compact keymenu panel. Toggle key cycles
 * keyboard → compact → hidden → keyboard; in compact display the panel
 * lists [key|Action] rows and holding a submenu key indents its children
 * beneath its row. */
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
  const page = await (await browser.newContext({viewport: {width: 1600, height: 1000}})).newPage();
  page.on('pageerror', error => console.error('[page error]', error.message));
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});

  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      toggle: km.keyAssignments.root.toggleVisibility,
      moveByNode: km.keyAssignments.moveByNode.submenu,
      insert: km.keyAssignments.root.insertSubmenu ?? 'a',
    };
  });
  console.log('keys:', JSON.stringify(keys));

  const display = () => page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-root')).keymenuDisplay);
  const panel = () => page.evaluate(() => {
    const el = document.querySelector('app-compact-keymenu');
    if (!el) return null;
    const rows = [...el.querySelectorAll('.row')].map(r => ({
      key: r.querySelector('.key')?.textContent?.trim(),
      label: r.querySelector('.label')?.textContent?.trim(),
      depth: Math.round((parseFloat(r.style.paddingLeft) - 8) / 16),
      held: r.classList.contains('held'),
    }));
    return {rows, mode: el.querySelector('.mode-line')?.textContent?.trim()};
  });

  // 1. Cycle: keyboard → compact
  check('starts in keyboard display', (await display()) === 'keyboard');
  await page.keyboard.press(keys.toggle);
  await page.waitForTimeout(200);
  check('toggle switches to compact display', (await display()) === 'compact');
  const compact = await panel();
  check('compact panel renders', !!compact && compact.rows.length > 0,
    `rows=${compact?.rows.length}`);
  const rootRow = compact.rows.find(r => r.label === 'Move by node...');
  check('root rows include Move by node with its key', !!rootRow && rootRow.key === keys.moveByNode,
    JSON.stringify(rootRow));
  const addRow = compact.rows.find(r => r.key === keys.insert);
  check('root rows include the Add key', !!addRow, JSON.stringify(addRow));
  check('all visible rows are root depth', compact.rows.every(r => r.depth === 0));

  // 2. Hold g → children indent beneath the Move by node row
  await page.keyboard.down(keys.moveByNode);
  await page.waitForTimeout(250);
  const held = await panel();
  const heldRow = held.rows.find(r => r.label === 'Move by node...');
  check('held submenu row is highlighted', !!heldRow && heldRow.held, JSON.stringify(heldRow));
  const children = held.rows.filter(r => r.depth === 1);
  check('held g reveals indented children', children.length > 0, `children=${children.length}`);
  const childLabels = children.map(r => r.label);
  check('children include directional jumps',
    childLabels.some(l => /jump|left|right|up|down/i.test(l)), JSON.stringify(childLabels.slice(0, 8)));
  const heldIdx = held.rows.findIndex(r => r.label === 'Move by node...');
  const firstChildIdx = held.rows.findIndex(r => r.depth === 1);
  check('children sit directly beneath their parent row', firstChildIdx === heldIdx + 1,
    `parent@${heldIdx} firstChild@${firstChildIdx}`);

  // 3. Release → children collapse
  await page.keyboard.up(keys.moveByNode);
  await page.waitForTimeout(250);
  const released = await panel();
  check('release collapses the children',
    released.rows.every(r => r.depth === 0), `rows=${released.rows.length}`);

  // 4. Cycle onward: compact → hidden → keyboard
  await page.keyboard.press(keys.toggle);
  await page.waitForTimeout(200);
  check('second toggle hides everything', (await display()) === 'hidden');
  check('panel is gone when hidden', (await panel()) === null);
  await page.keyboard.press(keys.toggle);
  await page.waitForTimeout(200);
  check('third toggle returns to keyboard', (await display()) === 'keyboard');

  // 5. Keys still drive the graph while in compact display
  await page.keyboard.press(keys.toggle);   // back to compact
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    return da.drawingLayer.getDANodes().length;
  });
  await page.keyboard.press(keys.insert);   // add a node
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    return da.drawingLayer.getDANodes().length;
  });
  check('keys still work with the compact panel showing', after === before + 1,
    `${before} -> ${after}`);

  await page.screenshot({path: 'test-output/compact-keymenu.png'});
  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
