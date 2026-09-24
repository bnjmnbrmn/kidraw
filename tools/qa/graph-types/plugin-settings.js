/*
 * Turning a plugin off in Settings (Ben, 2026-09-23: "make it so you can turn
 * off non-core plugins in the settings"). Drives the real Settings panel.
 *
 * With Todo Graph off, on a todo graph: its menu leaves root `t`, its command
 * says the plugin is off and changes nothing, `:type` stops offering it, and a
 * todo graph loaded while it is off asks whether to turn it back on; declined,
 * it still opens as a todo graph, with a notice, and accepted, the plugin is on
 * and its menu back (Ben, 2026-09-24). Turning it back on in Settings brings
 * the menu back, and the choice survives a reload.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const KM = "window.ng.getComponent(document.querySelector('app-keymenu'))";
const da = (page, expr) => page.evaluate(`(() => { const da = ${DA}; const km = ${KM}; return ${expr}; })()`);
// Commands sent from here run outside Angular's zone, so change detection is
// asked for explicitly: the keymenu's inputs and the header's status line
// follow it, as they do after a real key press.
const run = async (page, body) => {
  await page.evaluate(`(() => { const da = ${DA}; const km = ${KM}; ${body}
    window.ng.applyChanges(window.ng.getComponent(document.querySelector('app-root'))); })()`);
  await settled(page);
};
const statusText = page => page.evaluate(() => document.querySelector('.status-message')?.textContent ?? '');
const hasTypeMenu = page => da(page, `!!km.buildRootSubmenuConfig()['t']`);

async function toggleTodoGraph(page) {
  await page.click('.settings-dropdown > summary');
  const section = await page.$('.plugins-section');
  if (!(await section.evaluate(el => el.open))) await page.click('.plugins-section > summary');
  await page.click('input[data-plugin="todo-graph"]');
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

  await run(page, `const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true}));`);
  await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type todo-graph'});`);
  check('a todo graph offers its menu on t', await hasTypeMenu(page));

  await toggleTodoGraph(page);
  check('turning Todo Graph off says so', /Todo Graph: off/.test(await statusText(page)), await statusText(page));
  check('its menu leaves t', !(await hasTypeMenu(page)));

  await run(page, `da.drawingLayer.getDANodes()[0].isSelected = true;
    km.keyMenuOut.emit({kind: 'PLUGIN_COMMAND', call: {id: 'todo.setStatus', args: {status: 'done'}}});`);
  const tags = await da(page, `da.drawingLayer.getDANodes()[0].tags.join()`);
  check('its command says the plugin is off', /Todo Graph is turned off/.test(await statusText(page)),
    await statusText(page));
  check('and changes nothing', tags === '', tags);

  await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type default'});`);
  await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type'});`);
  const listed = await statusText(page);
  check(':type stops offering it', !listed.includes('todo-graph') && listed.includes('explanation'), listed);
  await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type todo-graph'});`);
  check(':type todo-graph is refused', /turned off/.test(await statusText(page)), await statusText(page));
  check('and the graph keeps its type', (await da(page, 'da.drawingLayer.diagramType')) === 'default');

  const todoGraph = await da(page, `JSON.stringify({...da.drawingLayer.serializeGraph(), diagramType: 'todo-graph'})`);
  const answer = (page, accept) => new Promise(resolve => page.once('dialog', async dialog => {
    const message = dialog.message();
    await (accept ? dialog.accept() : dialog.dismiss());
    resolve(message);
  }));
  let asked = answer(page, false);
  await run(page, `da.handleCommand({kind: 'LOAD_NAMED_GRAPH', graphSnapshot: ${todoGraph}});`);
  check('a todo graph loaded while it is off offers to turn it back on',
    /Todo Graph, is turned off in Settings\. Turn it back on\?/.test(await asked), await asked);
  check('a todo graph loaded while it is off opens as a todo graph',
    (await da(page, 'da.drawingLayer.diagramType')) === 'todo-graph');
  check('with a notice that its type is off', /Todo Graph, is turned off in Settings/.test(await statusText(page)),
    await statusText(page));

  await page.reload({waitUntil: 'networkidle'});
  await page.waitForSelector('#mainDrawingArea canvas');
  await settled(page);
  check('the choice survives a reload',
    !(await page.evaluate(() => JSON.parse(localStorage.getItem('kidraw-plugins-disabled') ?? '[]').length === 0)));

  await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type default'});`);
  await run(page, `const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true}));`);
  await toggleTodoGraph(page);
  check('turning it back on says so', /Todo Graph: on/.test(await statusText(page)), await statusText(page));
  await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type todo-graph'});`);
  check('and its menu is back on t', await hasTypeMenu(page));

  await toggleTodoGraph(page);
  await run(page, `da.handleCommand({kind: 'EX_COMMAND', text: 'type default'});`);
  asked = answer(page, true);
  await run(page, `da.handleCommand({kind: 'LOAD_NAMED_GRAPH', graphSnapshot: ${todoGraph}});`);
  await asked;
  await run(page, '');
  check('accepting the offer turns it back on', /Todo Graph: on/.test(await statusText(page)), await statusText(page));
  check('and its menu is on t', await hasTypeMenu(page));

  await page.evaluate(() => localStorage.removeItem('kidraw-plugins-disabled'));
  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
