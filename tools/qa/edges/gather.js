/*
 * Gather, v2 (2026-09-25; notes/idea-gather-recursive.md): Layout → Gather on
 * a node pulls its neighbors in around it, each keeping its direction; a
 * node with few neighbors brings their neighbors too; nodes in the way move
 * out; Gather again puts everything back.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const KM = "window.ng.getComponent(document.querySelector('app-keymenu'))";
const da = (page, expr) => page.evaluate(`(() => { const da = ${DA}; return ${expr}; })()`);

/** Hold the Layout hub and tap Gather. */
async function gather(page) {
  const {hub, key} = await page.evaluate(`({hub: ${KM}.keyAssignments.root.layoutSubmenu, key: ${KM}.keyAssignments.layout.gather})`);
  await page.keyboard.down(hub);
  await page.waitForTimeout(250);
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
  await page.keyboard.up(hub);
  await page.waitForTimeout(250);
}

const positions = page => da(page, `Object.fromEntries(da.drawingLayer.getDANodes()
  .map(n => [n.label.text(), {x: Math.round(n.konvaGroup.x() + n.NODE_WIDTH / 2), y: Math.round(n.konvaGroup.y() + n.NODE_HEIGHT / 2)}]))`);

(async () => {
  const browser = await launch();
  const page = await openApp(browser);

  // hub → east (far right), hub → south (far below), east → beyond (further
  // right); an unrelated node sits right next to the hub.
  await page.evaluate(`(() => {
    const da = ${DA}; const dl = da.drawingLayer;
    const node = (id, text, x, y) => ({id, x, y, text, width: 120, height: 60, fontSize: 14, isSelected: false});
    dl.restoreGraph({nodes: [node('da-1', 'hub', 0, 0), node('da-2', 'east', 1500, 0), node('da-3', 'south', 0, 1200),
      node('da-4', 'beyond', 2600, 40), node('da-5', 'stranger', 150, 20)], edges: []});
    const by = new Map(dl.getDANodes().map(n => [n.id, n]));
    dl.addEdge(by.get('da-1'), by.get('da-2'));
    dl.addEdge(by.get('da-1'), by.get('da-3'));
    dl.addEdge(by.get('da-2'), by.get('da-4'));
    dl.batchDraw();
    da.finishTweens();
    dl.scale({x: 0.25, y: 0.25}); dl.x(100); dl.y(100);
    const hub = by.get('da-1');
    da.crosshairsLayer.crosshairs.x = (hub.konvaGroup.x() + hub.NODE_WIDTH / 2) * 0.25 + 100;
    da.crosshairsLayer.crosshairs.y = (hub.konvaGroup.y() + hub.NODE_HEIGHT / 2) * 0.25 + 100;
  })()`);
  await settled(page);
  const before = await positions(page);

  await gather(page);
  const after = await positions(page);
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  check('the neighbors come in close', dist(after.east, after.hub) < 400 && dist(after.south, after.hub) < 400,
    JSON.stringify(after));
  check('each keeps its direction from the hub',
    Math.abs(after.east.y - after.hub.y) < 2 && after.east.x > after.hub.x
      && Math.abs(after.south.x - after.hub.x) < 2 && after.south.y > after.hub.y, JSON.stringify(after));
  check('with fewer than three neighbors, theirs come too, further out',
    dist(after.beyond, after.hub) < dist(before.beyond, before.hub)
      && dist(after.beyond, after.hub) > dist(after.east, after.hub), JSON.stringify(after));
  check('an unrelated node in the way is pushed out past them',
    dist(after.stranger, after.hub) > dist(after.east, after.hub), JSON.stringify(after.stranger));
  check('the hub stays put', after.hub.x === before.hub.x && after.hub.y === before.hub.y);

  await gather(page);
  const back = await positions(page);
  check('Gather again puts everything back', JSON.stringify(back) === JSON.stringify(before), JSON.stringify(back));

  await gather(page);
  await da(page, `da.handleCommand({kind: 'UNDO'})`);
  await settled(page);
  check('a gathering undoes', JSON.stringify(await positions(page)) === JSON.stringify(before));

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
