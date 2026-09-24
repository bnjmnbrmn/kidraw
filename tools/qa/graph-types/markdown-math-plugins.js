/*
 * Markdown and Math as plugins of their own, with dependencies followed
 * automatically and said out loud (Ben, 2026-09-23). Drives the real
 * Settings panel on an Explanation graph, whose labels are markdown.
 *
 *   Math off      → labels stay markdown, `$…$` is text
 *   Markdown off  → Explanation goes off with it (it needs Markdown), and
 *                   labels are plain
 *   Explanation on → Markdown comes back on with it; Math, which it only
 *                   uses, stays off
 *   Math on       → math again
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const da = (page, expr) => page.evaluate(`(() => { const da = ${DA}; return ${expr}; })()`);
const statusText = page => page.evaluate(() => document.querySelector('.status-message')?.textContent ?? '');
const syntax = page => da(page, `(n => n.labelFormat + (n.labelMath ? '+math' : ''))(da.drawingLayer.getDANodes()[0])`);
const readKey = page => page.evaluate(() => {
  const km = window.ng.getComponent(document.querySelector('app-keymenu'));
  return km.buildRootSubmenuConfig()[km.keyAssignments.reading.enter]?.actionLabel ?? null;
});

async function toggle(page, pluginId) {
  await page.click('.settings-dropdown > summary');
  const section = await page.$('.plugins-section');
  if (!(await section.evaluate(el => el.open))) await page.click('.plugins-section > summary');
  await page.click(`input[data-plugin="${pluginId}"]`);
  await page.click('.settings-dropdown > summary');
  await settled(page);
}

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await page.evaluate(() => localStorage.removeItem('kidraw-plugins-disabled'));
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForSelector('#mainDrawingArea canvas');
  await settled(page);
  await page.evaluate(`(() => { const da = ${DA};
    const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true}));
    da.handleCommand({kind: 'EX_COMMAND', text: 'type explanation'}); })()`);
  await settled(page);
  check('an explanation writes its labels in markdown, with math', (await syntax(page)) === 'markdown+math',
    await syntax(page));

  await toggle(page, 'math');
  check('Math off says so', (await statusText(page)) === 'Math: off', await statusText(page));
  check('labels stay markdown, without math', (await syntax(page)) === 'markdown', await syntax(page));

  await toggle(page, 'markdown');
  check('Markdown off takes Explanation with it, and says so',
    (await statusText(page)) === 'Markdown: off — and Explanation, which needs it', await statusText(page));
  check('labels are plain', (await syntax(page)) === 'plain', await syntax(page));
  check('the graph is still an explanation', (await da(page, 'da.drawingLayer.diagramType')) === 'explanation');
  check('and Read, which Explanation brings, leaves the keymenu', (await readKey(page)) === null, String(await readKey(page)));

  await toggle(page, 'explanation');
  check('Explanation on brings Markdown back, and says so',
    (await statusText(page)) === 'Explanation: on — and Markdown, which it needs', await statusText(page));
  check('labels are markdown again, still without math', (await syntax(page)) === 'markdown', await syntax(page));
  check('and Read is back', (await readKey(page)) === 'Read', String(await readKey(page)));

  await toggle(page, 'math');
  check('Math on says so', (await statusText(page)) === 'Math: on', await statusText(page));
  check('and math is back', (await syntax(page)) === 'markdown+math', await syntax(page));

  const hint = await page.evaluate(() =>
    document.querySelector('input[data-plugin="explanation"]')?.closest('label')?.querySelector('.plugin-hint')?.textContent?.trim());
  check('Settings says what Explanation needs and uses', hint === 'needs Markdown · uses Math and AI Chat', String(hint));

  await page.evaluate(() => localStorage.removeItem('kidraw-plugins-disabled'));
  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
