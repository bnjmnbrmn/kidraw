/*
 * Verify the fisheye gather rework end to end.
 *
 * Synthetic graph: hub H with 26 neighbors — 12 outgoing 'depends-on'
 * (5 with edge labels), 8 outgoing 'serves', 6 incoming 'depends-on' —
 * plus a stranger S (with an edge to far-away F) sitting inside the future
 * gather zone, and a small hub Y with 3 sparse neighbors.
 *
 * Checks:
 *   A. Explicit Gather on H (crowded → stacking mode):
 *      - every neighbor pulled within the gather zone; stranger pushed out
 *      - unprotected same-direction+kind neighbors pile into stacks,
 *        in vs out never share a pile, cascade offsets capped (≤4 distinct
 *        positions per pile)
 *      - buried stack labels hidden + an "…N more labels…" marker appears
 *      - Ungather restores positions, wiring, labels, marker exactly
 *   B. Gather on Y (sparse → individual placement, bearings preserved)
 *   C. Nav session (real keys): hold f auto-gathers, landing on a neighbor
 *      re-anchors the gather, releasing f restores everything.
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
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    const mk = (id, cx, cy) => {
      const n = new NodeCtor(0, 0, id, id);
      n.group.x(cx - n.NODE_WIDTH / 2);
      n.group.y(cy - n.NODE_HEIGHT / 2);
      dl.addRawNode(n);
      return n;
    };
    const H = mk('H', 1000, 800);
    const at = (angle, dist) => [1000 + Math.cos(angle) * dist, 800 + Math.sin(angle) * dist];

    window.__labelEdges = [];
    for (let i = 0; i < 12; i++) {
      const a = -1.2 + (2.4 * i) / 11;
      const n = mk(`od${i}`, ...at(a, 500 + (i % 4) * 100));
      const e = dl.addEdge(H, n);
      e.tags = ['depends-on'];
      if (i < 5) window.__labelEdges.push(e);
    }
    for (let i = 0; i < 8; i++) {
      const a = 1.5 + (1.2 * i) / 7;
      const n = mk(`os${i}`, ...at(a, 550 + (i % 3) * 120));
      const e = dl.addEdge(H, n);
      e.tags = ['serves'];
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + 0.5 - (1.0 * i) / 5;
      const n = mk(`in${i}`, ...at(-a, 450 + (i % 3) * 110)); // left side
      const e = dl.addEdge(n, H);
      e.tags = ['depends-on'];
    }
    const S = mk('S', ...at(2.9, 250)); // stranger inside the zone
    const F = mk('F', 3600, 200);
    dl.addEdge(S, F);
    // Neighbor↔neighbor edge (not through the anchor): 'rest' bucket.
    const od0 = dl.getDANodes().find(n => n.id === 'od0');
    const os0 = dl.getDANodes().find(n => n.id === 'os0');
    dl.addEdge(od0, os0).tags = ['depends-on'];

    // Sparse hub Y.
    const Y = mk('Y', 4200, 1600);
    dl.addEdge(Y, mk('ya', 4700, 1300));
    dl.addEdge(Y, mk('yb', 4800, 1750));
    dl.addEdge(mk('yc', 3700, 1900), Y);

    dl.batchDraw();
    window.__status = [];
    da.daOut.subscribe(n => { if (n.kind === 'status-message') window.__status.push(n.message); });
  });

  // Add labels through the real command path: crosshairs mid-edge + ADD_LABEL.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    for (const [i, edge] of window.__labelEdges.entries()) {
      const pts = edge.getPathPoints();
      const mid = {x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2};
      da.tweens.forEach(t => t.finish()); da.tweens = [];
      da.crosshairsLayer.crosshairs.x = dl.x() + mid.x * dl.scaleX();
      da.crosshairsLayer.crosshairs.y = dl.y() + mid.y * dl.scaleY();
      da.handleCommands({ kind: 'ADD_LABEL' });
      const label = edge.labels[0];
      if (label) label.appendText(`lbl${i}`);
      da.handleCommands({ kind: 'EXIT_LABEL_EDIT_MODE' });
      da.handleCommands({ kind: 'UNSELECT_ALL' });
    }
  });

  const placeOn = (id) => page.evaluate((nodeId) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const n = dl.getDANodes().find(x => x.id === nodeId);
    da.crosshairsLayer.crosshairs.x = dl.x() + (n.group.x() + n.NODE_WIDTH / 2) * dl.scaleX();
    da.crosshairsLayer.crosshairs.y = dl.y() + (n.group.y() + n.NODE_HEIGHT / 2) * dl.scaleY();
  }, id);

  const snapshot = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const nodes = {};
    for (const n of dl.getDANodes()) nodes[n.id] = {x: n.group.x(), y: n.group.y()};
    const edges = {};
    for (const e of dl.getDAEdges()) {
      edges[`${e.srcNode.id}->${e.destNode.id}`] = JSON.stringify(e.controlPoints.map(c => ({x: Math.round(c.x), y: Math.round(c.y)})));
    }
    return {nodes, edges};
  });

  const gatherState = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const center = (n) => ({x: n.group.x() + n.NODE_WIDTH / 2, y: n.group.y() + n.NODE_HEIGHT / 2});
    const nodes = {};
    for (const n of dl.getDANodes()) nodes[n.id] = center(n);
    const hiddenEdges = dl.getDAEdges().filter(e => !e.group.visible())
      .map(e => `${e.srcNode.id}->${e.destNode.id}`);
    const overlays = da.gatherIndicators;
    const indicators = overlays.filter(n => n.className === 'Text').map(t => t.text());
    return {
      nodes,
      gathered: da.gatheredNodePositions.size,
      anchor: da.gatherAnchor ? da.gatherAnchor.id : null,
      hiddenEdges, indicators,
      containers: overlays.filter(n => n.className === 'Rect').length,
      metaArrows: overlays.filter(n => n.className === 'Arrow' && n.strokeWidth() === 5).length,
      metaBundles: overlays.filter(n => n.className === 'Arrow' && n.strokeWidth() < 5).length,
      status: window.__status.slice(-3),
    };
  });

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------- A. Explicit gather on crowded hub H ----------
  const before = await snapshot();
  await placeOn('H');
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.handleCommands({ kind: 'GATHER_CONNECTED_NODES' });
    da.tweens.forEach(t => t.finish()); da.tweens = [];
  });
  await page.waitForTimeout(450); // deferred stranger re-route fires at 250ms
  let s = await gatherState();

  const H = s.nodes['H'];
  const neighborIds = Object.keys(s.nodes).filter(id => /^(od|os|in)/.test(id));
  const neighborDists = neighborIds.map(id => dist(s.nodes[id], H));
  check('A1: all 26 neighbors pulled into the gather zone (max dist < 450)',
    neighborIds.length === 26 && Math.max(...neighborDists) < 450,
    `max=${Math.max(...neighborDists).toFixed(0)}`);
  check('A2: stranger S pushed beyond every neighbor',
    dist(s.nodes['S'], H) > Math.max(...neighborDists) + 30,
    `S=${dist(s.nodes['S'], H).toFixed(0)}`);

  // Stacks: cluster neighbors by rounded position; piles share ~one spot.
  const clusterKey = (id) => `${Math.round(s.nodes[id].x / 60)}:${Math.round(s.nodes[id].y / 60)}`;
  const clusters = new Map();
  for (const id of neighborIds) {
    const k = clusterKey(id);
    (clusters.get(k) ?? clusters.set(k, []).get(k)).push(id);
  }
  const piles = [...clusters.values()].filter(g => g.length >= 3);
  check('A3: crowding produced piles (≥3 members sharing a spot)',
    piles.length >= 2, `piles=${piles.map(p => p.length).join(',')}`);
  const mixedPile = piles.find(g => {
    const kinds = new Set(g.map(id => id.replace(/\d+$/, '')));
    return kinds.size > 1;
  });
  check('A4: no pile mixes direction or kind (od/os/in never share)',
    mixedPile === undefined, mixedPile ? mixedPile.join(',') : '');
  // Cascade cap: within the biggest pile, at most 4 distinct positions.
  const big = piles.sort((a, b) => b.length - a.length)[0] ?? [];
  const distinct = new Set(big.map(id => `${s.nodes[id].x.toFixed(1)},${s.nodes[id].y.toFixed(1)}`));
  check('A5: cascade capped — big pile shows ≤4 distinct offsets',
    big.length >= 5 && distinct.size <= 4, `pile=${big.length} distinct=${distinct.size}`);

  check('A6: every pile is a meta-node: one dashed container and one meta-arrow each',
    s.containers === piles.length && s.metaArrows === piles.length,
    `containers=${s.containers} arrows=${s.metaArrows} piles=${piles.length}`);
  check('A6b: pile member edges hidden behind their meta-edge',
    s.hiddenEdges.length >= 20, `hidden=${s.hiddenEdges.length}`);
  check('A6c: a stacked member\'s wiring to the wider graph hides too',
    s.hiddenEdges.includes('od0->os0'), JSON.stringify(s.hiddenEdges.slice(-4)));
  check('A6d: hidden outside wiring is bundled as thin meta-arrows (od0\u2192os0 pile pair)',
    s.metaBundles >= 1, `bundles=${s.metaBundles}`);
  check('A7: meta-edge shows the top label plus a "…more labels…" marker',
    s.indicators.some(t => /^lbl/.test(t)) && s.indicators.some(t => /more label/.test(t)),
    JSON.stringify(s.indicators));
  check('A7b: every pile carries a ×N count badge',
    s.indicators.filter(t => /^×\d+$/.test(t)).length === piles.length,
    JSON.stringify(s.indicators));

  // Ungather → exact restore.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.handleCommands({ kind: 'UNGATHER' });
    da.tweens.forEach(t => t.finish()); da.tweens = [];
  });
  await page.waitForTimeout(150);
  const after = await snapshot();
  const posDrift = Object.keys(before.nodes).filter(id =>
    Math.hypot(before.nodes[id].x - after.nodes[id].x, before.nodes[id].y - after.nodes[id].y) > 0.5);
  check('A8: Ungather restores every node position exactly', posDrift.length === 0, posDrift.join(','));
  const wiringDrift = Object.keys(before.edges).filter(k => before.edges[k] !== after.edges[k]);
  check('A9: Ungather restores every edge\'s wiring exactly', wiringDrift.length === 0, wiringDrift.join(','));
  s = await gatherState();
  check('A10: pile edges visible again, all overlays gone',
    s.hiddenEdges.length === 0 && s.indicators.length === 0 && s.containers === 0
      && s.metaArrows === 0 && s.metaBundles === 0,
    `hidden=${s.hiddenEdges.length} ind=${s.indicators.length}`);

  // ---------- B. Sparse hub Y: individual fisheye ----------
  await placeOn('Y');
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.handleCommands({ kind: 'GATHER_CONNECTED_NODES' });
    da.tweens.forEach(t => t.finish()); da.tweens = [];
  });
  s = await gatherState();
  const Y = s.nodes['Y'];
  const yIds = ['ya', 'yb', 'yc'];
  const yDists = yIds.map(id => dist(s.nodes[id], Y));
  const uniqueY = new Set(yIds.map(id => `${s.nodes[id].x.toFixed(0)},${s.nodes[id].y.toFixed(0)}`));
  check('B1: sparse neighbors placed individually on one ring',
    uniqueY.size === 3 && Math.max(...yDists) - Math.min(...yDists) < 1,
    `dists=${yDists.map(d => d.toFixed(0)).join(',')}`);
  const bearingDrift = yIds.map(id => {
    const desired = Math.atan2(before.nodes[id].y - before.nodes['Y'].y, before.nodes[id].x - before.nodes['Y'].x);
    const got = Math.atan2(s.nodes[id].y - Y.y, s.nodes[id].x - Y.x);
    let d = Math.abs(got - desired) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  });
  check('B2: bearings preserved (sucked in, not re-laid-out)',
    Math.max(...bearingDrift) < 0.15, `drift=${bearingDrift.map(d => d.toFixed(2)).join(',')}`);
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.handleCommands({ kind: 'UNGATHER' });
    da.tweens.forEach(t => t.finish()); da.tweens = [];
  });

  // ---------- C. Nav session auto-gather (real keys) ----------
  // Auto-gather is off by default (too slow for navigation; the nav popup
  // is the replacement direction) — turn it on to verify the machinery.
  await page.evaluate(() => {
    window.ng.getComponent(document.querySelector('app-drawing-area')).autoGatherEnabled = true;
  });
  await placeOn('Y');
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  s = await gatherState();
  check('C1: holding f auto-gathers around the node under the crosshairs',
    s.gathered > 0 && s.anchor === 'Y', `anchor=${s.anchor} gathered=${s.gathered}`);
  await page.keyboard.press('n'); // focus an edge at Y
  await page.waitForTimeout(150);
  await page.keyboard.press('n'); // walk to the neighbor
  await page.waitForTimeout(500);
  s = await gatherState();
  check('C2: landing on a neighbor re-anchors the gather there',
    s.gathered > 0 && s.anchor !== 'Y' && yIds.includes(s.anchor ?? ''), `anchor=${s.anchor}`);
  await page.keyboard.up('f');
  await page.waitForTimeout(300);
  s = await gatherState();
  check('C3: releasing f restores the layout (auto-gather is temporary)',
    s.gathered === 0 && s.anchor === null, `gathered=${s.gathered} anchor=${s.anchor}`);
  const finalSnap = await snapshot();
  const finalDrift = Object.keys(before.nodes).filter(id =>
    Math.hypot(before.nodes[id].x - finalSnap.nodes[id].x, before.nodes[id].y - finalSnap.nodes[id].y) > 0.5);
  check('C4: positions identical to the original layout after the session',
    finalDrift.length === 0, finalDrift.join(','));

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
