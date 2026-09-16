/*
 * Reproduce the "second-waypoint changes the edge shape" bug. Loads `basic`,
 * inserts a first waypoint that bends the edge, then inserts a second waypoint
 * with the crosshairs off the bent polyline. Reports the resulting control
 * points and whether the second insertion shifted the polyline through a point
 * that lies off it.
 */
const { chromium } = require('@playwright/test');

async function main() {
  const browser = await chromium.launch({ headless: true });
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
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const xh = c.crosshairsLayer.crosshairs;
    const edge = dl.getDAEdges()[0];
    const pts0 = edge.getPathPoints();
    const a = pts0[0], b = pts0[pts0.length - 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;   // unit normal to the straight line

    const place = layerPt => {
      xh.x = layerPt.x * dl.scaleX() + dl.x();
      xh.y = layerPt.y * dl.scaleY() + dl.y();
    };

    // First waypoint: 40 units off the straight line at midpoint.
    place({ x: mid.x + 40 * nx, y: mid.y + 40 * ny });
    c.handleCommands({ kind: 'INSERT_WAYPOINT' });
    const after1 = edge.getPathPoints().map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    dl.unselectAll();

    // Second waypoint: 25 units off the bent polyline, in the first segment.
    // Take 1/4 of the way along segment 0 (a → first cp) then offset.
    const seg0a = after1[0], seg0b = after1[1];
    const q = 0.25;
    const onSeg = { x: seg0a.x + q * (seg0b.x - seg0a.x), y: seg0a.y + q * (seg0b.y - seg0a.y) };
    // Perpendicular to seg0:
    const sx = seg0b.x - seg0a.x, sy = seg0b.y - seg0a.y;
    const slen = Math.hypot(sx, sy) || 1;
    const px = -sy / slen, py = sx / slen;
    const targetCrosshairs = { x: onSeg.x + 25 * px, y: onSeg.y + 25 * py };
    place(targetCrosshairs);
    c.handleCommands({ kind: 'INSERT_WAYPOINT' });
    const after2 = edge.getPathPoints().map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));

    return {
      after1,
      crosshairsForSecond: { x: Math.round(targetCrosshairs.x), y: Math.round(targetCrosshairs.y) },
      onExistingSeg: { x: Math.round(onSeg.x), y: Math.round(onSeg.y) },
      after2,
    };
  });

  console.log(JSON.stringify(out, null, 2));
  await page.waitForTimeout(200);
  await browser.close();
}

main().catch(e => { console.error('FAILED:', e.stack || e); process.exit(1); });
