/*
 * A diagram type's node defaults reach the nodes you add. The shape it
 * declares applies unless you asked for another: with the insert-with-shape
 * submenu, or by setting the default shape yourself (the shape toggle over
 * empty canvas) — notes/design-plugin-v0.md.
 *
 * Found 2026-09-24: new nodes always took the drawing area's own default
 * shape, passed along as though you had asked for it, so a type's shape never
 * applied. Nobody could see it while every type declared a box.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const APP = "window.ng.getComponent(document.querySelector('app-root'))";
const ROUNDS = 'id: rounds\nname: Rounds\nnodes: {shape: circle, width: 90, height: 90, textOverflow: clip}\n';

/** Add a node at an empty spot with nothing selected; its shape and size. */
async function add(page, command, spot) {
  const node = await page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
    dl.unselectAll(); da.unselectAllLabels();
    da.crosshairsLayer.crosshairs.x = ${spot.x}; da.crosshairsLayer.crosshairs.y = ${spot.y};
    da.crosshairsLayer.showCrosshairs();
    const before = new Set(dl.getDANodes());
    da.handleCommand(${JSON.stringify(command)});
    const n = dl.getDANodes().find(n => !before.has(n));
    return n && {shape: n.nodeShape, w: Math.round(n.NODE_WIDTH), h: Math.round(n.NODE_HEIGHT)}; })()`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  return node;
}

/** Run a command over an empty spot; what the status line said. */
const said = (page, command, spot) => page.evaluate(`(() => { const da = ${DA};
  da.drawingLayer.unselectAll();
  da.crosshairsLayer.crosshairs.x = ${spot.x}; da.crosshairsLayer.crosshairs.y = ${spot.y};
  let message = ''; const sub = da.daOut.subscribe(n => { if (n.kind === 'status-message') message = n.message; });
  da.handleCommand(${JSON.stringify(command)}); sub.unsubscribe(); return message; })()`);

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await page.evaluate(() => localStorage.removeItem('kidraw-user-plugins'));
  await page.reload();
  await page.waitForSelector('#mainDrawingArea canvas');
  await settled(page);
  const added = await page.evaluate(`${APP}.pluginLibrary.add(${JSON.stringify(ROUNDS)}).errors ?? null`);
  await page.evaluate(`(() => { const da = ${DA};
    da.handleCommand({kind: 'NEW_GRAPH'}); da.handleCommand({kind: 'SET_DIAGRAM_TYPE', typeId: 'rounds'}); })()`);
  await settled(page);
  check('the type is in place', added === null && await page.evaluate(`${DA}.drawingLayer.diagramType`) === 'rounds',
    JSON.stringify(added));

  const inserted = await add(page, {kind: 'CREATE_NEW_NODE'}, {x: 300, y: 300});
  check('Insert gives the type\'s shape and size', JSON.stringify(inserted) === '{"shape":"circle","w":90,"h":90}',
    JSON.stringify(inserted));
  const quick = await add(page, {kind: 'QUICK_ADD'}, {x: 500, y: 300});
  check('so does a quick add', quick?.shape === 'circle', JSON.stringify(quick));
  const asked = await add(page, {kind: 'CREATE_NEW_NODE', nodeShape: 'diamond'}, {x: 700, y: 300});
  check('a shape asked for with the insert-with-shape submenu wins', asked?.shape === 'diamond', JSON.stringify(asked));

  const toggled = await said(page, {kind: 'TOGGLE_NODE_SHAPE'}, {x: 900, y: 500});
  check('the shape toggle over empty canvas starts from the type\'s shape', toggled === 'Default node shape: box', toggled);
  const chosen = await add(page, {kind: 'CREATE_NEW_NODE'}, {x: 300, y: 500});
  check('and the default you set wins over the type\'s', chosen?.shape === 'box', JSON.stringify(chosen));

  await page.evaluate(() => localStorage.removeItem('kidraw-user-plugins'));
  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
