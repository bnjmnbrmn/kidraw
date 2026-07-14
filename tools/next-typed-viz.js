/*
 * Typed visualization of the next.org todo graph (see
 * notes/idea-todo-graph-modeling.md): classifies nodes into
 * category / goal / question / note / task, maps each type to a distinct
 * shape + size (colors don't reach the canvas yet — bug-style-colors-not-
 * persisted), renders in DARK theme, and publishes screenshots to
 * https://kidraw.dev.bnjmnbrmn.com/shots/.
 *
 * Types are also recorded as semantic `tags` on the nodes so the dataset is
 * ready for the future edge/node-kind extension slots; the visual styles are
 * pre-flattened into per-node style props because the draft load path
 * doesn't run the tagStyles resolver.
 *
 *   node tools/next-typed-viz.js
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pageHtml, writeRootIndex } = require('./shots-common');
const { buildTypedDraft } = require('./typed-dataset');

const OUT_ROOT = '/var/www/kidraw-shots';
const APP_URL = process.env.KIDRAW_URL || 'http://localhost:4200';
const NEXT_YAML = '/home/bot/projects/meta-project/kdvault/next.kidraw.yaml';

// Usage: node tools/next-typed-viz.js [dataset.kidraw.yaml] [runLabel]
const DATASET = process.argv[2] || NEXT_YAML;
const RUN_LABEL = process.argv[3] || 'next-typed';

async function main() {
  const { draft, counts } = buildTypedDraft(DATASET);
  console.log('classified:', JSON.stringify(counts));

  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '') + '-' + RUN_LABEL;
  const runDir = path.join(OUT_ROOT, stamp);
  fs.mkdirSync(runDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
  await context.addInitScript((d) => {
    localStorage.setItem('kidraw-theme', 'dark');
    localStorage.setItem('kidraw_draft_v2', d);
  }, JSON.stringify(draft));
  const page = await context.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(700);

  const da = (body, arg) => page.evaluate(([b, a]) => {
    const comp = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return new Function('da', 'arg', b)(comp, a);
  }, [body, arg ?? null]);

  const waitRoutingIdle = () => page.waitForFunction(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return c.routingWorker === null || c.routingWorker === undefined;
  }, { timeout: 30000 });

  const baseline = await da('return da.drawingLayer.serializeGraph();');
  const canvasBox = await page.locator('#mainDrawingArea').boundingBox();
  const shots = [];

  // Rank = 0 → busiest node (by degree), 1 → second busiest, and so on.
  const hubExpr = (rank) => `
    (dl.getDANodes().slice().sort((a, b) =>
      (b.outgoingEdges.length + b.incomingEdges.length)
      - (a.outgoingEdges.length + a.incomingEdges.length))[${rank}])`;
  const centerOn = async (rank, scale) => da(`
    const dl = da.drawingLayer;
    const hub = ${hubExpr(rank)};
    if (!hub) return;
    const s = ${scale};
    dl.scaleX(s); dl.scaleY(s);
    dl.x(da.stage.width() / 2 - (hub.konvaGroup.x() + hub.NODE_WIDTH / 2) * s);
    dl.y(da.stage.height() / 2 - (hub.konvaGroup.y() + hub.NODE_HEIGHT / 2) * s);
    dl.batchDraw();
  `);

  // Cyan → yellow direction gradient on every edge (source → dest), the
  // flow-direction experiment. Re-applied after graph restores (LOAD_NAMED
  // rebuilds the DAEdge objects).
  const applyGradient = () => da(`
    da.drawingLayer.getDAEdges().forEach(e =>
      e.setDirectionGradient({from: '#22d3ee', to: '#facc15'}));
    da.drawingLayer.batchDraw();
  `);

  // Move the crosshairs onto the rank-th busiest node so gather anchors on
  // it, then gather around it.
  const gatherOn = async (rank) => {
    await da(`
      da.tweens.forEach(t => t.finish()); da.tweens = [];
      const dl = da.drawingLayer;
      const hub = ${hubExpr(rank)};
      da.crosshairsLayer.crosshairs.x = dl.x() + (hub.konvaGroup.x() + hub.NODE_WIDTH / 2) * dl.scaleX();
      da.crosshairsLayer.crosshairs.y = dl.y() + (hub.konvaGroup.y() + hub.NODE_HEIGHT / 2) * dl.scaleY();
      da.handleCommands({kind: "GATHER_DESCENDANTS"});
    `);
    await page.waitForTimeout(500);
    await da('da.tweens.forEach(t => t.finish()); da.tweens = [];');
  };
  const ungather = async () => {
    await da('da.handleCommands({kind: "UNGATHER"});');
    await page.waitForTimeout(500);
    await da('da.tweens.forEach(t => t.finish()); da.tweens = [];');
  };

  for (const layout of ['tree-right-clear']) {
    await waitRoutingIdle();
    await da('da.handleCommands({kind: "LOAD_NAMED_GRAPH", graphSnapshot: arg});', baseline);
    await page.waitForTimeout(200);
    await da(`da.handleCommands({kind: "APPLY_LAYOUT", layout: ${JSON.stringify(layout)}});`);
    await page.waitForTimeout(300);
    await waitRoutingIdle();
    await da('da.tweens.forEach(t => t.finish()); da.tweens = [];');
    await applyGradient();

    const shoot = async (name) => {
      await page.waitForTimeout(450);
      await da('da.tweens.forEach(t => t.finish()); da.tweens = [];');
      const file = `${layout}--${name}.png`;
      await page.screenshot({ path: path.join(runDir, file), clip: canvasBox });
      shots.push({ layout, name, file });
      console.log('shot', file);
    };

    // Plain views.
    await da('da.handleCommands({kind:"UNSELECT_ALL"}); da.handleCommands({kind:"RECENTER_VIEW"});');
    await shoot('fit');
    await centerOn(0, 0.7);
    await shoot('hub1-70');
    await centerOn(1, 0.7);
    await shoot('hub2-70');

    // Gather Around: child column right, ancestors left, edges re-routed.
    await gatherOn(1);
    await centerOn(1, 0.55);
    await shoot('gather-hub2');
    await ungather();

    await gatherOn(2);
    await centerOn(2, 0.7);
    await shoot('gather-hub3');
    await ungather();
  }
  await browser.close();

  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '..') }).toString().trim(); } catch {}
  const byLayout = {};
  for (const s of shots) (byLayout[s.layout] ??= []).push(s);
  const sections = Object.entries(byLayout).map(([layout, ss]) => `
    <h2>${layout}</h2>
    <div class="row">${ss.map(s => `
      <figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a>
      <figcaption>${s.layout} · ${s.name}</figcaption></figure>`).join('')}
    </div>`).join('');
  fs.writeFileSync(path.join(runDir, 'index.html'), pageHtml(
    `next.org typed — ${stamp}`,
    'next.org, typed (dark)',
    `commit <code>${commit}</code> · category=big box · goal=circle · question=diamond · note=small box · task=default`,
    sections,
  ));

  writeRootIndex(OUT_ROOT);

  console.log(`\npublished → https://kidraw.dev.bnjmnbrmn.com/shots/${stamp}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
