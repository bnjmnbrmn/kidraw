/*
 * Where nodes overlap, commands act on the one the hover trace is around.
 *
 * Found 2026-09-23/24: several commands took the first node under the
 * crosshairs (the one underneath) while the hover trace showed the one on
 * top — Edit Text opened, Copy took, and Delete removed the node you could
 * not see. They now share one "node under the crosshairs": the topmost.
 * Each node case moves the basic sample's Process over Start and puts the
 * crosshairs where they overlap; the edge case crosses two edges and puts the
 * crosshairs on the crossing.
 *
 * And a waypoint within reach of the crosshairs, over a node: the select key
 * takes the waypoint, but the edit keys mean the node's text. Until
 * 2026-09-24 they selected the waypoint and entered label editing with
 * nothing to edit.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();

async function overlapped(page) {
  await page.evaluate(`(() => { const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await settled(page);
  return page.evaluate(`(() => { const da = ${DA};
    da.finishTweens();
    const nodes = da.drawingLayer.getDANodes();
    const [under, onTop] = [nodes[0], nodes[1]];
    onTop.group.position({x: under.group.x() + 15, y: under.group.y() + 5});
    onTop.group.moveToTop();
    da.drawingLayer.unselectAll();
    const a = under.getClientRect(), b = onTop.getClientRect();
    da.crosshairsLayer.crosshairs.x = (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2;
    da.crosshairsLayer.crosshairs.y = (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2;
    da.crosshairsLayer.showCrosshairs();
    const hover = da.crosshairHoverTarget();
    return {under: under.label.text(), onTop: onTop.label.text(),
      highlighted: nodes.find(n => n.id === hover?.id)?.label.text() ?? null};
  })()`);
}

const run = (page, command) => page.evaluate(`(() => { const da = ${DA};
  let said = ''; const sub = da.daOut.subscribe(n => { if (n.kind === 'status-message') said = n.message; });
  da.handleCommand(${JSON.stringify(command)}); sub.unsubscribe(); return said; })()`);
/** Two edges crossing at (460, 430), the crosshairs on the crossing. */
async function crossed(page) {
  return page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
    const node = (id, x, y, text) => ({id, x, y, text, width: 120, height: 60, fontSize: 14, isSelected: false});
    const edge = (id, srcNodeId, destNodeId) => ({id, srcNodeId, destNodeId, isSelected: false, labels: []});
    dl.restoreGraph({
      nodes: [node('da-1', 200, 200, 'A'), node('da-2', 600, 600, 'B'), node('da-3', 600, 200, 'C'), node('da-4', 200, 600, 'D')],
      edges: [edge('da-5', 'da-1', 'da-2'), edge('da-6', 'da-3', 'da-4')],
    });
    dl.scale({x: 1, y: 1}); dl.x(0); dl.y(0);
    dl.unselectAll();
    da.crosshairsLayer.crosshairs.x = 460;
    da.crosshairsLayer.crosshairs.y = 430;
    da.crosshairsLayer.showCrosshairs();
    dl.batchDraw();
    const name = id => { const e = dl.getDAEdges().find(e => e.id === id); return e.srcNode.label.text() + e.destNode.label.text(); };
    const hover = da.crosshairHoverTarget();
    return {under: da.getDAEdgesContainingCrosshairs().map(e => name(e.id)),
      highlighted: hover?.kind === 'edge' ? name(hover.id) : null};
  })()`);
}

const labels = page => page.evaluate(`${DA}.drawingLayer.getDANodes().map(n => n.label.text())`);
const selected = page => page.evaluate(`${DA}.drawingLayer.getDANodes().filter(n => n.isSelected).map(n => n.label.text())`);

(async () => {
  const browser = await launch();
  const page = await openApp(browser);

  let nodes = await overlapped(page);
  check('the hover trace is around the node on top', nodes.highlighted === nodes.onTop, JSON.stringify(nodes));
  await run(page, {kind: 'EDIT_TEXT_AT_CROSSHAIRS'});
  await settled(page);
  check('Edit Text opens the highlighted node', JSON.stringify(await selected(page)) === JSON.stringify([nodes.onTop]),
    JSON.stringify(await selected(page)));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  nodes = await overlapped(page);
  const copied = await run(page, {kind: 'COPY_SELECTION'});
  const clip = await page.evaluate(`${DA}.clipboard.held?.nodes.map(n => n.text) ?? []`);
  check('Copy takes the highlighted node', JSON.stringify(clip) === JSON.stringify([nodes.onTop]), `${copied} ${JSON.stringify(clip)}`);

  nodes = await overlapped(page);
  const widths = () => page.evaluate(`Object.fromEntries(${DA}.drawingLayer.getDANodes().map(n => [n.label.text(), n.NODE_WIDTH]))`);
  const narrow = await widths();
  await run(page, {kind: 'INCREASE_SELECTED_NODE_SIZE'});
  const wide = await widths();
  const grown = Object.keys(wide).filter(label => wide[label] !== narrow[label]);
  check('Grow Node resizes the highlighted node', JSON.stringify(grown) === JSON.stringify([nodes.onTop]), JSON.stringify(grown));

  nodes = await overlapped(page);
  const before = await labels(page);
  await run(page, {kind: 'DELETE'});
  const after = await labels(page);
  const deleted = before.filter(label => !after.includes(label));
  check('Delete removes the highlighted node, not the one beneath it',
    JSON.stringify(deleted) === JSON.stringify([nodes.onTop]), JSON.stringify(deleted));

  for (const kind of ['EDIT_TEXT_AT_CROSSHAIRS', 'EDIT_SELECTED']) {
    await page.evaluate(`(() => { const sel = document.querySelector('select.sample-graph-select');
      sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); })()`);
    await settled(page);
    const edited = await page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
      da.finishTweens(); dl.scale({x: 1, y: 1}); dl.x(0); dl.y(0); dl.unselectAll(); da.unselectAllLabels();
      const proc = dl.getDANodes().find(n => n.label.text() === 'Process');
      const e = dl.getDAEdges().find(e => e.srcNode === proc && e.destNode.label.text() === 'Action');
      const at = {x: proc.group.x() + proc.NODE_WIDTH / 2, y: proc.group.y() + proc.NODE_HEIGHT - 8};
      e.insertWaypointAt(at, 0);
      da.crosshairsLayer.crosshairs.x = at.x + 4; da.crosshairsLayer.crosshairs.y = at.y - 4;
      da.crosshairsLayer.showCrosshairs(); dl.batchDraw();
      const hover = da.crosshairHoverTarget()?.kind;
      da.handleCommand({kind: '${kind}'});
      return {hover, editing: dl.getDANodes().filter(n => n.isEditingText).map(n => n.label.text()),
        waypointSelected: dl.getSelectedDAWaypoints().length > 0}; })()`);
    check(`${kind === 'EDIT_SELECTED' ? 'Edit Selected' : 'Edit Text'} over a node, with a waypoint in reach, edits the node`,
      edited.hover === 'waypoint' && JSON.stringify(edited.editing) === '["Process"]' && !edited.waypointSelected,
      JSON.stringify(edited));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }

  const edges = await crossed(page);
  check('the crosshairs are on both edges, and the hover trace on one of them',
    edges.under.length === 2 && edges.highlighted !== null, JSON.stringify(edges));
  await run(page, {kind: 'EDIT_TEXT_AT_CROSSHAIRS'});
  const labelled = await page.evaluate(`${DA}.drawingLayer.getDAEdges().filter(e => e.labels.length > 0)
    .map(e => e.srcNode.label.text() + e.destNode.label.text())`);
  check('Edit Text labels the highlighted edge', JSON.stringify(labelled) === JSON.stringify([edges.highlighted]),
    JSON.stringify(labelled));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
