/*
 * Repro for da-345: "Immediately after connecting two nodes with a link,
 * place the crosshairs over the link near the destination node so that one
 * can easily change the direction of the link."
 *
 * Cycling direction acts on the SELECTED edge ("Select an edge first (hold v
 * over it)"), so landing the crosshairs on the new link is what makes
 * hold-v + cycle work without navigating back. This drives the whole flow
 * with real keys and checks the direction actually changes.
 */
const {chromium} = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(600);

  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {select: km.keyAssignments.root.selectDragSubmenu,
            cycle: km.keyAssignments.select.cycleDirection};
  });

  const edgeCount = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    return dl.getDAEdges().length;
  });

  /* Pick two nodes that are not already connected, select one, put the
     crosshairs on the other, and connect them via the command the keymenu
     sends. */
  const connect = () => page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const nodes = dl.getDANodes();
    const linked = (a, b) => dl.getDAEdges().some(e =>
      (e.srcNode === a && e.destNode === b) || (e.srcNode === b && e.destNode === a));
    let src = null, dest = null;
    for (const a of nodes) for (const b of nodes) {
      if (a !== b && !linked(a, b)) { src = a; dest = b; break; }
      if (src) break;
    }
    dl.unselectAll();
    src.isSelected = true;
    c.crosshairsLayer.crosshairs.x = (dest.group.x() + dest.NODE_WIDTH / 2) * dl.scaleX() + dl.x();
    c.crosshairsLayer.crosshairs.y = (dest.group.y() + dest.NODE_HEIGHT / 2) * dl.scaleY() + dl.y();
    dl.batchDraw();
    c.handleCommands({kind: 'CONNECT_SELECTED_NODES'});
    return {srcId: src.id, destId: dest.id};
  });

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
      directedness: edge.directedness,
    };
  }, ids);

  const before = await edgeCount();
  const ids = await connect();
  await page.waitForTimeout(400);
  check('the connect made an edge', (await edgeCount()) === before + 1,
    `${before} -> ${await edgeCount()}`);

  const r = await crosshairReport(ids);
  console.log('  crosshairs vs new edge:', JSON.stringify(r));
  check('the crosshairs land on the new link', r.found && r.distToPath <= 12,
    `${r.distToPath}px from the painted path`);
  check('the crosshairs sit at the destination end', r.found && r.distToDest < r.distToSrc,
    `dest ${r.distToDest}px vs src ${r.distToSrc}px`);
  check('the link is pickable there', r.onEdge === true, String(r.onEdge));

  // The whole point: hold the select key, tap cycle, direction changes.
  const dirBefore = r.directedness;
  await page.keyboard.down(keys.select);
  await page.waitForTimeout(150);
  await page.keyboard.press(keys.cycle);
  await page.waitForTimeout(200);
  await page.keyboard.up(keys.select);
  await page.waitForTimeout(300);
  const after = await crosshairReport(ids);
  const flipped = await page.evaluate(ids => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    // A reversal swaps the endpoints, so look for the edge either way round.
    const e = dl.getDAEdges().find(x =>
      (x.srcNode.id === ids.srcId && x.destNode.id === ids.destId) ||
      (x.srcNode.id === ids.destId && x.destNode.id === ids.srcId));
    return e ? {directedness: e.directedness, reversed: e.srcNode.id === ids.destId} : null;
  }, ids);
  console.log('  after hold-select + cycle:', JSON.stringify(flipped));
  check('hold-select then cycle changes the link direction without moving first',
    !!flipped && (flipped.directedness !== dirBefore || flipped.reversed),
    `${dirBefore} -> ${JSON.stringify(flipped)}`);

  /* ---------------------------------------------------------------------
   * The same promise, through the flow the link actually gets drawn with:
   * hold Add over a node, cycle to an existing one, release. That path
   * wired the edge but left the crosshairs behind until 2026-08-29.
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
  check('held-Add lands the crosshairs on the new link', g.found && g.distToPath <= 12,
    `${g.distToPath}px from the painted path`);
  check('held-Add lands them at the destination end', g.found && g.distToDest < g.distToSrc,
    `dest ${g.distToDest}px vs src ${g.distToSrc}px`);
  check('the link is pickable there too', g.onEdge === true, String(g.onEdge));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
