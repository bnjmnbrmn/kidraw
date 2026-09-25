/*
 * Center menus (notes/idea-center-menus.md, first version 2026-09-25): File →
 * Save As…, Open… and Diagram Type…, driven with real keys.
 *
 * The vault is an in-memory stand-in put where the real one would be: the
 * real vault starts with a folder picker that needs a user gesture, which a
 * headless browser cannot give. What is checked is everything after that.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const KM = "window.ng.getComponent(document.querySelector('app-keymenu'))";

const da = (page, expr) => page.evaluate(`(() => { const da = ${DA}; return ${expr}; })()`);
const mode = page => page.evaluate(`${KM}.keyMenu.currentMode.name`);
const menu = page => page.evaluate(() => {
  const el = document.querySelector('.center-menu');
  if (!el) return null;
  return {
    title: el.querySelector('.title')?.textContent.trim(),
    field: el.querySelector('.field')?.value,
    focused: document.activeElement === el.querySelector('.field'),
    rows: [...el.querySelectorAll('.row .label')].map(r => r.textContent.trim()),
    highlighted: el.querySelector('.row.highlighted .label')?.textContent.trim() ?? null,
  };
});
const graphSize = page => da(page, `({nodes: da.drawingLayer.getDANodes().length, edges: da.drawingLayer.getDAEdges().length})`);

/** Hold the File hub and tap one of its keys. */
async function fileMenu(page, child) {
  const hub = await page.evaluate(`${KM}.keyAssignments.misc.submenu`);
  await page.keyboard.down(hub);
  await page.waitForTimeout(250);
  await page.keyboard.press(child);
  await page.waitForTimeout(80);
  await page.keyboard.up(hub);
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await page.evaluate(() => { window.confirm = () => true; });

  // An in-memory vault where the real one would be.
  await page.evaluate(`(() => {
    const files = new Map();
    window.__vaultFiles = files;
    const vs = ${DA}.vaultService;
    vs._vault = {
      name: 'test-vault',
      list: async () => [...files.keys()].sort(),
      read: async path => files.has(path) ? files.get(path).content : null,
      write: async (path, content) => { files.set(path, {content, at: Date.now()}); },
      delete: async path => { files.delete(path); },
      lastModified: async path => files.get(path)?.at ?? null,
    };
    vs._status = 'connected';
  })()`);

  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await settled(page);
  const basic = await graphSize(page);

  // ── Save As ──
  await fileMenu(page, 'k');
  let m = await menu(page);
  check('Save As opens a center menu with the field focused and a suggested name',
    m?.title === 'Save in vault as' && m.focused && m.field === 'graph.kidraw.yaml', JSON.stringify(m));
  check('the keymenu stands aside and shows the menu\'s keys', await mode(page) === 'surfaceCenterMenu', await mode(page));
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => [...window.__vaultFiles.keys()]);
  check('Enter saves under the typed name', saved.includes('first.kidraw.yaml'), JSON.stringify(saved));
  check('the menu closes and the keymenu comes back', !(await menu(page)) && await mode(page) === 'normal',
    await mode(page));

  // ── Open ──
  await da(page, `da.handleCommand({kind: 'NEW_GRAPH'})`);
  await settled(page);
  await page.evaluate(() => window.__vaultFiles.set('other.kidraw.yaml',
    {content: window.__vaultFiles.get('first.kidraw.yaml').content, at: Date.now()}));
  await fileMenu(page, 'o');
  m = await menu(page);
  check('Open lists the vault\'s graph files', m?.title === 'Open from vault'
    && JSON.stringify(m.rows) === '["first.kidraw.yaml","other.kidraw.yaml"]', JSON.stringify(m));
  await page.keyboard.type('oth');
  await page.waitForTimeout(100);
  m = await menu(page);
  check('typing filters the list', JSON.stringify(m?.rows) === '["other.kidraw.yaml"]', JSON.stringify(m?.rows));
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.down('Control');
  await page.keyboard.press('j');
  await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  m = await menu(page);
  check('clearing the filter lists everything again', m?.rows.length === 2, JSON.stringify(m?.rows));
  check('Ctrl-J moves down the list', m?.highlighted === 'other.kidraw.yaml', JSON.stringify(m));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await settled(page);
  const opened = await graphSize(page);
  check('Enter opens the highlighted file', opened.nodes === basic.nodes && opened.edges === basic.edges
    && await da(page, `da.vaultService.currentFilePath`) === 'other.kidraw.yaml',
    `${JSON.stringify(opened)} ${await da(page, `da.vaultService.currentFilePath`)}`);

  await fileMenu(page, 'o');
  m = await menu(page);
  check('the open file starts highlighted', m?.highlighted === 'other.kidraw.yaml', JSON.stringify(m));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape closes without opening anything', !(await menu(page)) && await mode(page) === 'normal'
    && await da(page, `da.vaultService.currentFilePath`) === 'other.kidraw.yaml', await mode(page));

  // ── Diagram Type ──
  await fileMenu(page, 'y');
  m = await menu(page);
  check('Diagram Type lists the types, the current one highlighted', m?.title === 'Diagram type'
    && m.rows.length >= 2 && m.highlighted === m.rows[0], JSON.stringify(m));
  await page.keyboard.type('todo');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('choosing a type sets it', await da(page, `da.drawingLayer.diagramType`) === 'todo-graph',
    await da(page, `da.drawingLayer.diagramType`));
  await da(page, `da.handleCommand({kind: 'UNDO'})`);
  await settled(page);
  check('and it undoes', await da(page, `da.drawingLayer.diagramType`) === 'default',
    await da(page, `da.drawingLayer.diagramType`));

  await da(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type'})`);
  await page.waitForTimeout(200);
  m = await menu(page);
  check(':type on its own opens the same menu', m?.title === 'Diagram type', JSON.stringify(m));
  await page.keyboard.press('Escape');

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
