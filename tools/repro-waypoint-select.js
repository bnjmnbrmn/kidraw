/*
 * Reproduce the waypoint-selection bug. Loads the `basic` sample, inserts a
 * waypoint via the real INSERT_WAYPOINT command, then drives both selection
 * commands (SINGLE_ITEM_TOGGLE_SELECT = `c`, MULTI_ITEM_SELECT = the `v`
 * select+drag path) with the crosshairs partially overlapping the waypoint,
 * and reports what each path selected.
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

  const report = await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const xh = c.crosshairsLayer.crosshairs;

    // Put the crosshairs over the first edge's midpoint, then insert a waypoint
    // there via the real command.
    const edge = dl.getDAEdges()[0];
    const pts = edge.getPathPoints();
    const mid = { x: (pts[0].x + pts[pts.length - 1].x) / 2,
                  y: (pts[0].y + pts[pts.length - 1].y) / 2 };
    const toScreen = p => ({ x: p.x * dl.scaleX() + dl.x(), y: p.y * dl.scaleY() + dl.y() });
    const place = layerPt => { const s = toScreen(layerPt); xh.x = s.x; xh.y = s.y; };

    place(mid);
    c.handleCommands({ kind: 'INSERT_WAYPOINT' });
    const wp = dl.getDAWaypoints()[0];
    const wpPos = { x: Math.round(wp.x), y: Math.round(wp.y) };

    const trySelect = (cmdKind, offset) => {
      dl.unselectAll();
      place({ x: wp.x + offset, y: wp.y });   // partial overlap: 15 < circle(20)+wpR(5)
      c.handleCommands({ kind: cmdKind });
      return {
        cmd: cmdKind,
        offset,
        waypointSelected: dl.getDAWaypoints().some(w => w.isSelected),
        edgesSelected: dl.getDAEdges().filter(e => e.isSelected).length,
      };
    };

    const results = [];
    for (const off of [0, 8, 15, 22]) {
      results.push(trySelect('SINGLE_ITEM_TOGGLE_SELECT', off));
      results.push(trySelect('MULTI_ITEM_SELECT', off));
    }
    return { wpPos, results };
  });

  console.log(JSON.stringify(report, null, 2));
  await page.waitForTimeout(200);   // let DebugLogService flush to the log server
  await browser.close();
}

main().catch(e => { console.error('FAILED:', e.stack || e); process.exit(1); });
