/*
 * Crossing check for the horizontal tree, counting the crossings you can
 * actually see — including between edges that share an endpoint, which the
 * layout's own objective skips. Those are the "unnecessary crossings" a fan
 * produces: two edges leaving the same node and crossing each other well
 * away from it.
 *
 * Intersections within a node's own half-diagonal (+40px) of its centre are
 * ignored: that is the fan-out itself, not a crossing anyone objects to.
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
  const page = await (await browser.newContext({viewport: {width: 1600, height: 1000}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);

  // A fan wide enough to force the repair, plus a cross-link that has to
  // travel: the shape that produced Ben's crossings.
  await page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    const nodes = [{id: 'da-1', x: 400, y: 600, text: 'hub', width: 280, height: 70, fontSize: 14, isSelected: false}];
    for (let i = 0; i < 11; i++) {
      nodes.push({id: 'da-' + (10 + i), x: 900, y: 100 + i * 130, text: 'child ' + i,
                  width: 280, height: 70, fontSize: 14, isSelected: false});
    }
    nodes.push({id: 'da-99', x: 1400, y: 600, text: 'shared', width: 280, height: 70, fontSize: 14, isSelected: false});
    dl.restoreGraph({nodes, edges: [], diagramType: 'todo-graph'});
    const by = new Map(dl.getDANodes().map(n => [n.id, n]));
    for (let i = 0; i < 11; i++) dl.addEdge(by.get('da-1'), by.get('da-' + (10 + i)));
    dl.addEdge(by.get('da-10'), by.get('da-99'));
    dl.addEdge(by.get('da-18'), by.get('da-99'));
    dl.batchDraw();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.ng.getComponent(document.querySelector('app-drawing-area'))
    .handleCommands({kind: 'APPLY_LAYOUT', layout: 'tree-right-clear'}));
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const es = c.drawingLayer.getDAEdges();
    const paths = es.map(e => e.getRenderedPathPoints(48));
    const orient = (a, b, cx, cy) => (b.x - a.x) * (cy - a.y) - (b.y - a.y) * (cx - a.x);
    const pairs = [];
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const shared = [es[i].srcNode, es[i].destNode].find(
        n => n === es[j].srcNode || n === es[j].destNode);
      const sc = shared ? {
        x: shared.group.x() + shared.NODE_WIDTH / 2,
        y: shared.group.y() + shared.NODE_HEIGHT / 2,
        r: Math.hypot(shared.NODE_WIDTH, shared.NODE_HEIGHT) / 2 + 40,
      } : null;
      let hit = false;
      for (let a = 0; a < paths[i].length - 1 && !hit; a++) {
        for (let b = 0; b < paths[j].length - 1; b++) {
          const p0 = paths[i][a], p1 = paths[i][a + 1];
          const q0 = paths[j][b], q1 = paths[j][b + 1];
          const d1 = orient(q0, q1, p0.x, p0.y), d2 = orient(q0, q1, p1.x, p1.y);
          const d3 = orient(p0, p1, q0.x, q0.y), d4 = orient(p0, p1, q1.x, q1.y);
          if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
              ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
            if (sc && Math.hypot(mx - sc.x, my - sc.y) < sc.r) continue;
            hit = true; break;
          }
        }
      }
      if (hit) pairs.push(`${es[i].srcNode.label.text()}→${es[i].destNode.label.text()} × ` +
                          `${es[j].srcNode.label.text()}→${es[j].destNode.label.text()}`);
    }
    return {crossings: pairs.length, pairs: pairs.slice(0, 6), edges: es.length,
            routed: es.filter(e => e.controlPoints.length > 0).length};
  });

  console.log(`  ${result.edges} edges, ${result.routed} routed`);
  check('an 11-way fan plus cross-links draws without crossings',
    result.crossings === 0, `${result.crossings}: ${result.pairs.join('; ')}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
