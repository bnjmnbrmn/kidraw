/*
 * Verify the "-clear" layout variants: no straight edge passes through a
 * non-endpoint node after the layout, and edges are left straight (not
 * routed). Compares against the plain variants on the same graph.
 *
 * Builds a wide-fan tree (root with 18 children, some with grandchildren) —
 * the shape from next.org that produces fan wiggles/pierces — plus a couple
 * of deep chains so straight chords can cross intermediate nodes.
 */
const { chromium } = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  // Build the fan tree.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    let id = 0;
    const mk = (x, y) => {
      const n = new NodeCtor(x, y, 'n' + id, 'n' + (id++));
      dl.addRawNode(n);
      return n;
    };
    const root = mk(0, 0);
    const kids = [];
    for (let i = 0; i < 18; i++) {
      const k = mk((i - 9) * 40, 200 + (i % 3) * 30); // deliberately cramped + jittered
      dl.addEdge(root, k);
      kids.push(k);
    }
    // Give the first few kids their own children (deeper chains).
    for (let i = 0; i < 4; i++) {
      let parent = kids[i];
      for (let d = 0; d < 3; d++) {
        const c = mk(parent.konvaGroup.x() + 20, parent.konvaGroup.y() + 150);
        dl.addEdge(parent, c);
        parent = c;
      }
    }
    // Mixed sizes like the typed todo graph (big category boxes): the fat
    // boxes are what make fan chords clip siblings.
    root.resizeBy(160);
    kids[2].resizeBy(120);
    kids[9].resizeBy(120);
    dl.batchDraw();
  });

  // Count straight-edge pierces: for each edge, does its straight chord
  // (center to center) pass through a non-endpoint node box (inflated)?
  const countPierces = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const nodes = dl.getDANodes();
    const cen = n => ({ x: n.konvaGroup.x() + n.NODE_WIDTH / 2, y: n.konvaGroup.y() + n.NODE_HEIGHT / 2 });
    const segRect = (x1, y1, x2, y2, minX, minY, maxX, maxY) => {
      // Liang-Barsky
      let t0 = 0, t1 = 1;
      const dx = x2 - x1, dy = y2 - y1;
      const p = [-dx, dx, -dy, dy];
      const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) { if (q[i] < 0) return false; }
        else {
          const r = q[i] / p[i];
          if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
          else { if (r < t0) return false; if (r < t1) t1 = r; }
        }
      }
      return true;
    };
    const clearance = 6;
    let pierces = 0;
    for (const e of dl.getDAEdges()) {
      if (e.srcNode === e.destNode) continue;
      const a = cen(e.srcNode), b = cen(e.destNode);
      for (const n of nodes) {
        if (n === e.srcNode || n === e.destNode) continue;
        if (segRect(a.x, a.y, b.x, b.y,
              n.konvaGroup.x() - clearance, n.konvaGroup.y() - clearance,
              n.konvaGroup.x() + n.NODE_WIDTH + clearance, n.konvaGroup.y() + n.NODE_HEIGHT + clearance)) {
          pierces++;
          break;
        }
      }
    }
    return pierces;
  });

  const anyWaypoints = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDAEdges().some(e => e.controlPoints.length > 0);
  });

  // Straight-chord crossings between edges that share no endpoint. The tidy
  // tree guarantees zero for tree edges; the clear variants must not
  // reintroduce any (the old push-apart pass scattered nodes and did).
  const countCrossings = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const cen = n => ({ x: n.konvaGroup.x() + n.NODE_WIDTH / 2, y: n.konvaGroup.y() + n.NODE_HEIGHT / 2 });
    const segs = dl.getDAEdges().filter(e => e.srcNode !== e.destNode)
      .map(e => ({ a: e.srcNode, b: e.destNode, p: cen(e.srcNode), q: cen(e.destNode) }));
    const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    let crossings = 0;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const s = segs[i], t = segs[j];
        if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;
        const d1 = orient(t.p, t.q, s.p), d2 = orient(t.p, t.q, s.q);
        const d3 = orient(s.p, s.q, t.p), d4 = orient(s.p, s.q, t.q);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) crossings++;
      }
    }
    return crossings;
  });

  // APPLY_LAYOUT is blocked while a routing worker is in flight (plain
  // variants route async in a worker). Wait for routing-idle before AND after
  // so consecutive layouts aren't dropped by the lock.
  const waitRoutingIdle = async () => {
    await page.waitForFunction(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      return da.routingWorker === null || da.routingWorker === undefined;
    }, { timeout: 15000 });
  };
  const applyLayout = async (layout) => {
    await waitRoutingIdle();
    await page.evaluate((l) => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      da.handleCommands({ kind: 'APPLY_LAYOUT', layout: l });
    }, layout);
    await page.waitForTimeout(300);
    await waitRoutingIdle();
  };

  // --- Tree down: plain vs clear ---
  await applyLayout('tree-down');
  const treePlain = await countPierces();
  await applyLayout('tree-down-clear');
  const treeClear = await countPierces();
  const treeClearCrossings = await countCrossings();
  const treeClearWaypoints = await anyWaypoints();
  check('tree-down-clear leaves no straight edge piercing a node', treeClear === 0,
    `plain=${treePlain} clear=${treeClear}`);
  check('tree-down-clear keeps the tree crossing-free', treeClearCrossings === 0,
    `${treeClearCrossings} crossings`);
  check('tree-down-clear leaves edges straight (no waypoints)', treeClearWaypoints === false);

  // --- Tree right: the mixed-size regression shape ---
  await applyLayout('tree-right-clear');
  const treeRightPierces = await countPierces();
  const treeRightCrossings = await countCrossings();
  check('tree-right-clear leaves no straight edge piercing a node', treeRightPierces === 0,
    `${treeRightPierces} pierces`);
  check('tree-right-clear keeps the tree crossing-free', treeRightCrossings === 0,
    `${treeRightCrossings} crossings`);

  // --- Force: plain vs clear ---
  await applyLayout('force-directed');
  const forcePlain = await countPierces();
  await applyLayout('force-clear');
  const forceClear = await countPierces();
  const forceClearWaypoints = await anyWaypoints();
  check('force-clear leaves no straight edge piercing a node', forceClear === 0,
    `plain=${forcePlain} clear=${forceClear}`);
  check('force-clear leaves edges straight (no waypoints)', forceClearWaypoints === false);

  console.log(`\n[summary] tree pierces plain=${treePlain} → clear=${treeClear}; ` +
              `force pierces plain=${forcePlain} → clear=${forceClear}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
