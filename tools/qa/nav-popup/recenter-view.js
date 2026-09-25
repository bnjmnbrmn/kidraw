/*
 * Recenter View (RECENTER_VIEW): with nothing selected it is the rescue
 * command — fit the whole graph into the usable view (between the header and
 * the keymenu) and center it there, with the crosshairs on its center; with a
 * selection, center on the selection at the same zoom.
 *
 * Found 2026-09-24: it centered on half the usable view's size measured from
 * the top of the stage, not on the usable view's center, so everything sat
 * higher by the header's height — the crosshairs landed below the graph's
 * center, and a graph that filled the view went under the header.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();

/** The content's box on the stage, the crosshairs, and the usable view. */
const measure = (page, only) => page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer; const s = dl.scaleX();
  const nodes = dl.getDANodes().filter(n => ${JSON.stringify(only ?? null)} === null || ${JSON.stringify(only ?? [])}.includes(n.label.text()));
  const points = nodes.flatMap(n => [{x: n.group.x(), y: n.group.y()}, {x: n.group.x() + n.NODE_WIDTH, y: n.group.y() + n.NODE_HEIGHT}])
    .concat(${JSON.stringify(only ?? null)} === null ? dl.getDAEdges().flatMap(e => e.getPathPoints()) : []);
  const box = {minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y))};
  const onStage = {top: dl.y() + box.minY * s, bottom: dl.y() + box.maxY * s,
    left: dl.x() + box.minX * s, right: dl.x() + box.maxX * s};
  const c = da.crosshairsLayer.crosshairs;
  return {center: {x: (onStage.left + onStage.right) / 2, y: (onStage.top + onStage.bottom) / 2}, onStage,
    crosshairs: {x: c.x, y: c.y}, scale: s,
    view: {x: da.viewport.centerX, y: da.viewport.centerY, top: da.viewport.minY, bottom: da.viewport.maxY}}; })()`);

const near = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
const at = p => `(${Math.round(p.x)}, ${Math.round(p.y)})`;

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await page.evaluate(`(() => { const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'kidraw-dev'; sel.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await settled(page);

  // Somewhere else entirely, then the rescue.
  await page.evaluate(`(() => { const dl = ${DA}.drawingLayer; dl.unselectAll(); dl.scale({x: 2, y: 2}); dl.x(900); dl.y(-600); dl.batchDraw(); })()`);
  await page.evaluate(`${DA}.handleCommand({kind: 'RECENTER_VIEW'})`);
  await settled(page);
  let m = await measure(page);
  check('with nothing selected, the graph is centered in the usable view', near(m.center, m.view),
    `graph center ${at(m.center)}, view center ${at(m.view)}`);
  check('and the crosshairs are on its center', near(m.crosshairs, m.center),
    `crosshairs ${at(m.crosshairs)}, graph center ${at(m.center)}`);
  check('and all of it is between the header and the keymenu', m.onStage.top >= m.view.top && m.onStage.bottom <= m.view.bottom,
    `graph ${Math.round(m.onStage.top)}–${Math.round(m.onStage.bottom)}, view ${Math.round(m.view.top)}–${Math.round(m.view.bottom)}`);

  // With a selection: centered on it, zoom kept.
  const picked = await page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
    const node = dl.getDANodes()[3]; node.isSelected = true; dl.scale({x: 1.5, y: 1.5}); dl.x(-200); dl.y(100); dl.batchDraw();
    return node.label.text(); })()`);
  await page.evaluate(`${DA}.handleCommand({kind: 'RECENTER_VIEW'})`);
  await settled(page);
  m = await measure(page, [picked]);
  check('with a selection, it is centered in the usable view at the same zoom', near(m.center, m.view) && m.scale === 1.5,
    `selection center ${at(m.center)}, view center ${at(m.view)}, zoom ${m.scale}`);

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
