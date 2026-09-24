/*
 * Where the crosshairs land after a link is drawn.
 *
 * They rest on the node the link reached, hidden until the next move, as
 * they are after sitting idle (Ben, 2026-09-19 — c1c866ff). Two flows get
 * that landing: held-Add to an existing node, and a new node added on a link
 * once its label is written. (A third, connecting two selected nodes, had no
 * key and was retired on 2026-09-24.)
 *
 * History: da-345 and da-509 used to land the crosshairs on the new link
 * itself, near its destination, so that hold-v + cycle could change its
 * direction without moving first. Losing that — the link now has to be
 * reached before v+o — is accepted (Ben, 2026-09-23), and this script's
 * checks for it went with the old landing.
 */
const {launch, openApp, settled, movedAndSettled, crosshairsOf, afterFrame,
  overlay: waitForOverlay, waitForDA, checker} = require('../harness');

const check = checker();

async function main() {
  const browser = await launch();
  const page = await openApp(browser, {width: 1400, height: 900});
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(600);

  /* Where did the crosshairs end up, relative to the new edge? */
  const crosshairReport = ids => page.evaluate(ids => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const edge = dl.getDAEdges().find(e =>
      e.srcNode.id === ids.srcId && e.destNode.id === ids.destId);
    if (!edge) return {found: false};
    const xh = c.crosshairsLayer.crosshairs;
    const lx = (xh.x - dl.x()) / dl.scaleX();
    const ly = (xh.y - dl.y()) / dl.scaleY();

    const path = edge.getRenderedPathPoints(32);
    // Distance from the crosshairs to the painted path.
    let best = Infinity, bestT = 0, acc = 0, total = 0;
    const segLen = [];
    for (let i = 0; i < path.length - 1; i++) {
      const l = Math.hypot(path[i+1].x - path[i].x, path[i+1].y - path[i].y);
      segLen.push(l); total += l;
    }
    // Distance to the nearest SEGMENT, not the nearest sampled vertex: a
    // straight edge is only two points, and its midpoint is far from both.
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[i], p1 = path[i + 1];
      const vx = p1.x - p0.x, vy = p1.y - p0.y;
      const len2 = vx * vx + vy * vy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((lx - p0.x) * vx + (ly - p0.y) * vy) / len2)) : 0;
      const d = Math.hypot(p0.x + t * vx - lx, p0.y + t * vy - ly);
      if (d < best) { best = d; bestT = total > 0 ? (acc + t * segLen[i]) / total : 0; }
      acc += segLen[i];
    }
    const destC = {x: edge.destNode.group.x() + edge.destNode.NODE_WIDTH / 2,
                   y: edge.destNode.group.y() + edge.destNode.NODE_HEIGHT / 2};
    const srcC = {x: edge.srcNode.group.x() + edge.srcNode.NODE_WIDTH / 2,
                  y: edge.srcNode.group.y() + edge.srcNode.NODE_HEIGHT / 2};
    return {
      found: true,
      distToPath: Math.round(best),
      t: Math.round(bestT * 100) / 100,
      distToDest: Math.round(Math.hypot(destC.x - lx, destC.y - ly)),
      distToSrc: Math.round(Math.hypot(srcC.x - lx, srcC.y - ly)),
      onEdge: c.getDAEdgesContainingCrosshairs().includes(edge),
      onNodes: c.getDANodesContainingCrosshairs().map(n => n.id),
      hidden: !xh.konvaGroup.visible(),
    };
  }, ids);

  /* ---------------------------------------------------------------------
   * Held Add over a node, cycled to an existing one, released.
   * ------------------------------------------------------------------- */
  const addKey = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return km.keyAssignments.root.editSubmenu;
  });
  const growIds = await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    dl.restoreGraph({nodes: [
      {id: 'da-901', x: 400, y: 300, text: 'A', width: 120, height: 60, fontSize: 14, isSelected: false},
      {id: 'da-902', x: 900, y: 300, text: 'B', width: 120, height: 60, fontSize: 14, isSelected: false},
    ], edges: []});
    dl.scale({x: 1, y: 1}); dl.x(0); dl.y(0);
    const a = dl.getDANodes()[0];
    c.crosshairsLayer.showCrosshairs();
    c.crosshairsLayer.crosshairs.x = a.group.x() + a.NODE_WIDTH / 2;
    c.crosshairsLayer.crosshairs.y = a.group.y() + a.NODE_HEIGHT / 2;
    dl.batchDraw();
    return {srcId: 'da-901', destId: 'da-902'};
  });
  await page.waitForTimeout(200);
  await page.keyboard.down(addKey);
  await page.waitForTimeout(400);
  // Walk the ghost targets rightwards until the real node B is the target.
  let steps = 0;
  for (; steps < 12; steps++) {
    const onB = await page.evaluate(() => {
      const t = window.ng.getComponent(document.querySelector('app-drawing-area'))['growTarget'];
      return !!t && t.id === 'da-902';
    });
    if (onB) break;
    await page.keyboard.press('l');
    await page.waitForTimeout(250);
  }
  console.log(`  held-Add: ${steps} right-presses to reach node B`);
  await page.keyboard.up(addKey);
  await page.waitForTimeout(500);

  const g = await crosshairReport(growIds);
  console.log('  held-Add: crosshairs vs new edge:', JSON.stringify(g));
  check('held-Add makes the edge', g.found === true, JSON.stringify(g));
  check('held-Add rests the crosshairs on the node it reached', g.found && g.onNodes.includes(growIds.destId),
    `on ${JSON.stringify(g.onNodes)}, ${g.distToDest}px from its centre`);
  check('held-Add hides them until the next move', g.found && g.hidden, `hidden=${g.hidden}`);

  /* ---------------------------------------------------------------------
   * A *new* node added on a link: the same landing, once its label is
   * written — held-Add, a direction, type, Escape out.
   * ------------------------------------------------------------------- */
  await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    c.drawingLayer.restoreGraph({nodes: [], edges: []});
    c.drawingLayer.scale({x: 1, y: 1}); c.drawingLayer.x(0); c.drawingLayer.y(0);
    c.drawingLayer.batchDraw();
  });
  await page.waitForTimeout(250);
  await page.keyboard.press(addKey); await page.waitForTimeout(600);
  await page.keyboard.type('anchor', {delay: 15});
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.down(addKey); await page.waitForTimeout(350);
  await page.keyboard.press('k'); await page.waitForTimeout(350);
  await page.keyboard.up(addKey); await page.waitForTimeout(700);
  await page.keyboard.type('child', {delay: 15});
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const newIds = await page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    const e = dl.getDAEdges()[0];
    const child = dl.getDANodes().find(node => node.label.text() === 'child');
    return e ? {srcId: e.srcNode.id, destId: e.destNode.id, childId: child?.id ?? ''}
      : {srcId: '', destId: '', childId: ''};
  });
  const n = await crosshairReport(newIds);
  console.log('  new connected node: crosshairs vs its link:', JSON.stringify(n));
  check('a new node on a link: the crosshairs rest on it once labelled', n.found && n.onNodes.includes(newIds.childId),
    `on ${JSON.stringify(n.onNodes)}, new node ${newIds.childId}`);
  check('hidden until the next move there too', n.found && n.hidden, `hidden=${n.hidden}`);

  console.log(check.failures ? `\n${check.failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(check.failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
