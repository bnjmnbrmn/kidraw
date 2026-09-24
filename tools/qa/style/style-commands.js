/*
 * The style commands, through the real app: node size, text size and
 * overflow, shape, an edge's direction and line style, colour — each on the
 * node or edge under the crosshairs with nothing selected — and the defaults
 * that a shape or edge-style command sets for what is drawn next.
 *
 * Written 2026-09-24 when the commands moved out of the drawing area into a
 * unit of their own, and run against the code before and after the move.
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

/** Put the crosshairs on a layer point. */
const aim = (page, point) => page.evaluate(`(() => { const da = ${DA};
  da.crosshairsLayer.crosshairs.x = ${point.x}; da.crosshairsLayer.crosshairs.y = ${point.y};
  da.crosshairsLayer.showCrosshairs(); })()`);

const nodeCentre = (page, text) => page.evaluate(`(() => {
  const n = ${DA}.drawingLayer.getDANodes().find(n => n.label.text() === ${JSON.stringify(text)});
  return {x: n.group.x() + n.NODE_WIDTH / 2, y: n.group.y() + n.NODE_HEIGHT / 2}; })()`);

/** The middle of the straight edge from `src` to `dest`. */
const edgeMiddle = (page, src, dest) => page.evaluate(`(() => {
  const e = ${DA}.drawingLayer.getDAEdges().find(e =>
    e.srcNode.label.text() === ${JSON.stringify(src)} && e.destNode.label.text() === ${JSON.stringify(dest)});
  const points = e.getPathPoints(); const [a, b] = [points[0], points[points.length - 1]];
  return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; })()`);

/** Aim at a node's centre as it is now: the sample draws its nodes unfitted,
 *  so the first command that touches one fits it to its text and it shrinks
 *  out from under crosshairs aimed at its old centre. */
const onNode = async (page, text) => aim(page, await nodeCentre(page, text));

/** Run a command; what the status line said. */
const run = (page, command) => page.evaluate(`(() => { const da = ${DA};
  let said = ''; const sub = da.daOut.subscribe(n => { if (n.kind === 'status-message') said = n.message; });
  da.handleCommand(${JSON.stringify(command)}); sub.unsubscribe(); da.finishTweens(); return said; })()`);

