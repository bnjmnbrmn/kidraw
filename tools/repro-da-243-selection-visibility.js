/*
 * Repro for da-243: "Can't tell when an edge is selected. Needs to be more
 * visible. Selection of other graph items also needs to be more visible
 * (including nodes)."
 *
 * The old affordances were pure diagram geometry — an edge stroke going
 * 2 → 4 and a node outline going 2 → 4 — so they scaled with the zoom. At
 * the 25% Ben works at, a "thick" selected edge renders one pixel wider
 * than an unselected one, which is why selection was unreadable.
 *
 * This measures the affordance in SCREEN pixels at several zoom levels:
 * effective width = strokeWidth * (strokeScaleEnabled ? layerScale : 1).
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
  const page = await (await browser.newContext({viewport: {width: 1600, height: 1000}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(500);

  const setZoom = scale => page.evaluate(scale => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    dl.scale({x: scale, y: scale});
    dl.batchDraw();
  }, scale);

  const selectEdge = on => page.evaluate(on => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    dl.getDAEdges()[0].isSelected = on;
    dl.batchDraw();
  }, on);

  const selectNode = on => page.evaluate(on => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    dl.getDANodes()[0].isSelected = on;
    dl.batchDraw();
  }, on);

  // Widest selection affordance on the edge, in screen pixels.
  const edgeAffordance = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    const scale = dl.scaleX();
    const edge = dl.getDAEdges()[0];
    const screenWidth = shape => {
      if (!shape || !shape.visible()) return 0;
      return shape.strokeWidth() * (shape.strokeScaleEnabled() ? scale : 1);
    };
    return {
      stroke: screenWidth(edge._line),
      band: screenWidth(edge._selectionUnderlay),
    };
  });

  const nodeAffordance = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    const scale = dl.scaleX();
    const shape = dl.getDANodes()[0]._shape;
    return shape.strokeWidth() * (shape.strokeScaleEnabled() ? scale : 1);
  });

  for (const scale of [1, 0.5, 0.25]) {
    await setZoom(scale);

    await selectEdge(false);
    await page.waitForTimeout(80);
    const edgeOff = await edgeAffordance();
    await selectEdge(true);
    await page.waitForTimeout(80);
    const edgeOn = await edgeAffordance();

    const edgeDelta = (edgeOn.stroke + edgeOn.band) - (edgeOff.stroke + edgeOff.band);
    console.log(`  zoom ${scale}: edge unselected ${JSON.stringify(edgeOff)} selected ${JSON.stringify(edgeOn)}`);
    // 3 screen px is about the floor for "obviously different at a glance".
    check(`selected edge is clearly wider at ${scale * 100}% zoom`, edgeDelta >= 3,
      `+${edgeDelta.toFixed(1)}px on screen`);

    await selectNode(false);
    await page.waitForTimeout(80);
    const nodeOff = await nodeAffordance();
    await selectNode(true);
    await page.waitForTimeout(80);
    const nodeOn = await nodeAffordance();
    console.log(`  zoom ${scale}: node outline ${nodeOff.toFixed(1)} -> ${nodeOn.toFixed(1)} screen px`);
    check(`selected node outline stays readable at ${scale * 100}% zoom`, nodeOn >= 3,
      `${nodeOn.toFixed(1)}px on screen`);

    await selectEdge(false);
    await selectNode(false);
  }

  // The selection band must not be confused with the nav-focus band, and
  // must disappear on deselect.
  await setZoom(1);
  await selectEdge(true);
  await page.waitForTimeout(80);
  const colors = await page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    const e = dl.getDAEdges()[0];
    return {sel: e._selectionUnderlay?.stroke(), line: e._line.stroke()};
  });
  check('the selection band uses the accent colour, not the edge colour',
    !!colors.sel && colors.sel !== colors.line, JSON.stringify(colors));

  await selectEdge(false);
  await page.waitForTimeout(80);
  const cleared = await page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    return dl.getDAEdges()[0]._selectionUnderlay?.visible();
  });
  check('the band goes away on deselect', cleared === false, String(cleared));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
