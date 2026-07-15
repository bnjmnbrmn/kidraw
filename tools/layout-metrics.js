/*
 * Layout quality metrics on typed todo datasets. For each dataset × layout,
 * measures on the RENDERED edge paths (so routed and straight variants are
 * comparable):
 *
 *   pierces    — edges whose rendered path enters a non-endpoint node box
 *                (inflated 6px)
 *   crossings  — rendered-segment crossings between edges sharing no endpoint
 *   levelAlign — mean per-BFS-level standard deviation of the depth-axis
 *                coordinate (x for tree-right): 0 = every level is a perfect
 *                column
 *
 *   node tools/layout-metrics.js
 */
const { chromium } = require('@playwright/test');
const { buildTypedDraft } = require('./typed-dataset');

const APP_URL = process.env.KIDRAW_URL || 'http://localhost:4200';

const DATASETS = {
  'next(tree)': '/home/bot/projects/meta-project/kdvault/next.kidraw.yaml',
  'kidraw-dev(non-tree)': `${__dirname}/../src/app/services/samples/kidraw-dev-sample.ts`,
};
const LAYOUTS = ['tree-right', 'tree-right-clear', 'force-clear'];

const MEASURE = `
  const dl = da.drawingLayer;
  const nodes = dl.getDANodes();
  const edges = dl.getDAEdges().filter(e => e.srcNode !== e.destNode);

  // Rendered-path segments per edge.
  const segsOf = e => {
    const p = e.getRenderedPathPoints();
    const out = [];
    for (let i = 0; i + 1 < p.length; i++) out.push([p[i], p[i + 1]]);
    return out;
  };
  const segRect = (a, b, minX, minY, maxX, maxY) => {
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const P = [-dx, dx, -dy, dy], Q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
    for (let i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return false; }
      else { const r = Q[i] / P[i];
        if (P[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; } }
    }
    return true;
  };

  // Use RENDERED rects: fit-mode cards render smaller than their base
  // NODE_WIDTH, and phantom pierces against the base box aren't real.
  const rectOf = new Map(nodes.map(n => {
    const r = n.konvaGroup.getClientRect({relativeTo: dl});
    return [n, Number.isFinite(r.width) ? r
      : {x: n.konvaGroup.x(), y: n.konvaGroup.y(), width: n.NODE_WIDTH, height: n.NODE_HEIGHT}];
  }));
  const CL = 6;
  let pierces = 0;
  for (const e of edges) {
    const segs = segsOf(e);
    outer: for (const n of nodes) {
      if (n === e.srcNode || n === e.destNode) continue;
      const r = rectOf.get(n);
      const minX = r.x - CL, minY = r.y - CL;
      const maxX = r.x + r.width + CL, maxY = r.y + r.height + CL;
      for (const [a, b] of segs) {
        if (segRect(a, b, minX, minY, maxX, maxY)) { pierces++; break outer; }
      }
    }
  }

  const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const segsCross = (p, q, r, s) => {
    const d1 = orient(r, s, p), d2 = orient(r, s, q);
    const d3 = orient(p, q, r), d4 = orient(p, q, s);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const A = edges[i], B = edges[j];
      if (A.srcNode === B.srcNode || A.srcNode === B.destNode ||
          A.destNode === B.srcNode || A.destNode === B.destNode) continue;
      let hit = false;
      for (const [a, b] of segsOf(A)) {
        for (const [c, d] of segsOf(B)) {
          if (segsCross(a, b, c, d)) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) crossings++;
    }
  }

  // Level alignment as the eye sees it: how tightly do node centers cluster
  // into depth-axis columns? Greedy cluster x-centers with a 30px merge
  // radius; report the column count next to the BFS depth count (perfectly
  // aligned tree ⇒ columns === depths) and the mean in-cluster deviation.
  const xs = nodes.map(n => {
    const r = rectOf.get(n);
    return r.x + r.width / 2;
  }).sort((a, b) => a - b);
  const clusters = [];
  for (const x of xs) {
    const c = clusters[clusters.length - 1];
    if (c && x - c.last <= 30) { c.vals.push(x); c.last = x; }
    else clusters.push({vals: [x], last: x});
  }
  let dev = 0;
  for (const c of clusters) {
    const mean = c.vals.reduce((s, v) => s + v, 0) / c.vals.length;
    dev += c.vals.reduce((s, v) => s + Math.abs(v - mean), 0) / c.vals.length;
  }
  const inDeg = new Map(nodes.map(n => [n, 0]));
  const kids = new Map(nodes.map(n => [n, []]));
  for (const e of edges) {
    if (!kids.get(e.srcNode).includes(e.destNode)) {
      kids.get(e.srcNode).push(e.destNode);
      inDeg.set(e.destNode, inDeg.get(e.destNode) + 1);
    }
  }
  const level = new Map();
  const queue = nodes.filter(n => inDeg.get(n) === 0);
  queue.forEach(n => level.set(n, 0));
  while (queue.length > 0) {
    const n = queue.shift();
    for (const c of kids.get(n)) {
      if (!level.has(c)) { level.set(c, level.get(n) + 1); queue.push(c); }
    }
  }
  for (const n of nodes) if (!level.has(n)) level.set(n, 0);
  const depthCount = new Set(level.values()).size;

  return {
    pierces, crossings,
    columns: clusters.length,
    depths: depthCount,
    clusterDev: +(dev / clusters.length).toFixed(1),
    nodes: nodes.length, edges: edges.length,
  };
`;

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });

  const rows = [];
  for (const [name, file] of Object.entries(DATASETS)) {
    const { draft } = buildTypedDraft(file);
    const context = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
    await context.addInitScript((d) => {
      localStorage.setItem('kidraw-theme', 'dark');
      localStorage.setItem('kidraw_draft_v2', d);
    }, JSON.stringify(draft));
    const page = await context.newPage();
    page.on('pageerror', e => console.error(`[${name}] page error:`, e.message));
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
    await page.waitForTimeout(600);

    const da = (body, arg) => page.evaluate(([b, a]) => {
      const comp = window.ng.getComponent(document.querySelector('app-drawing-area'));
      return new Function('da', 'arg', b)(comp, a);
    }, [body, arg ?? null]);
    const waitIdle = () => page.waitForFunction(() => {
      const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
      return c.routingWorker === null || c.routingWorker === undefined;
    }, { timeout: 30000 });

    const baseline = await da('return da.drawingLayer.serializeGraph();');
    for (const layout of LAYOUTS) {
      await waitIdle();
      await da('da.handleCommands({kind: "LOAD_NAMED_GRAPH", graphSnapshot: arg});', baseline);
      await page.waitForTimeout(200);
      await da(`da.handleCommands({kind: "APPLY_LAYOUT", layout: ${JSON.stringify(layout)}});`);
      await page.waitForTimeout(300);
      await waitIdle();
      await da('da.tweens.forEach(t => t.finish()); da.tweens = [];');
      const m = await da(MEASURE);
      rows.push({ dataset: name, layout, ...m });
      console.log(`${name} ${layout}: pierces=${m.pierces} crossings=${m.crossings} columns=${m.columns}/${m.depths} dev=${m.clusterDev}px`);
    }
    await context.close();
  }
  await browser.close();

  console.log('\n| dataset | layout | pierces | crossings | x-columns (vs depths) | in-column dev |');
  console.log('| :-- | :-- | --: | --: | --: | --: |');
  for (const r of rows) {
    console.log(`| ${r.dataset} | ${r.layout} | ${r.pierces} | ${r.crossings} | ${r.columns} (${r.depths}) | ${r.clusterDev}px |`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
