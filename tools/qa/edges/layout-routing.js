/*
 * Layout and routing through the real app: a layout moves the nodes and
 * routes the edges it moved in the worker, and graph edits wait while it
 * runs; undo walks back to where the nodes were; a new edge is routed as it
 * is drawn. (Routing one selected edge had no key, and was retired on
 * 2026-09-24.)
 *
 * Written 2026-09-24 when layout and routing moved out of the drawing area
 * into a unit of their own, and run against the code before and after.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();

/** The basic sample, unzoomed at the origin, nothing selected. */
async function basic(page) {
  await page.evaluate(`(() => { const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await settled(page);
  await page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
    da.finishTweens(); dl.scale({x: 1, y: 1}); dl.x(0); dl.y(0); dl.unselectAll(); dl.batchDraw(); })()`);
}

/** Every status message from here on, in `window.said`. */
const listen = page => page.evaluate(`(() => { window.said = [];
  window.saidSub?.unsubscribe();
  window.saidSub = ${DA}.daOut.subscribe(n => { if (n.kind === 'status-message') window.said.push(n.message); }); })()`);
const said = page => page.evaluate('window.said');

const command = (page, body) => page.evaluate(`${DA}.handleCommand(${JSON.stringify(body)})`);
const routed = page => page.waitForFunction(`!${DA}.layout.running`, null, {timeout: 20000});

const positions = page => page.evaluate(`Object.fromEntries(${DA}.drawingLayer.getDANodes()
  .map(n => [n.label.text(), [Math.round(n.group.x()), Math.round(n.group.y())]]))`);
const edges = page => page.evaluate(`${DA}.drawingLayer.getDAEdges().map(e => ({
  name: e.srcNode.label.text() + '→' + e.destNode.label.text(),
  smooth: e.smoothRendering, points: e.controlPoints.length, waypoints: e.waypoints.length}))`);

(async () => {
  const browser = await launch();
  const page = await openApp(browser);

  // ── A layout ──
  await basic(page);
  const before = await positions(page);
  await listen(page);
  // In the same turn as the layout, while its worker is still out, try an edit.
  const during = await page.evaluate(`(() => { const da = ${DA};
    da.handleCommand({kind: 'APPLY_LAYOUT', layout: 'force-directed'});
    const running = da.layout.running;
    da.handleCommand({kind: 'CUT_SELECTION'});
    return {running, nodes: da.drawingLayer.getDANodes().length}; })()`);
  check('a layout routes in the worker, and a graph edit waits for it',
    during.running && during.nodes === 6 && (await said(page)).includes('Layout is running; graph edits are locked.'),
    JSON.stringify(during));
  await routed(page);
  await settled(page);
  const after = await positions(page);
  const moved = Object.keys(before).filter(name => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
  check('the layout moved the nodes', moved.length > 0, JSON.stringify(moved));
  const messages = await said(page);
  check('the countdown ran, and the status line was cleared or warned when it finished',
    messages.some(m => m.startsWith('Calculating layout…')) && /^$|could not be routed cleanly/.test(messages[messages.length - 1]),
    JSON.stringify(messages.slice(-2)));

  let presses = 0;
  while (presses < 3 && JSON.stringify(await positions(page)) !== JSON.stringify(before)) {
    await command(page, {kind: 'UNDO'});
    await settled(page);
    presses++;
  }
  check('undo brings the nodes back to where they were', JSON.stringify(await positions(page)) === JSON.stringify(before),
    `after ${presses} press(es)`);

  // ── A new edge, routed as it is drawn ──
  // From Start to a new node beyond End: the straight line would run through
  // Process, Decision and End.
  await basic(page);
  await listen(page);
  await page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
    const start = dl.getDANodes().find(n => n.label.text() === 'Start'); start.isSelected = true;
    const end = dl.getDANodes().find(n => n.label.text() === 'End');
    da.crosshairsLayer.crosshairs.x = end.group.x() + end.NODE_WIDTH + 200;
    da.crosshairsLayer.crosshairs.y = start.group.y() + start.NODE_HEIGHT / 2;
    da.crosshairsLayer.showCrosshairs(); })()`);
  await command(page, {kind: 'CREATE_NEW_NODE'});
  await page.keyboard.press('Escape');
  const drawn = (await edges(page)).find(edge => edge.name.startsWith('Start→') && edge.name !== 'Start→Process');
  check('a new edge is routed around the nodes in its way', drawn && drawn.waypoints > 0,
    `${JSON.stringify(drawn)} ${JSON.stringify(await said(page))}`);

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
