/*
 * The file region, which had no cover at all.
 *
 * Loading a sample, starting a new graph, saving and reloading a named graph,
 * and the diagram-type command are ~700 lines of drawing-area.component.ts and
 * were guarded by nothing — no unit spec, no browser script. This is the
 * minimum net to refactor that region behind: it drives the flows a user
 * actually reaches from the keymenu and checks the graph and the file state
 * that results.
 *
 * Not covered here: anything needing the File System Access API. Open, Save As,
 * Export Zip and the whole vault surface all begin with a picker that requires
 * a real user gesture, so they cannot be driven headlessly. That remains a
 * hole, and a deliberate one.
 */
const {launch, openApp, settled, afterFrame, checker, DA} = require('../harness.js');

const check = checker();
const da = (page, expr) => page.evaluate(`(() => { const da = ${DA}; return ${expr}; })()`);
const run = (page, body) => page.evaluate(`(() => { const da = ${DA}; ${body} })()`);

const loadSample = async (page, id) => {
  await run(page, `const sel = document.querySelector('select.sample-graph-select');
    sel.value = '${id}'; sel.dispatchEvent(new Event('change', {bubbles: true}));`);
  await settled(page);
};

(async () => {
  const browser = await launch();
  const page = await openApp(browser);

  // Notifications the drawing area sends out, so file-state can be observed.
  await page.evaluate(`(() => {
    const da = ${DA};
    window.__daOut = [];
    da.daOut.subscribe(n => window.__daOut.push(n));
  })()`);

  // ---- load a sample graph ------------------------------------------------
  await loadSample(page, 'basic');
  const loaded = await da(page, `({
    nodes: da.drawingLayer.getDANodes().length,
    edges: da.drawingLayer.getDAEdges().length,
  })`);
  check('loading a sample graph populates the canvas',
    loaded.nodes > 0 && loaded.edges > 0, JSON.stringify(loaded));

  // ---- save it under a name, then change the graph ------------------------
  await run(page, `da.handleCommand({kind: 'SAVE_GRAPH_AS', name: 'qa-file-flows'});`);
  await afterFrame(page);
  const savedMessage = await da(page,
    `(window.__daOut.filter(n => n.kind === 'status-message').pop() || {}).message`);
  check('saving under a name says so', /qa-file-flows/.test(savedMessage || ''), String(savedMessage));

  const stored = await da(page,
    `da.graphStorage.graphs().some(g => g.name === 'qa-file-flows')`);
  check('the named graph reaches storage', stored, stored ? 'found' : 'not in the list');

  // ---- new graph clears it ------------------------------------------------
  await page.evaluate(() => { window.confirm = () => true; });
  await run(page, `da.handleCommand({kind: 'NEW_GRAPH'});`);
  await settled(page);
  const emptied = await da(page, `({
    nodes: da.drawingLayer.getDANodes().length,
    edges: da.drawingLayer.getDAEdges().length,
  })`);
  check('new graph clears the canvas', emptied.nodes === 0 && emptied.edges === 0,
    JSON.stringify(emptied));

  // ---- and reloading the named graph brings it back -----------------------
  const snapshot = await da(page,
    `da.graphStorage.graphs().filter(g => g.name === 'qa-file-flows').pop().data`);
  await page.evaluate(`(() => {
    const da = ${DA};
    da.handleCommand({kind: 'LOAD_NAMED_GRAPH', graphSnapshot: ${JSON.stringify(snapshot)}});
  })()`);
  await settled(page);
  const restored = await da(page, `({
    nodes: da.drawingLayer.getDANodes().length,
    edges: da.drawingLayer.getDAEdges().length,
  })`);
  check('reloading the named graph restores it',
    restored.nodes === loaded.nodes && restored.edges === loaded.edges,
    `${JSON.stringify(restored)} vs ${JSON.stringify(loaded)}`);

  // ---- new graph drops the undo history it just invalidated ---------------
  await run(page, `da.handleCommand({kind: 'NEW_GRAPH'});`);
  await settled(page);
  const undoDepth = await da(page, `da.undoRedoService.undoStack.length`);
  check('new graph leaves nothing to undo into', undoDepth === 0, `undoStack=${undoDepth}`);

  // ---- diagram type ------------------------------------------------------
  await loadSample(page, 'basic');
  await run(page, `da.handleCommand({kind: 'SET_DIAGRAM_TYPE', typeId: 'explanation'});`);
  await afterFrame(page);
  const typed = await da(page,
    `(window.__daOut.filter(n => n.kind === 'status-message').pop() || {}).message`);
  check('setting the diagram type reports the type it chose',
    /Diagram type:/.test(typed || ''), String(typed));

  await run(page, `da.handleCommand({kind: 'SET_DIAGRAM_TYPE', typeId: 'no-such-type'});`);
  await afterFrame(page);
  const refused = await da(page,
    `(window.__daOut.filter(n => n.kind === 'status-message').pop() || {}).message`);
  check('an unknown diagram type is refused, not applied',
    /Unknown diagram type/.test(refused || ''), String(refused));

  // ---- the header is told which file is open ------------------------------
  const sawFileState = await page.evaluate(() =>
    window.__daOut.some(n => n.kind === 'file-state-update'));
  check('a file-state notification reaches the header', sawFileState,
    sawFileState ? 'seen' : 'none seen');

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
