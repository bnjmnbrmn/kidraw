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
const yaml = require('js-yaml');

const OUT_ROOT = '/var/www/kidraw-shots';
const APP_URL = process.env.KIDRAW_URL || 'http://localhost:4200';
const NEXT_YAML = '/home/bot/projects/meta-project/kdvault/next.kidraw.yaml';

// Explicit category nodes (grouping buckets that never "complete").
const CATEGORY_IDS = new Set(['n0', 'n1', 'n29', 'n8', 'n25']);
// Ends in themselves.
const GOAL_IDS = new Set(['n41']); // "Compete with Obsidian"
// Commentary / annotation nodes (no action in them).
const NOTE_IDS = new Set(['n21', 'n22', 'n31', 'n32', 'n40']);

function classify(id, label) {
  if (CATEGORY_IDS.has(id)) return 'category';
  if (GOAL_IDS.has(id)) return 'goal';
  if ((label ?? '').trim().endsWith('?')) return 'question';
  if (NOTE_IDS.has(id)) return 'note';
  return 'task';
}

// Shape + size per type (fill/stroke would be better; blocked on the color
// round-trip bug).
const TYPE_STYLES = {
  category: { shape: 'box', w: 280, h: 100, fontSize: 30 },
  goal:     { shape: 'circle', w: 190, h: 190, fontSize: 20 },
  question: { shape: 'diamond', w: 240, h: 130, fontSize: 14 },
  note:     { shape: 'box', w: 160, h: 50, fontSize: 10 },
  task:     {}, // plugin defaults
};

async function main() {
  const doc = yaml.load(fs.readFileSync(NEXT_YAML, 'utf8'));
  const inline = (doc.styles ?? [])[0] ?? {};
  const style = { kdStyle: 1, nodes: { ...(inline.nodes ?? {}) } };
  for (const k of ['imports', 'tagStyles', 'edges', 'view']) {
    if (inline[k] !== undefined) style[k] = inline[k];
  }

  const counts = {};
  for (const [id, node] of Object.entries(doc.semantics.nodes)) {
    const type = classify(id, node.label);
    counts[type] = (counts[type] ?? 0) + 1;
    node.tags = [...new Set([...(node.tags ?? []), type])];
    style.nodes[id] = { ...(style.nodes[id] ?? {}), ...TYPE_STYLES[type] };
  }
  console.log('classified:', JSON.stringify(counts));

  const draft = {
    version: 2, doc, style, filePath: null, dirty: false, savedAt: Date.now(),
  };

  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '') + '-next-typed';
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

  const centerOn = async (labelText, scale) => da(`
    const dl = da.drawingLayer;
    const hub = dl.getDANodes().find(n => n.label.text().includes(${JSON.stringify(labelText)}));
    if (!hub) return;
    const s = ${scale};
    dl.scaleX(s); dl.scaleY(s);
    dl.x(da.stage.width() / 2 - (hub.konvaGroup.x() + hub.NODE_WIDTH / 2) * s);
    dl.y(da.stage.height() / 2 - (hub.konvaGroup.y() + hub.NODE_HEIGHT / 2) * s);
    dl.batchDraw();
  `);

  for (const layout of ['tree-down-clear', 'tree-right-clear', 'force-clear']) {
    await waitRoutingIdle();
    await da('da.handleCommands({kind: "LOAD_NAMED_GRAPH", graphSnapshot: arg});', baseline);
    await page.waitForTimeout(200);
    await da(`da.handleCommands({kind: "APPLY_LAYOUT", layout: ${JSON.stringify(layout)}});`);
    await page.waitForTimeout(300);
    await waitRoutingIdle();
    await da('da.tweens.forEach(t => t.finish()); da.tweens = [];');

    const views = [
      ['fit', async () => da('da.handleCommands({kind:"UNSELECT_ALL"}); da.handleCommands({kind:"RECENTER_VIEW"});')],
      ['pre-mvp-70', () => centerOn('Pre-MVP', 0.7)],
      ['post-mvp-70', () => centerOn('Post-MVP', 0.7)],
      ['post-mvp-100', () => centerOn('Post-MVP', 1.0)],
    ];
    for (const [name, go] of views) {
      await go();
      await page.waitForTimeout(450);
      await da('da.tweens.forEach(t => t.finish()); da.tweens = [];');
      const file = `${layout}--${name}.png`;
      await page.screenshot({ path: path.join(runDir, file), clip: canvasBox });
      shots.push({ layout, name, file });
      console.log('shot', file);
    }
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
      <figcaption>${s.name}</figcaption></figure>`).join('')}
    </div>`).join('');
  fs.writeFileSync(path.join(runDir, 'index.html'), `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>next.org typed — ${stamp}</title>
<style>
  body{font-family:system-ui;margin:12px;background:#181a1f;color:#ddd}
  h2{border-bottom:2px solid #444;padding-bottom:4px}
  .row{display:flex;flex-wrap:wrap;gap:8px}
  figure{margin:0;flex:1 1 300px;max-width:480px}
  img{width:100%;border:1px solid #444;border-radius:4px}
  figcaption{font-size:12px;color:#999;text-align:center}
</style>
<h1>next.org, typed (dark)</h1>
<p>commit <code>${commit}</code> · category=big box · goal=circle · question=diamond · note=small box · task=default</p>
${sections}`);

  const runs = fs.readdirSync(OUT_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort().reverse();
  fs.writeFileSync(path.join(OUT_ROOT, 'index.html'), `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>kidraw layout galleries</title>
<style>body{font-family:system-ui;margin:16px} li{margin:6px 0;font-size:18px}</style>
<h1>kidraw layout galleries</h1>
<ul>${runs.map(r => `<li><a href="${r}/">${r}</a></li>`).join('')}</ul>`);

  console.log(`\npublished → https://kidraw.dev.bnjmnbrmn.com/shots/${stamp}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