const snapshot = page => page.evaluate(`${DA}.drawingLayer.serializeGraph()`);
const nodeNamed = async (page, text) => (await snapshot(page)).nodes.find(n => n.text === text);
const edgeBetween = async (page, src, dest) => {
  const graph = await snapshot(page);
  const id = text => graph.nodes.find(n => n.text === text)?.id;
  return graph.edges.find(e => e.srcNodeId === id(src) && e.destNodeId === id(dest));
};
const fillOf = (page, text) => page.evaluate(`${DA}.drawingLayer.getDANodes()
  .find(n => n.label.text() === ${JSON.stringify(text)})._shape.fill()`);

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await basic(page);

  // ── Nodes, under the crosshairs ──
  await onNode(page, 'Action');
  const plain = await nodeNamed(page, 'Action');
  await run(page, {kind: 'INCREASE_SELECTED_NODE_SIZE'});
  const bigger = await nodeNamed(page, 'Action');
  await onNode(page, 'Action');
  await run(page, {kind: 'DECREASE_SELECTED_NODE_SIZE'});
  const back = await nodeNamed(page, 'Action');
  check('Grow Node and Shrink Node change the node under the crosshairs, and undo each other',
    bigger.baseWidth === plain.baseWidth + 20 && back.baseWidth === plain.baseWidth,
    `${plain.baseWidth} → ${bigger.baseWidth} → ${back.baseWidth}`);

  await onNode(page, 'Action');
  await run(page, {kind: 'INCREASE_SELECTED_TEXT_SIZE'});
  const larger = await nodeNamed(page, 'Action');
  await onNode(page, 'Action');
  await run(page, {kind: 'DECREASE_SELECTED_TEXT_SIZE'});
  const smaller = await nodeNamed(page, 'Action');
  check('the text size keys step the font by 2', larger.fontSize === plain.fontSize + 2 && smaller.fontSize === plain.fontSize,
    `${plain.fontSize} → ${larger.fontSize} → ${smaller.fontSize}`);

  await onNode(page, 'Action');
  await run(page, {kind: 'SET_TEXT_OVERFLOW_MODE', mode: 'ellipsis'});
  check('Text Overflow sets the mode', (await nodeNamed(page, 'Action')).textOverflowMode === 'ellipsis');

  const shapes = [];
  for (const command of [{kind: 'TOGGLE_NODE_SHAPE'}, {kind: 'TOGGLE_NODE_SHAPE'}, {kind: 'SET_NODE_SHAPE', shape: 'diamond'}]) {
    await onNode(page, 'Action');
    await run(page, command);
    shapes.push((await nodeNamed(page, 'Action')).nodeShape ?? 'box');
  }
  check('the shape toggle flips box and circle; Set Shape sets any', JSON.stringify(shapes) === '["circle","box","diamond"]',
    JSON.stringify(shapes));

  await onNode(page, 'Action');
  const red = await run(page, {kind: 'SET_ITEM_COLOR', color: 'red'});
  check('Colour paints the node under the crosshairs and says so', red === 'Red: 1 node' && await fillOf(page, 'Action') === '#ffcccc',
    `${red} ${await fillOf(page, 'Action')}`);

  // ── Edges, under the crosshairs ──
  await aim(page, await edgeMiddle(page, 'Start', 'Process'));
  await run(page, {kind: 'SET_LINE_STYLE', lineStyle: 'dashed'});
  await run(page, {kind: 'SET_EDGE_DIRECTEDNESS', directedness: 'undirected'});
  const restyled = await edgeBetween(page, 'Start', 'Process');
  check('Line Style and Direction restyle the edge under the crosshairs',
    restyled.lineStyle === 'dashed' && restyled.directedness === 'undirected', JSON.stringify(restyled));
  const blue = await run(page, {kind: 'SET_ITEM_COLOR', color: 'blue'});
  check('Colour paints the edge under the crosshairs and says so', blue === 'Blue: 1 link', blue);

  // ── Nothing there: the defaults for what comes next ──
  await aim(page, {x: 1100, y: 700});
  const refused = await run(page, {kind: 'SET_LINE_STYLE', lineStyle: 'dotted'});
  check('an edge style with no edge says what to do', refused === 'Select or hover an edge to change line style', refused);
  const flipped = await run(page, {kind: 'TOGGLE_NODE_SHAPE'});
  check('the shape toggle over empty canvas flips the default', flipped === 'Default node shape: circle', flipped);
  await run(page, {kind: 'SET_DEFAULT_LINE_STYLE', lineStyle: 'dotted'});
  await run(page, {kind: 'SET_DEFAULT_EDGE_DIRECTEDNESS', directedness: 'bidirectional'});

  // A new node from the selected End: it takes the default shape, and the
  // edge to it the default line style and direction.
  await page.evaluate(`(() => { const dl = ${DA}.drawingLayer;
    dl.getDANodes().find(n => n.label.text() === 'End').isSelected = true; })()`);
  await run(page, {kind: 'CREATE_NEW_NODE'});
  await page.keyboard.press('Escape');
  const graph = await snapshot(page);
  const created = graph.nodes.find(n => !['Start', 'Process', 'Decision', 'End', 'Action', 'Result'].includes(n.text));
  const end = graph.nodes.find(n => n.text === 'End');
  const wired = graph.edges.find(e => e.srcNodeId === end.id && e.destNodeId === created?.id);
  check('a new node takes the default shape', created?.nodeShape === 'circle', JSON.stringify(created?.nodeShape));
  check('its edge takes the default line style and direction',
    wired?.lineStyle === 'dotted' && wired?.directedness === 'bidirectional', JSON.stringify(wired));

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
