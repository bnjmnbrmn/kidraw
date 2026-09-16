/*
 * Verify path-anchored edge labels end to end. Loads `basic`, adds a label
 * via the real addLabel flow (crosshairs over an edge), then checks that:
 *   1. the label anchors at the projected t on the line ('on'),
 *   2. moving a node re-places the label on the new path (same t),
 *   3. re-routing (new control points) re-places it too,
 *   4. label-only movement keys slide t (x-axis), snap between the
 *      start/middle/end stops (coarse), and cycle above/on/below (y-axis),
 *   5. anchors survive a serialize/restore round trip,
 *   6. a legacy snapshot (absolute x/y, no anchor) restores by projection.
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
  await page.waitForTimeout(500);

  const out = await page.evaluate(() => {
    const r = {};
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const xh = c.crosshairsLayer.crosshairs;
    const edge = dl.getDAEdges()[0];

    const pathAt = (points, t) => {
      const lens = [];
      let total = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const l = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
        lens.push(l); total += l;
      }
      let target = t * total, acc = 0;
      for (let i = 0; i < lens.length; i++) {
        if (acc + lens[i] >= target || i === lens.length - 1) {
          const st = lens[i] > 0 ? (target - acc) / lens[i] : 0;
          return {
            x: points[i].x + st * (points[i + 1].x - points[i].x),
            y: points[i].y + st * (points[i + 1].y - points[i].y),
          };
        }
        acc += lens[i];
      }
    };
    const distToPathAt = (label, t) => {
      const p = pathAt(edge.getPathPoints(), t);
      return Math.hypot(label.x - p.x, label.y - p.y);
    };

    // 1. Real addLabel flow: crosshairs over the path's 30% point.
    c.tweens.forEach(t => t.finish()); c.tweens = [];
    const target = pathAt(edge.getPathPoints(), 0.3);
    xh.x = target.x * dl.scaleX() + dl.x();
    xh.y = target.y * dl.scaleY() + dl.y();
    c.addLabel();
    const label = edge.labels[edge.labels.length - 1];
    r.added = !!label;
    r.addT = label?.edgeT;
    r.addSide = label?.side;
    r.addOnPath = label ? distToPathAt(label, label.edgeT) : -1;

    // 2. Move the source node; the label must follow the new path.
    // (Move it *away* from the dest node — moving onto it collapses the
    // edge to a zero-length path and there is no anchor to follow.)
    const tBefore = label.edgeT;
    edge.srcNode.konvaGroup.x(edge.srcNode.konvaGroup.x() - 180);
    edge.srcNode.konvaGroup.y(edge.srcNode.konvaGroup.y() + 120);
    edge.refreshGeometry();
    r.followT = label.edgeT === tBefore;
    r.followOnPath = distToPathAt(label, label.edgeT);

    // 3. Re-route: router-style control points re-place the label as well.
    const pts = edge.getPathPoints();
    const mid = pathAt(pts, 0.5);
    edge.setControlPoints([{ x: mid.x + 80, y: mid.y - 60 }]);
    r.rerouteOnPath = distToPathAt(label, label.edgeT);

    // 4. Label-only movement: slide, coarse snap, side cycle.
    dl.getDANodes().forEach(n => n.isSelected = false);
    dl.getDAEdges().forEach(e => { e.isSelected = false; e.labels.forEach(l => l.isSelected = false); });
    label.isSelected = true;

    const tSlide0 = label.edgeT;
    c.dragSelected('x', 1);
    r.slideRight = label.edgeT > tSlide0;
    c.dragSelected('x', 1, 'coarse');
    r.coarseStop = label.edgeT;
    c.dragSelected('x', 1, 'coarse');
    r.coarseStop2 = label.edgeT;

    r.side0 = label.side;
    c.dragSelected('y', -1);
    r.sideUp = label.side;
    const yAbove = label.y;
    c.dragSelected('y', 1); c.dragSelected('y', 1);
    r.sideDown2 = label.side;
    r.belowIsLower = label.y > yAbove;

    // 5. Serialize/restore round trip keeps the anchor.
    const snap = dl.serializeGraph();
    dl.restoreGraph(JSON.parse(JSON.stringify(snap)));
    const rEdge = dl.getDAEdges().find(e => e.labels.length > 0);
    const rLabel = rEdge.labels[0];
    r.roundTripT = rLabel.edgeT;
    r.roundTripSide = rLabel.side;
    r.expectedT = label.edgeT;
    r.expectedSide = label.side;

    // 6. Legacy snapshot: strip anchors, keep absolute x/y → projection.
    const legacy = JSON.parse(JSON.stringify(dl.serializeGraph()));
    const legacyLabel = legacy.edges.find(e => e.labels.length > 0).labels[0];
    delete legacyLabel.edgeT;
    delete legacyLabel.side;
    dl.restoreGraph(legacy);
    const lEdge = dl.getDAEdges().find(e => e.labels.length > 0);
    const lLabel = lEdge.labels[0];
    r.legacyT = lLabel.edgeT;
    r.legacySide = lLabel.side;
    r.legacyDrift = Math.hypot(lLabel.x - legacyLabel.x, lLabel.y - legacyLabel.y);

    return r;
  });

  check('label added via addLabel flow', out.added);
  check('anchored near t=0.3', Math.abs(out.addT - 0.3) < 0.1, `t=${out.addT?.toFixed(3)}`);
  check('added on the line', out.addSide === 'on', out.addSide);
  check('rendered on path at anchor', out.addOnPath < 1, `${out.addOnPath?.toFixed(2)}px off`);
  check('node move keeps t', out.followT);
  check('node move re-places label on new path', out.followOnPath < 1, `${out.followOnPath?.toFixed(2)}px off`);
  check('re-route re-places label on new path', out.rerouteOnPath < 1, `${out.rerouteOnPath?.toFixed(2)}px off`);
  check('right key slides label forward', out.slideRight);
  check('coarse right snaps to a canonical stop', [0.5, 0.9].includes(out.coarseStop), `t=${out.coarseStop}`);
  check('second coarse right reaches the end stop', out.coarseStop2 === 0.9, `t=${out.coarseStop2}`);
  check('up key moves side to above', out.side0 === 'on' && out.sideUp === 'above', `${out.side0} → ${out.sideUp}`);
  check('two down keys reach below', out.sideDown2 === 'below', out.sideDown2);
  check('below renders lower than above', out.belowIsLower);
  check('anchor survives serialize/restore', out.roundTripT === out.expectedT && out.roundTripSide === out.expectedSide,
    `t=${out.roundTripT} side=${out.roundTripSide}`);
  check('legacy snapshot derives anchor by projection', out.legacyT !== undefined && out.legacyDrift < 2,
    `t=${out.legacyT?.toFixed(3)} side=${out.legacySide} drift=${out.legacyDrift?.toFixed(2)}px`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
