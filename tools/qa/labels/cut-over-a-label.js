/*
 * With nothing selected, Cut (`x`) over an edge's label removes the label,
 * not the edge.
 *
 * Until 2026-09-24 the delete behind Cut took its own order (waypoint, node,
 * edge, label). A label sits on its edge, so the crosshairs over it were over
 * the edge too, and the edge went while the hover trace was around the label.
 * Ben chose the label alone (Ben, 2026-09-24). Pointing at the edge away from
 * its label still removes the edge.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();

/** Two nodes 500px apart, a label at the middle of the edge between them
 *  (the sample's edges are too short to point beside a label), nothing
 *  selected, and the crosshairs at `t` along the edge. */
async function labelledEdge(page, t) {
  await page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
    const node = (id, x, y, text) => ({id, x, y, text, width: 120, height: 60, fontSize: 14, isSelected: false});
    dl.restoreGraph({nodes: [node('da-1', 100, 300, 'A'), node('da-2', 700, 300, 'B')],
      edges: [{id: 'da-3', srcNodeId: 'da-1', destNodeId: 'da-2', isSelected: false, labels: []}]});
    dl.scale({x: 1, y: 1}); dl.x(0); dl.y(0);
    da.finishTweens();
    const edge = dl.getDAEdges()[0];
    const at = t => { const p = edge.getPathPoints(); const a = p[0], b = p[p.length - 1];
      return {x: (a.x + t * (b.x - a.x)) * dl.scaleX() + dl.x(), y: (a.y + t * (b.y - a.y)) * dl.scaleY() + dl.y()}; };
    Object.assign(da.crosshairsLayer.crosshairs, at(0.5));
    da.addLabel();
    window.__at = at;
  })()`);
  await page.keyboard.type('note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await settled(page);
  return page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
    dl.unselectAll(); da.unselectAllLabels();
    Object.assign(da.crosshairsLayer.crosshairs, window.__at(${t}));
    da.crosshairsLayer.showCrosshairs(); dl.batchDraw();
    return {hover: da.crosshairHoverTarget()?.kind ?? null, ...counts(dl)};
    function counts(dl) { return {edges: dl.getDAEdges().length,
      labels: dl.getDAEdges().reduce((n, e) => n + e.labels.length, 0)}; }
  })()`);
}

const cut = page => page.evaluate(`(() => { const da = ${DA}; const dl = da.drawingLayer;
  da.handleCommand({kind: 'CUT_SELECTION'});
  return {edges: dl.getDAEdges().length, labels: dl.getDAEdges().reduce((n, e) => n + e.labels.length, 0),
    clipboard: da.clipboard.held?.nodes.length ?? 0}; })()`);

(async () => {
  const browser = await launch();
  const page = await openApp(browser);

  let before = await labelledEdge(page, 0.5);
  check('the hover trace is around the label', before.hover === 'label', JSON.stringify(before));
  let after = await cut(page);
  check('Cut over the label removes the label', after.labels === before.labels - 1, JSON.stringify({before, after}));
  check('…and leaves its edge', after.edges === before.edges, JSON.stringify({before, after}));

  before = await labelledEdge(page, 0.1);
  check('away from the label, the hover trace is around the edge', before.hover === 'edge', JSON.stringify(before));
  after = await cut(page);
  check('Cut over the edge removes the edge', after.edges === before.edges - 1, JSON.stringify({before, after}));

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
