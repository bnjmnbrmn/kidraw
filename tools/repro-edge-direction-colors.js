/*
 * Edge coloring depends on directedness (Ben, 2026-07-20): the cyan→yellow
 * direction gradient depicts flow, which is meaningless for undirected and
 * bidirectional edges — those get their own flat colors instead.
 *
 *   1. A directed edge renders with the gradient (stroke cleared, color
 *      stops set, arrowhead fill = the gradient's dest color).
 *   2. Cycling it to undirected drops the gradient and paints it the flat
 *      undirected palette color.
 *   3. Bidirectional gets its own distinct flat color.
 *   4. Reverting to directed restores the gradient.
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
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.restoreGraph({
      nodes: [
        {id: 'da-1', x: 300, y: 300, text: 'A', width: 120, height: 60, fontSize: 14, isSelected: false},
        {id: 'da-2', x: 300, y: 700, text: 'B', width: 120, height: 60, fontSize: 14, isSelected: false},
      ],
      edges: [{id: 'da-3', srcNodeId: 'da-1', destNodeId: 'da-2', isSelected: false, labels: []}],
    });
    da.drawingLayer.batchDraw();
  });

  const paint = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const line = da.drawingLayer.getDAEdges()[0]._line;
    return {
      dir: da.drawingLayer.getDAEdges()[0].directedness,
      stroke: line.stroke() || null,
      stops: line.strokeLinearGradientColorStops() || [],
      rawStops: line.strokeLinearGradientColorStops() ?? null,
      fill: line.fill(),
    };
  });

  const selectEdge = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.unselectAll();
    da.drawingLayer.getDAEdges()[0].isSelected = true;
    da.drawingLayer.batchDraw();
  });

  // --- 1. directed → gradient ---
  let p = await paint();
  check('directed edge uses the gradient (color stops present, stroke cleared)',
    p.dir === 'directed' && p.stops.length === 4 && !p.stroke,
    JSON.stringify({dir: p.dir, stops: p.stops.length, stroke: p.stroke}));
  const gradientDest = p.stops[3];
  check('directed arrowhead fill = gradient dest color', p.fill === gradientDest,
    `fill=${p.fill} dest=${gradientDest}`);

  // --- 2. v+o → undirected: flat, no gradient ---
  await selectEdge();
  await page.keyboard.down('v');
  await page.waitForTimeout(200);
  await page.keyboard.press('o'); // → reversed (still directed, still gradient)
  await page.waitForTimeout(100);
  await page.keyboard.press('o'); // → undirected
  await page.waitForTimeout(100);
  p = await paint();
  check('undirected edge drops the gradient', p.dir === 'undirected' && p.stops.length === 0,
    JSON.stringify({dir: p.dir, stops: p.stops.length}));
  // Regression guard: an EMPTY stops array is truthy to Konva's hasStroke()
  // and renders a transparent gradient — the line must be cleared to null so
  // the flat stroke actually paints.
  check('undirected gradient cleared to null (line is not invisible)', p.rawStops === null,
    `rawStops=${JSON.stringify(p.rawStops)}`);
  check('undirected edge is a flat solid color', !!p.stroke && p.stroke === p.fill
    && p.stroke !== gradientDest, `stroke=${p.stroke}`);
  const undirectedColor = p.stroke;

  // --- 3. bidirectional: its own distinct flat color ---
  await page.keyboard.press('o'); // → bidirectional
  await page.waitForTimeout(100);
  p = await paint();
  check('bidirectional edge is flat too', p.dir === 'bidirectional' && p.stops.length === 0
    && !!p.stroke && p.stroke === p.fill, JSON.stringify({dir: p.dir, stroke: p.stroke}));
  check('bidirectional color differs from undirected and the gradient',
    p.stroke !== undirectedColor && p.stroke !== gradientDest,
    `bidi=${p.stroke} undirected=${undirectedColor} gradientDest=${gradientDest}`);

  // --- 4. back to directed → gradient restored ---
  await page.keyboard.press('o'); // → forward directed
  await page.waitForTimeout(100);
  await page.keyboard.up('v');
  await page.waitForTimeout(150);
  p = await paint();
  check('reverting to directed restores the gradient',
    p.dir === 'directed' && p.stops.length === 4 && !p.stroke,
    JSON.stringify({dir: p.dir, stops: p.stops.length}));

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
