/*
 * If things are selected, a command acts on those things; only with nothing
 * selected does it consider what is under the crosshairs (Ben, 2026-09-24).
 *
 * Found 2026-09-18/24: pin toggled only the topmost node of a multi-node
 * selection, a waypoint under the crosshairs beat a node selection, and the
 * text-overflow command skipped past a selection of junctions to the node
 * under the crosshairs.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();

/** Four boxes and a junction in a row, A→B with a waypoint, the crosshairs on
 *  that waypoint, over box A. */
const setUp = page => page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
  const node = (id, x, text, shape) => ({id, x, y: 300, text, width: 120, height: 60, fontSize: 14, isSelected: false,
    ...(shape ? {nodeShape: shape} : {})});
  dl.restoreGraph({nodes: [node('da-1', 100, 'A'), node('da-2', 400, 'B'), node('da-3', 700, 'C'),
      node('da-4', 1000, 'D'), node('da-5', 1300, '', 'junction')],
    edges: [{id: 'da-6', srcNodeId: 'da-1', destNodeId: 'da-2', isSelected: false, labels: []}]});
  dl.scale({x: 1, y: 1}); dl.x(0); dl.y(0); da.finishTweens();
  const a = dl.getDANodes()[0];
  const at = {x: a.group.x() + a.NODE_WIDTH - 10, y: a.group.y() + a.NODE_HEIGHT / 2};
  dl.getDAEdges()[0].insertWaypointAt(at, 0);
  dl.unselectAll();
  Object.assign(da.crosshairsLayer.crosshairs, at);
  da.crosshairsLayer.showCrosshairs(); dl.batchDraw();
  return da.crosshairHoverTarget()?.kind ?? null;
})()`);

const state = page => page.evaluate(`(() => { const dl = ${DA}.drawingLayer;
  return {pinned: dl.getDANodes().filter(n => n.pinned).map(n => n.label.text()),
    waypointPinned: dl.getDAWaypoints().some(w => w.pinned),
    overflow: Object.fromEntries(dl.getDANodes().map(n => [n.label.text() || 'junction', n.textOverflowMode]))}; })()`);

const select = (page, labels) => page.evaluate(`(() => { const dl = ${DA}.drawingLayer;
  dl.getDANodes().forEach(n => { n.isSelected = ${JSON.stringify(labels)}.includes(n.label.text() || 'junction'); }); })()`);

const run = (page, command) => page.evaluate(`${DA}.handleCommand(${JSON.stringify(command)})`);

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await settled(page);

  const hover = await setUp(page);
  check('the crosshairs are on the waypoint', hover === 'waypoint', String(hover));
  await select(page, ['B', 'C', 'D']);
  await run(page, {kind: 'TOGGLE_PIN_SELECTED'});
  let s = await state(page);
  check('pin takes every selected node', JSON.stringify(s.pinned) === '["B","C","D"]', JSON.stringify(s.pinned));
  check('and not the waypoint under the crosshairs', !s.waypointPinned, JSON.stringify(s));

  await page.evaluate(`${DA}.drawingLayer.getDANodes()[2].pinned = false`);
  await run(page, {kind: 'TOGGLE_PIN_SELECTED'});
  s = await state(page);
  check('a partly pinned selection pins the rest', JSON.stringify(s.pinned) === '["B","C","D"]', JSON.stringify(s.pinned));
  await run(page, {kind: 'TOGGLE_PIN_SELECTED'});
  s = await state(page);
  check('a fully pinned selection unpins all of it', s.pinned.length === 0, JSON.stringify(s.pinned));

  await select(page, []);
  await run(page, {kind: 'TOGGLE_PIN_SELECTED'});
  s = await state(page);
  check('with nothing selected, pin takes the waypoint under the crosshairs', s.waypointPinned && s.pinned.length === 0,
    JSON.stringify(s));

  await setUp(page);
  const before = (await state(page)).overflow;
  await select(page, ['junction']);
  await run(page, {kind: 'SET_TEXT_OVERFLOW_MODE', mode: before.A === 'clip' ? 'wrap' : 'clip'});
  s = await state(page);
  check('text overflow with only a junction selected leaves the node under the crosshairs alone',
    JSON.stringify(s.overflow) === JSON.stringify(before), JSON.stringify({before, after: s.overflow}));

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
