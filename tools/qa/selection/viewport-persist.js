/*
 * The viewport (pan + zoom) survives a page refresh (Ben, 2026-07-20):
 * "when the page refreshes, I don't want to lose my position".
 *
 *   1. Pan + zoom to a distinctive view, then reload → the drawing layer's
 *      x/y/scale come back (within a px), not reset/fit-to-content.
 *   2. The saved draft carries a `view` block.
 *   3. A draft with no `view` (older schema) still loads, falling back to
 *      fit-to-content without throwing.
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

  // Seed a small graph and a deliberately off-default viewport.
  const TARGET = { x: -321, y: 148, scale: 1.7 };
  await page.evaluate((v) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.restoreGraph({
      nodes: [
        {id: 'da-1', x: 200, y: 200, text: 'A', width: 120, height: 60, fontSize: 14, isSelected: false},
        {id: 'da-2', x: 600, y: 400, text: 'B', width: 120, height: 60, fontSize: 14, isSelected: false},
      ],
      edges: [{id: 'da-3', srcNodeId: 'da-1', destNodeId: 'da-2', isSelected: false, labels: []}],
    });
    da.drawingLayer.scale({x: v.scale, y: v.scale});
    da.drawingLayer.position({x: v.x, y: v.y});
    da.drawingLayer.batchDraw();
  }, TARGET);

  // The draft is written on beforeunload; a reload triggers it. Reload and
  // read the restored viewport.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    return { x: dl.x(), y: dl.y(), scale: dl.scaleX(), nodes: dl.getDANodes().length };
  });
  check('graph itself restored', after.nodes === 2, `${after.nodes} nodes`);
  check('pan x restored', Math.abs(after.x - TARGET.x) < 1.5, `${after.x} vs ${TARGET.x}`);
  check('pan y restored', Math.abs(after.y - TARGET.y) < 1.5, `${after.y} vs ${TARGET.y}`);
  check('zoom restored', Math.abs(after.scale - TARGET.scale) < 0.001, `${after.scale} vs ${TARGET.scale}`);

  const draftHasView = await page.evaluate(() => {
    const raw = localStorage.getItem('kidraw_draft_v2');
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d.view ?? null;
  });
  check('saved draft carries a view block', draftHasView
    && Math.abs(draftHasView.scale - TARGET.scale) < 0.001, JSON.stringify(draftHasView));

  // 3. Older draft without a view still loads (fit fallback, no throw).
  await page.evaluate(() => {
    const raw = localStorage.getItem('kidraw_draft_v2');
    const d = JSON.parse(raw);
    delete d.view;
    localStorage.setItem('kidraw_draft_v2', JSON.stringify(d));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(500);
  const legacy = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return { nodes: da.drawingLayer.getDANodes().length, scale: da.drawingLayer.scaleX() };
  });
  check('view-less draft still loads its graph', legacy.nodes === 2, `${legacy.nodes} nodes`);
  check('view-less draft fell back to a sane zoom', legacy.scale > 0, `scale=${legacy.scale}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
