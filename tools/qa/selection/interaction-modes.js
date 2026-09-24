/*
 * At most one interaction mode is on (notes/idea-interaction-modes-list.md,
 * built 2026-09-24 at Ben's request): starting one stops the one that was on,
 * and replacing the graph (a load, an undo) stops whatever is on, since the
 * nodes it was aiming at are gone.
 *
 * Driven by commands rather than keys: the keymenu's own gestures rarely
 * overlap, which is exactly why nothing enforced this before.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const KEYS = {up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f', search: '/',
  coarse: 's', fine: 'd', edgeSubmenu: 'e', selfLoop: 'l'};

const run = (page, command) => page.evaluate(`${DA}.handleCommand(${JSON.stringify(command)})`);
const on = page => page.evaluate(`(() => { const da = ${DA};
  return {grow: da.grow.active, link: da.linkNav.active, area: da.areaSelect.active, grid: da.navGrid.visible,
    active: da.modes.active?.name ?? null}; })()`);

/** The basic sample, the crosshairs on its first node. */
async function onNode(page) {
  await page.evaluate(`(() => { const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await settled(page);
  await page.evaluate(`(() => { const da = ${DA}; da.finishTweens(); const n = da.drawingLayer.getDANodes()[0];
    const c = da.getNodeCenterInStageCoordinates(n);
    da.crosshairsLayer.crosshairs.x = c.x; da.crosshairsLayer.crosshairs.y = c.y; })()`);
}

(async () => {
  const browser = await launch();
  const page = await openApp(browser);

  await onNode(page);
  await run(page, {kind: 'ENTER_LINK_NAV'});
  let s = await on(page);
  check('Move by Link is on', s.link && s.active === 'move-by-link', JSON.stringify(s));
  await run(page, {kind: 'ENTER_ADD_MODE', holdKey: 'a', keys: KEYS});
  s = await on(page);
  check('starting grow stops Move by Link', s.grow && !s.link && s.active === 'grow', JSON.stringify(s));

  await run(page, {kind: 'SHOW_NODE_GRID', targets: 'nodes'});
  s = await on(page);
  check('starting Move by Node stops grow', s.grid && !s.grow && s.active === 'move-by-node', JSON.stringify(s));
  await run(page, {kind: 'HIDE_NODE_GRID'});

  await onNode(page);
  // Something to undo: a node moved, with its snapshot taken first.
  await page.evaluate(`(() => { const da = ${DA}; da.undoRedoService.pushSnapshot(da.drawingLayer.serializeGraph());
    const n = da.drawingLayer.getDANodes().slice(-1)[0]; n.group.x(n.group.x() + 400); })()`);
  await run(page, {kind: 'ENTER_ADD_MODE', holdKey: 'a', keys: KEYS});
  await run(page, {kind: 'UNDO'});
  s = await on(page);
  check('an undo stops grow', !s.grow && s.active === null, JSON.stringify(s));

  await onNode(page);
  await run(page, {kind: 'ENTER_LINK_NAV'});
  await page.evaluate(`(() => { const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await settled(page);
  s = await on(page);
  check('loading a graph stops Move by Link', !s.link && s.active === null, JSON.stringify(s));

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
