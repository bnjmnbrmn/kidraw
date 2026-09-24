/*
 * A plugin written as data, added without a rebuild (Ben, 2026-09-23).
 *
 * Adds docs/examples/kanban.kidraw-plugin.yaml through Settings > Plugins >
 * "Add a plugin from a file…", makes a graph a Kanban board with `:type`,
 * moves a card between columns with the plugin's own menu on root `t` (real
 * keys), and checks the plugin — and the graph's type — survive a reload.
 * Save hands back its file, for sharing. Removing the plugin takes it out of
 * `:type` and root `t`, and leaves the graph's type as it was.
 */
const path = require('path');
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const KANBAN = path.resolve(__dirname, '../../../docs/examples/kanban.kidraw-plugin.yaml');
const KM = "window.ng.getComponent(document.querySelector('app-keymenu'))";
const da = (page, expr) => page.evaluate(`(() => { const da = ${DA}; const km = ${KM}; return ${expr}; })()`);
// Commands sent from here run outside Angular's zone; ask for change detection
// so the keymenu and the header follow, as they do after a real key press.
const run = async (page, body) => {
  await page.evaluate(`(() => { const da = ${DA}; const km = ${KM}; ${body}
    window.ng.applyChanges(window.ng.getComponent(document.querySelector('app-root'))); })()`);
  await settled(page);
};
const statusText = page => page.evaluate(() => document.querySelector('.status-message')?.textContent ?? '');
const typeMenu = page => da(page, `(t => t ? {label: t.submenuLabel, entries: Object.entries(t.submenuConfig)
  .filter(([k]) => k !== '_repeatConfig').map(([k, v]) => k + ' ' + v.actionLabel)} : null)(km.buildRootSubmenuConfig()['t'])`);
const exType = async page => { await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type'});`); return statusText(page); };

async function reload(page) {
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForSelector('#mainDrawingArea canvas');
  await settled(page);
}

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await page.evaluate(() => { localStorage.removeItem('kidraw-user-plugins'); localStorage.removeItem('kidraw-plugins-disabled'); });
  await reload(page);

  await page.setInputFiles('input.plugin-file', KANBAN);
  await settled(page);
  check('adding the file says so', (await statusText(page)) === 'Added the Kanban plugin', await statusText(page));
  check('Settings lists it, with a Remove button', await page.evaluate(() =>
    !!document.querySelector('input[data-plugin="kanban"]') && !!document.querySelector('[data-remove-plugin="kanban"]')));

  await run(page, `const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true}));`);
  check(':type offers it', (await exType(page)).includes('kanban'), await statusText(page));
  await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type kanban'});`);
  check('a graph becomes a Kanban board', (await da(page, 'da.drawingLayer.diagramType')) === 'kanban');

  const menu = await typeMenu(page);
  check('its menu is on t, keys by the key rule', JSON.stringify(menu) === JSON.stringify({label: 'Kanban',
    entries: ['h Backlog', 'j Doing', 'k Review', 'l Done', 'n No Column']}), JSON.stringify(menu));

  await run(page, `da.drawingLayer.unselectAll(); da.drawingLayer.getDANodes()[0].isSelected = true;`);
  await page.keyboard.down('t');
  await page.waitForTimeout(250);
  await page.keyboard.press('j');
  await page.waitForTimeout(120);
  await page.keyboard.up('t');
  await settled(page);
  const card = await da(page, `(n => ({tags: n.tags.join(), badge: n.statusBadgeLabel}))(da.drawingLayer.getDANodes()[0])`);
  check('t→j moves the card to Doing, badge and all', card.tags === 'column/doing' && card.badge === 'DOING', JSON.stringify(card));
  check('and says so', (await statusText(page)) === 'Column: DOING', await statusText(page));

  await reload(page);
  check('the plugin survives a reload', (await exType(page)).includes('kanban'), await statusText(page));
  check('so does the board', (await da(page, 'da.drawingLayer.diagramType')) === 'kanban');
  check('with its menu', (await typeMenu(page))?.label === 'Kanban');

  await page.click('.settings-dropdown > summary');
  if (!(await page.$eval('.plugins-section', el => el.open))) await page.click('.plugins-section > summary');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-save-plugin="kanban"]')]);
  const saved = require('fs').readFileSync(await download.path(), 'utf8');
  check('Save hands back the plugin\'s file, to share', download.suggestedFilename() === 'kanban.kidraw-plugin.yaml'
    && saved === require('fs').readFileSync(KANBAN, 'utf8'), download.suggestedFilename());
  await page.click('[data-remove-plugin="kanban"]');
  await page.click('.settings-dropdown > summary');
  await settled(page);
  check('removing it says so', (await statusText(page)) === 'Removed the Kanban plugin', await statusText(page));
  check('its menu leaves t', (await typeMenu(page)) === null);
  check(':type stops offering it', !(await exType(page)).includes('kanban'), await statusText(page));
  check('and the graph keeps its type, for when it comes back', (await da(page, 'da.drawingLayer.diagramType')) === 'kanban');

  await page.evaluate(() => localStorage.removeItem('kidraw-user-plugins'));
  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
