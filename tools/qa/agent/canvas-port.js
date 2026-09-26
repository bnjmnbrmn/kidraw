/*
 * The agent's canvas surface (CanvasPort), exactly as agent mode holds
 * it — the object the shell attached to agent mode (AgentStore), which hands
 * it on to the agent service when a session starts — driven without an
 * agent server: reading the graph, selection and view; pointing at a node
 * without moving the selection, and telling the user's view changes from
 * its own; highlighting; and a batch of changes applied as one undo group
 * and reverted as a change set.
 *
 * Written 2026-09-24 when the surface moved out of the drawing area into a
 * unit of its own, and run against the code before and after.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const APP = "window.ng.getComponent(document.querySelector('app-root'))";
/** Evaluate `expr` with `canvas` (what the agent holds) and `da` in scope. */
const on = (page, expr) => page.evaluate(`(async () => { const canvas = ${APP}.agent.attachment.canvas; const da = ${DA};
  return ${expr}; })()`);

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await page.evaluate(`(() => { const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await settled(page);
  await on(page, `(() => { const dl = da.drawingLayer; da.finishTweens(); dl.scale({x: 1, y: 1}); dl.x(0); dl.y(0);
    dl.unselectAll(); dl.batchDraw(); })()`);
  const ids = await on(page, `Object.fromEntries(canvas.nodes().map(n => [n.label, n.id]))`);

  // ── Reading ──
  check('it lists the nodes and edges', Object.keys(ids).length === 6 && await on(page, `canvas.edges().length`) === 6,
    JSON.stringify(ids));
  const edge = await on(page, `canvas.edges().find(e => e.from === ${JSON.stringify(ids.Start)})`);
  check('an edge names its ends', edge?.to === ids.Process, JSON.stringify(edge));
  const selection = await on(page, `(() => {
    da.drawingLayer.getDANodes().find(n => n.label.text() === 'Process').isSelected = true;
    const start = da.drawingLayer.getDANodes().find(n => n.label.text() === 'Start');
    da.crosshairsLayer.crosshairs.x = start.group.x() + start.NODE_WIDTH / 2;
    da.crosshairsLayer.crosshairs.y = start.group.y() + start.NODE_HEIGHT / 2;
    return canvas.selection(); })()`);
  check('the selection, and the node under the crosshairs',
    JSON.stringify(selection) === JSON.stringify({nodeIds: [ids.Process], edgeIds: [], underCrosshairsId: ids.Start}),
    JSON.stringify(selection));
  check('the zoom and the diagram type', await on(page, `canvas.zoomPercent()`) === 100 &&
    await on(page, `canvas.diagramTypeId()`) === 'default');
  const visible = await on(page, `canvas.visibleNodeIds().length`);
  check('every node of the sample is in view', visible === 6, String(visible));
  const rect = await on(page, `(() => { const r = canvas.nodeClientRect(${JSON.stringify(ids.Start)});
    const n = da.drawingLayer.getDANodes().find(n => n.label.text() === 'Start');
    const c = da.stage.container().getBoundingClientRect();
    return {ok: r.width === n.NODE_WIDTH && r.left === c.left + n.group.x(), r}; })()`);
  check('a node\'s place on the page', rect.ok, JSON.stringify(rect.r));
  const view = await on(page, `canvas.viewClientRect()`);
  check('the usable view\'s place on the page', view.width > 0 && view.height > 0, JSON.stringify(view));

  // ── Pointing ──
  const views = await on(page, `(() => { window.viewChanges = 0;
    window.viewSub = da.daOut.subscribe(n => { if (n.kind === 'view-changed-by-user') window.viewChanges++; });
    return canvas.focusNode(${JSON.stringify(ids.End)}); })()`);
  await page.waitForTimeout(800);
  const pointed = await on(page, `({moved: da.drawingLayer.x() !== 0, changes: window.viewChanges,
    selected: da.drawingLayer.getSelectedDANodes().map(n => n.label.text())})`);
  check('pointing at a node pans the view onto it, leaves the selection, and is not the user\'s view change',
    views === true && pointed.moved && pointed.changes === 0 && JSON.stringify(pointed.selected) === '["Process"]',
    JSON.stringify(pointed));
  check('pointing at a node that is not there says so', await on(page, `canvas.focusNode('nope')`) === false);
  await page.waitForTimeout(300);
  const userMoved = await on(page, `(() => { da.drawingLayer.x(da.drawingLayer.x() + 40); return window.viewChanges; })()`);
  check('the user moving the view is told apart', userMoved === 1, String(userMoved));

  const lit = await on(page, `(() => { canvas.setHighlights([${JSON.stringify(ids.Start)}]);
    const lit = da.drawingLayer.getDANodes().filter(n => n.agentHighlighted).map(n => n.label.text());
    canvas.setHighlights([]);
    return {lit, after: da.drawingLayer.getDANodes().filter(n => n.agentHighlighted).length}; })()`);
  check('highlights are set and cleared', JSON.stringify(lit) === '{"lit":["Start"],"after":0}', JSON.stringify(lit));

  // ── Changing ──
  const meta = {author: 'agent:qa', label: 'Agent: add a step', changeSetId: 'qa-turn-1'};
  const result = await on(page, `canvas.applyChanges([
    {kind: 'add_node', text: 'Review', handle: 'r', near: ${JSON.stringify(ids.End)}},
    {kind: 'add_edge', from: ${JSON.stringify(ids.End)}, to: 'r'},
  ], ${JSON.stringify(meta)})`);
  const grown = await on(page, `({nodes: canvas.nodes().map(n => n.label), edges: canvas.edges().length})`);
  check('a batch of changes is applied', result.ok && grown.nodes.includes('Review') && grown.edges === 7,
    `${JSON.stringify(result)} ${JSON.stringify(grown)}`);
  const conflict = await on(page, `canvas.revertChangeSet('qa-turn-1')`);
  const reverted = await on(page, `({nodes: canvas.nodes().length, edges: canvas.edges().length})`);
  check('and reverted as one change set', conflict === null && reverted.nodes === 6 && reverted.edges === 6,
    `${conflict} ${JSON.stringify(reverted)}`);

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
