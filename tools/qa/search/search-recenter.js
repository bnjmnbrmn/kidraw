/*
 * Verify that jumping to a search match moves the crosshairs onto the match
 * AND recenters the view on it (the match lands at screen center under the
 * crosshairs). Drives SEARCH_GRAPH via a stubbed window.prompt and cycles
 * with SEARCH_NEXT_MATCH.
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

  // Two nodes far apart so a jump must pan a long way.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const N = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    const apple = new N(-4000, -3000, 'apple', 'apple');
    const banana = new N(5000, 3500, 'banana', 'banana');
    dl.addRawNode(apple);
    dl.addRawNode(banana);
    dl.addEdge(apple, banana);
    dl.batchDraw();
  });

  const probe = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const stage = da.stage;
    const sel = dl.getSelectedDANodes().map(n => n.id);
    // The selected node's center in stage coords, vs stage center and crosshairs.
    let nodeStage = null;
    const n = dl.getSelectedDANodes()[0];
    if (n) {
      const s = dl.scaleX();
      nodeStage = {
        x: dl.x() + (n.konvaGroup.x() + n.NODE_WIDTH / 2) * s,
        y: dl.y() + (n.konvaGroup.y() + n.NODE_HEIGHT / 2) * s,
      };
    }
    return {
      sel,
      nodeStage,
      stageCenter: { x: stage.width() / 2, y: stage.height() / 2 },
      cross: { x: da.crosshairsLayer.crosshairsX(), y: da.crosshairsLayer.crosshairsY() },
    };
  });
  const near = (a, b, tol) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

  const search = async (query) => {
    await page.evaluate((q) => { window.prompt = () => q; }, query);
    await page.evaluate(() => {
      window.ng.getComponent(document.querySelector('app-drawing-area'))
        .handleCommands({ kind: 'SEARCH_GRAPH' });
    });
    await page.waitForTimeout(500); // recenter tween
  };
  const next = async () => {
    await page.evaluate(() => {
      window.ng.getComponent(document.querySelector('app-drawing-area'))
        .handleCommands({ kind: 'SEARCH_NEXT_MATCH' });
    });
    await page.waitForTimeout(500);
  };

  // 1. Search 'apple' — the only apple match.
  await search('apple');
  let s = await probe();
  check('search selects the matching node', s.sel.includes('apple'), JSON.stringify(s.sel));
  check('match is recentered to the stage center', near(s.nodeStage, s.stageCenter, 4),
    `node@(${s.nodeStage?.x.toFixed(0)},${s.nodeStage?.y.toFixed(0)}) center@(${s.stageCenter.x},${s.stageCenter.y})`);
  check('crosshairs sit on the match (stage center)', near(s.cross, s.stageCenter, 4),
    `xh@(${s.cross.x.toFixed(0)},${s.cross.y.toFixed(0)})`);

  // 2. Cycle to the next match (banana, far away) — recenters again.
  await search('a'); // matches both apple and banana; first is apple
  await next();       // → banana
  s = await probe();
  check('cycling to the far match selects it', s.sel.includes('banana'), JSON.stringify(s.sel));
  check('far match is recentered to stage center', near(s.nodeStage, s.stageCenter, 4),
    `node@(${s.nodeStage?.x.toFixed(0)},${s.nodeStage?.y.toFixed(0)})`);
  check('crosshairs land on the far match', near(s.cross, s.stageCenter, 4),
    `xh@(${s.cross.x.toFixed(0)},${s.cross.y.toFixed(0)})`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
