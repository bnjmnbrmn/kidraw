/*
 * Verify that jumping to a search match moves the crosshairs onto the match
 * AND recenters the view on it (the match lands at screen center under the
 * crosshairs). Drives SEARCH_GRAPH via a stubbed window.prompt and cycles
 * with SEARCH_NEXT_MATCH.
 */
const {launch, openApp, settled, movedAndSettled, crosshairsOf, afterFrame,
  overlay: waitForOverlay, waitForDA, checker} = require('../harness');

const check = checker();

async function main() {
  const browser = await launch();
  const page = await openApp(browser, {width: 1600, height: 1000});
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
      // The usable viewport centre, not the stage centre: the shell reserves
      // room for the keymenu and panels through viewportInset, so recentring
      // targets viewCenterX/Y. The old stage-centre assumption was 102px out.
      stageCenter: { x: da.viewCenterX(), y: da.viewCenterY() },
      cross: { x: da.crosshairsLayer.crosshairsX(), y: da.crosshairsLayer.crosshairsY() },
    };
  });
  const near = (a, b, tol) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

  const search = async (query) => {
    await page.evaluate((q) => { window.prompt = () => q; }, query);
    await page.evaluate(() => {
      window.ng.getComponent(document.querySelector('app-drawing-area'))
        .handleCommand({ kind: 'SEARCH_GRAPH' });
    });
    await page.waitForTimeout(500); // recenter tween
  };
  const next = async () => {
    await page.evaluate(() => {
      window.ng.getComponent(document.querySelector('app-drawing-area'))
        .handleCommand({ kind: 'SEARCH_NEXT_MATCH' });
    });
    await page.waitForTimeout(500);
  };

  // 1. Search 'apple' — the only apple match.
  await search('apple');
  let s = await probe();
  check('search selects the matching node', s.sel.includes('apple'), JSON.stringify(s.sel));
  check('match is recentered to the usable viewport centre', near(s.nodeStage, s.stageCenter, 4),
    `node@(${s.nodeStage?.x.toFixed(0)},${s.nodeStage?.y.toFixed(0)}) center@(${s.stageCenter.x},${s.stageCenter.y})`);
  check('crosshairs sit on the match (viewport centre)', near(s.cross, s.stageCenter, 4),
    `xh@(${s.cross.x.toFixed(0)},${s.cross.y.toFixed(0)})`);

  // 2. Cycle to the next match (banana, far away) — recenters again.
  await search('a'); // matches both apple and banana; first is apple
  await next();       // → banana
  s = await probe();
  check('cycling to the far match selects it', s.sel.includes('banana'), JSON.stringify(s.sel));
  check('far match is recentered to the viewport centre', near(s.nodeStage, s.stageCenter, 4),
    `node@(${s.nodeStage?.x.toFixed(0)},${s.nodeStage?.y.toFixed(0)})`);
  check('crosshairs land on the far match', near(s.cross, s.stageCenter, 4),
    `xh@(${s.cross.x.toFixed(0)},${s.cross.y.toFixed(0)})`);

  await browser.close();
  console.log(check.failures === 0 ? 'ALL CHECKS PASSED' : `${check.failures} CHECK(S) FAILED`);
  process.exit(check.failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
