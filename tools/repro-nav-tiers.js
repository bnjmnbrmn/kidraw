/*
 * Move-by-node target tiers (Ben, 2026-07-21): the default jump steps between
 * nodes + labels; the coarse modifier narrows to nodes only; the fine
 * modifier widens to nodes + labels + waypoints. Vim profile:
 *   g + hjkl            = nodes + labels
 *   g + hold s + hjkl   = nodes only        (coarse)
 *   g + hold d + hjkl   = + waypoints        (fine)
 *
 * Layout: A on top, B below, edge A→B carrying a label (near) and a pinned
 * waypoint (mid). Straight down, so all three are stops on the down axis.
 */
const { chromium } = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(400);

  const setup = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const mk = (id, cx, cy) => ({id, x: cx - 60, y: cy - 30, text: id, width: 120, height: 60, fontSize: 14, isSelected: false});
    da.drawingLayer.restoreGraph({
      nodes: [mk('A', 600, 300), mk('B', 600, 900)],
      edges: [{id: 'e1', srcNodeId: 'A', destNodeId: 'B', isSelected: false,
        labels: [{id: 'lb', x: 0, y: 0, text: 'lbl', fontSize: 14, isSelected: false, edgeT: 0.3, side: 'on'}],
        controlPoints: [{x: 600, y: 640, waypointId: 'wp', pinned: true}]}],
    });
    const dl = da.drawingLayer, A = dl.getDANodes().find(n => n.id === 'A'), p = A.group.position();
    da.crosshairsLayer.crosshairs.x = (p.x + A.NODE_WIDTH / 2) * dl.scaleX() + dl.x();
    da.crosshairsLayer.crosshairs.y = (p.y + A.NODE_HEIGHT / 2) * dl.scaleY() + dl.y();
    da.drawingLayer.batchDraw();
  });

  // What stop is the crosshairs currently on? Returns 'kind:id' or '(none)'.
  const at = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer, cx = da.crosshairsLayer.crosshairsX(), cy = da.crosshairsLayer.crosshairsY();
    const scale = dl.scaleX(), lx = dl.x(), ly = dl.y();
    const stops = [];
    for (const n of dl.getDANodes()) stops.push(['node:' + n.id,
      lx + (n.konvaGroup.x() + n.NODE_WIDTH / 2) * scale, ly + (n.konvaGroup.y() + n.NODE_HEIGHT / 2) * scale]);
    for (const e of dl.getDAEdges()) for (const l of e.labels) stops.push(['label:' + l.id,
      lx + (l.x + l.width / 2) * scale, ly + (l.y + l.height / 2) * scale]);
    for (const w of dl.getDAWaypoints()) stops.push(['waypoint:' + w.id, lx + w.x * scale, ly + w.y * scale]);
    let best = '(none)', bd = 1e9;
    for (const [tag, x, y] of stops) { const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = tag; } }
    return bd < 8 ? best : '(none)';
  });

  const down = async (mod) => {
    await page.keyboard.down('g'); await page.waitForTimeout(200);
    if (mod) { await page.keyboard.down(mod); await page.waitForTimeout(120); }
    await page.keyboard.press('j'); await page.waitForTimeout(260);
    if (mod) await page.keyboard.up(mod);
    await page.keyboard.up('g'); await page.waitForTimeout(220);
  };

  // --- default tier: nodes + labels; label is nearest, then B (skips waypoint) ---
  await setup();
  await down();
  check('default down lands on the edge label', await at() === 'label:lb', `at ${await at()}`);
  await down();
  check('default down again cycles to B, skipping the waypoint', await at() === 'node:B', `at ${await at()}`);

  // --- coarse tier (hold s): nodes only, jumps straight to B ---
  await setup();
  await down('s');
  check('coarse down (hold s) skips label+waypoint, lands on B', await at() === 'node:B', `at ${await at()}`);

  // --- fine tier (hold d): includes the waypoint ---
  await setup();
  await down('d');
  check('fine down (hold d) lands on the label first', await at() === 'label:lb', `at ${await at()}`);
  await down('d');
  check('fine down again cycles to the waypoint', await at() === 'waypoint:wp', `at ${await at()}`);
  await down('d');
  check('fine down a third time cycles to B', await at() === 'node:B', `at ${await at()}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
