/*
 * Diagnostic for da-259: "Arrowhead placement, and waypoint placement, is
 * sometimes weird. It looks like the latter may sometimes cause the former.
 * I had a node where the line wasn't going into the back of the arrowhead."
 *
 * The destination attachment point is chosen by aiming at the node from the
 * LAST control point (da-edge.getPathPoints). This sweeps a waypoint through
 * positions around and inside the destination node and reports, for each:
 *
 *   inside      is the last control point inside the destination node?
 *   tangentErr  angle between the painted curve's final tangent and the
 *               straight line into the endpoint (degrees) — how far the
 *               stroke is from meeting the arrowhead head-on
 *   reenter     does the painted path pass back inside the destination node
 *               before it terminates? (the line crossing over its own head)
 */
const {chromium} = require('@playwright/test');

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
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(500);

  const probe = offset => page.evaluate(offset => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const edge = dl.getDAEdges()[0];
    const dest = edge.destNode;
    const dx = dest.group.x() + dest.NODE_WIDTH / 2;
    const dy = dest.group.y() + dest.NODE_HEIGHT / 2;

    // One waypoint, `offset` px to the left of the destination centre.
    edge.setControlPoints([{x: dx + offset, y: dy}]);
    edge.refreshGeometry();
    dl.batchDraw();

    const rect = {x: dest.group.x(), y: dest.group.y(),
                  w: dest.NODE_WIDTH, h: dest.NODE_HEIGHT};
    const inRect = p => p.x >= rect.x && p.x <= rect.x + rect.w
                     && p.y >= rect.y && p.y <= rect.y + rect.h;

    const cp = edge.controlPoints[edge.controlPoints.length - 1];
    const path = edge.getRenderedPathPoints(24);
    const end = path[path.length - 1];
    const prev = path[path.length - 2];

    // Arrowhead direction is the painted curve's final tangent; compare it
    // with the straight chord from the last control point to the endpoint.
    const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
    let diff = Math.abs(ang(prev, end) - ang(cp, end)) * 180 / Math.PI;
    while (diff > 180) diff = Math.abs(diff - 360);

    // Does the painted path dip back inside the node before ending?
    let reenter = false;
    for (let i = 0; i < path.length - 1; i++) {
      if (inRect(path[i]) && !inRect(path[i + 1])) reenter = true;
    }

    return {
      inside: inRect({x: cp.x, y: cp.y}),
      tangentErr: Math.round(diff * 10) / 10,
      reenter,
      end: {x: Math.round(end.x), y: Math.round(end.y)},
    };
  }, offset);

  console.log('waypoint offset from destination centre → geometry:');
  const results = [];
  for (const offset of [-300, -200, -120, -60, -30, -10, 0, 10, 30]) {
    const r = await probe(offset);
    results.push({offset, ...r});
    console.log(`  ${String(offset).padStart(5)}px  inside=${String(r.inside).padEnd(5)} ` +
                `tangentErr=${String(r.tangentErr).padStart(6)}°  reenter=${r.reenter}`);
  }

  const outside = results.filter(r => !r.inside);
  const inside = results.filter(r => r.inside);

  check('a waypoint well clear of the node gives a head-on arrowhead',
    outside.every(r => r.tangentErr < 30),
    outside.map(r => `${r.offset}:${r.tangentErr}°`).join(' '));

  // A waypoint dropped INSIDE the node necessarily makes the stroke cross
  // its boundary — that is the user's own geometry, not a defect. Only
  // placements outside the node are held to the no-re-entry rule.
  check('no waypoint outside the node makes the line re-enter it',
    outside.every(r => !r.reenter),
    outside.filter(r => r.reenter).map(r => `${r.offset}px`).join(' ') || 'none');

  check('a waypoint dragged inside the node still aims the arrowhead sanely',
    inside.every(r => r.tangentErr < 30),
    inside.map(r => `${r.offset}:${r.tangentErr}°`).join(' ') || 'no inside cases');

  // Sweep a waypoint around the node just outside it: whichever side the
  // edge attaches to, the stroke must arrive head-on at the arrowhead.
  const ring = await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const edge = dl.getDAEdges()[0];
    const dest = edge.destNode;
    const cx = dest.group.x() + dest.NODE_WIDTH / 2;
    const cy = dest.group.y() + dest.NODE_HEIGHT / 2;
    const radius = Math.max(dest.NODE_WIDTH, dest.NODE_HEIGHT);
    const out = [];
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = deg * Math.PI / 180;
      edge.setControlPoints([{x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius}]);
      edge.refreshGeometry();
      const cp = edge.controlPoints[edge.controlPoints.length - 1];
      const path = edge.getRenderedPathPoints(24);
      const end = path[path.length - 1];
      const prev = path[path.length - 2];
      const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
      let diff = Math.abs(ang(prev, end) - ang(cp, end)) * 180 / Math.PI;
      while (diff > 180) diff = Math.abs(diff - 360);
      out.push({deg, err: Math.round(diff * 10) / 10});
    }
    return out;
  });
  const worst = ring.reduce((a, b) => (b.err > a.err ? b : a), ring[0]);
  console.log('worst tangent error around the node:', JSON.stringify(worst));
  check('the arrowhead is head-on from every approach angle', worst.err < 30,
    ring.filter(r => r.err >= 30).map(r => `${r.deg}°:${r.err}°`).join(' ') || `worst ${worst.err}°`);

  await page.screenshot({path: 'test-output/da-259-arrowhead.png'});
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
