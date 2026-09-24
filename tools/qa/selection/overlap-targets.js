/*
 * Where nodes overlap, commands act on the one the hover trace is around.
 *
 * Found 2026-09-23/24: several commands took the first node under the
 * crosshairs (the one underneath) while the hover trace showed the one on
 * top — Edit Text opened, Copy took, and Delete removed the node you could
 * not see. They now share one "node under the crosshairs": the topmost.
 * Each case moves the basic sample's Process over Start and puts the
 * crosshairs where they overlap.
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
  const clip = await page.evaluate(`${DA}.clipboard?.nodes.map(n => n.text) ?? []`);
  check('Copy takes the highlighted node', JSON.stringify(clip) === JSON.stringify([nodes.onTop]), `${copied} ${JSON.stringify(clip)}`);

  nodes = await overlapped(page);
  const before = await labels(page);
  await run(page, {kind: 'DELETE'});
  const after = await labels(page);
  const deleted = before.filter(label => !after.includes(label));
  check('Delete removes the highlighted node, not the one beneath it',
    JSON.stringify(deleted) === JSON.stringify([nodes.onTop]), JSON.stringify(deleted));

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
