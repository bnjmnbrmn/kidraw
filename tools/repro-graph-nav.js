/*
 * Verify the move-by-graph traversal rework end to end with real key events
 * (vim profile: hold f = Move by graph; n/p Jump Outgoing/Incoming,
 * j/k Next/Prev Edge, s/d held = coarse/fine tier).
 *
 * Synthetic graph (layer coords, y down):
 *
 *            U(400,100)      RU(700,100)
 *                ↑               ↑
 *   W(100,300) → H(400,300) → R(700,300) → R2(1000,300)   [H→R has a label at t≈0.5]
 *                ↓
 *            D(400,500)     [H→D has a waypoint at (400,400)]
 *
 * Checks:
 *   1. Entry (hold f) with a selected node recenters crosshairs onto it.
 *   2. Cold-start Jump Outgoing selects the 12-o'clock-clockwise-first edge
 *      (H→U) without moving; j/k cycle candidates clockwise/back.
 *   3. Jump Outgoing walks stop-by-stop: label pseudo-node, then dest node.
 *   4. Momentum: arriving at R traveling east, the next Jump Outgoing picks
 *      the east-aligned R→R2 over R→RU.
 *   5. Jump Incoming reverses course (Q2) and selects incoming edges at nodes.
 *   6. Coarse tier (hold s) skips the label; fine tier (hold d) stops on the
 *      H→D waypoint.
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

  // Build the synthetic graph from a sample's constructors.
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
    const H = mk('H', 400, 300);
    const U = mk('U', 400, 100);
    const R = mk('R', 700, 300);
    const D = mk('D', 400, 500);
    const W = mk('W', 100, 300);
    const R2 = mk('R2', 1000, 300);
    const RU = mk('RU', 700, 100);
    dl.addEdge(H, U);
    const hr = dl.addEdge(H, R);
    const hd = dl.addEdge(H, D);
    dl.addEdge(W, H);
    dl.addEdge(R, R2);
    dl.addEdge(R, RU);
    hd.insertWaypoint({ x: 400, y: 400 });
    dl.batchDraw();
    window.__nav = { dl };
  });

  // Add a label on H→R via the real command (anchors at the projected t).
  const placeAtLayer = (x, y) => page.evaluate(([x, y]) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    da.crosshairsLayer.crosshairs.x = dl.x() + x * dl.scaleX();
    da.crosshairsLayer.crosshairs.y = dl.y() + y * dl.scaleY();
  }, [x, y]);

  await placeAtLayer(550, 300);
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.handleCommands({ kind: 'ADD_LABEL' });
    da.handleCommands({ kind: 'UNSELECT_ALL' });
  });

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const scale = dl.scaleX();
    const sel = dl.getSelectedDAEdges().map(e => `${e.srcNode.id}->${e.destNode.id}`);
    return {
      selectedEdges: sel,
      selectedNodes: dl.getSelectedDANodes().map(n => n.id),
      // Crosshairs in layer coords for easy comparison with node centers.
      x: (da.crosshairsLayer.crosshairsX() - dl.x()) / scale,
      y: (da.crosshairsLayer.crosshairsY() - dl.y()) / scale,
    };
  });
  const near = (s, x, y, tol = 15) => Math.hypot(s.x - x, s.y - y) <= tol;
  const fmt = s => `xh(${s.x.toFixed(0)},${s.y.toFixed(0)}) sel=[${s.selectedEdges.join(',')}]`;

  // --- 1. Entry: selected node, crosshairs elsewhere → recenter onto it. ---
  await placeAtLayer(1000, 100); // far from H
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const H = da.drawingLayer.getDANodes().find(n => n.id === 'H');
    H.isSelected = true;
    da.drawingLayer.batchDraw();
  });
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  await page.keyboard.up('f');
  await page.waitForTimeout(300);
  let s = await state();
  check('entry recenters crosshairs onto the selected node', near(s, 400, 300), fmt(s));
  check('entry does not deselect', s.selectedNodes.includes('H'), JSON.stringify(s.selectedNodes));

  // --- 2. Cold-start edge pick + clockwise cycling. ---
  await page.keyboard.down('f');
  await page.waitForTimeout(250);
  await page.keyboard.press('n'); // Jump Outgoing → select first clockwise from 12 o'clock = H→U
  await page.waitForTimeout(150);
  s = await state();
  check('cold-start Jump Outgoing selects the 12 o\'clock edge (H→U)',
    s.selectedEdges.join() === 'H->U', fmt(s));
  check('edge selection does not move the crosshairs', near(s, 400, 300), fmt(s));
  await page.keyboard.press('j'); // Next Edge (clockwise) → H→R
  await page.waitForTimeout(150);
  s = await state();
  check('Next Edge cycles clockwise to H→R', s.selectedEdges.join() === 'H->R', fmt(s));
  await page.keyboard.press('j'); // → H→D
  await page.waitForTimeout(150);
  s = await state();
  check('Next Edge cycles clockwise to H→D', s.selectedEdges.join() === 'H->D', fmt(s));
  await page.keyboard.press('k'); // Prev Edge back → H→R
  await page.waitForTimeout(150);
  s = await state();
  check('Prev Edge cycles back to H→R', s.selectedEdges.join() === 'H->R', fmt(s));

  // --- 3. Walk stop-by-stop along H→R: label pseudo-node, then R. ---
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  s = await state();
  check('Jump Outgoing stops on the label pseudo-node',
    s.x > 480 && s.x < 620 && !near(s, 700, 300), fmt(s));
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  s = await state();
  check('next Jump Outgoing reaches R', near(s, 700, 300), fmt(s));
  check('the edge stays selected on arrival', s.selectedEdges.join() === 'H->R', fmt(s));

  // --- 4. Momentum: traveling east into R, Jump Outgoing prefers R→R2. ---
  await page.keyboard.press('n');
  await page.waitForTimeout(150);
  s = await state();
  check('momentum picks the east-aligned R→R2 over R→RU',
    s.selectedEdges.join() === 'R->R2', fmt(s));
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  s = await state();
  check('Jump Outgoing walks to R2', near(s, 1000, 300), fmt(s));

  // --- 5. Reverse course (Q2): Jump Incoming walks back and chains through
  //        incoming selections. ---
  await page.keyboard.press('p'); // at R2 on R→R2 (incoming here) → step back to R
  await page.waitForTimeout(300);
  s = await state();
  check('Jump Incoming reverses along the edge back to R', near(s, 700, 300), fmt(s));
  await page.keyboard.press('p'); // at R = src of R→R2 → select R's incoming edge (H→R)
  await page.waitForTimeout(150);
  s = await state();
  check('Jump Incoming at the source selects the incoming edge (H→R)',
    s.selectedEdges.join() === 'H->R', fmt(s));
  await page.keyboard.press('p'); // walk backward → label stop
  await page.waitForTimeout(300);
  await page.keyboard.press('p'); // → H
  await page.waitForTimeout(300);
  s = await state();
  check('Jump Incoming walks back through the label to H', near(s, 400, 300), fmt(s));
  await page.keyboard.up('f');
  await page.waitForTimeout(200);

  // --- 6. Tiers: coarse skips the label; fine stops on the waypoint. ---
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.handleCommands({ kind: 'UNSELECT_ALL' });
  });
  await placeAtLayer(400, 300);
  await page.keyboard.down('f');
  await page.waitForTimeout(250);
  await page.keyboard.press('n'); // select H→U (cold start)
  await page.waitForTimeout(120);
  await page.keyboard.press('j'); // cycle → H→R
  await page.waitForTimeout(120);
  await page.keyboard.down('s'); // coarse tier held
  await page.waitForTimeout(250);
  await page.keyboard.press('n'); // coarse jump: skip label, straight to R
  await page.waitForTimeout(300);
  await page.keyboard.up('s');
  s = await state();
  check('coarse Jump Outgoing skips the label straight to R', near(s, 700, 300), fmt(s));
  await page.keyboard.up('f');
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.handleCommands({ kind: 'UNSELECT_ALL' });
  });
  await placeAtLayer(400, 300);
  await page.keyboard.down('f');
  await page.waitForTimeout(250);
  await page.keyboard.press('n'); // select H→U
  await page.waitForTimeout(120);
  await page.keyboard.press('j'); // → H→R
  await page.waitForTimeout(120);
  await page.keyboard.press('j'); // → H→D
  await page.waitForTimeout(120);
  await page.keyboard.down('d'); // fine tier held
  await page.waitForTimeout(250);
  await page.keyboard.press('n'); // fine jump: stop on the waypoint at (400,400)
  await page.waitForTimeout(300);
  await page.keyboard.up('d');
  s = await state();
  check('fine Jump Outgoing stops on the H→D waypoint', near(s, 400, 400), fmt(s));
  await page.keyboard.up('f');

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
