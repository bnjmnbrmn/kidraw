/*
 * Verify task statuses on todo graphs end to end (vim profile, real keys):
 *
 *   1. Root `y` (held, right hand) is the Status... submenu with left-hand
 *      choices: r Draft, t To Do, w In Progress, b Blocked, d Done,
 *      c No Status.
 *   2. On a plain (default-identity) graph, setting a status warns instead
 *      of tagging.
 *   3. On a todo graph, y→b marks the selected node BLOCKED (tag
 *      `status/blocked` + badge); y→d replaces it with DONE (exclusive
 *      tags), dims the node, and strikes through the label; y→r marks a
 *      hovered (unselected) node DRAFT.
 *   4. Undo restores the previous status, badge included.
 *   5. y→c clears the status entirely.
 *   6. Statuses survive a page reload via the localStorage draft.
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

  // Start from an empty graph and capture status messages.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.clearAll();
    window.__statuses = [];
    da.daOut.subscribe(n => { if (n.kind === 'status-message') window.__statuses.push(n.message); });
  });

  const info = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      mode: km.keyMenu.currentMode.name,
      diagramType: da.drawingLayer.diagramType,
      statuses: window.__statuses ?? [],
      nodes: da.drawingLayer.getDANodes().map(n => ({
        text: n.label.text(),
        tags: [...n.tags],
        badge: n.statusBadgeVisible,
        badgeLabel: n.statusBadgeLabel,
        opacity: n.konvaGroup.opacity(),
        deco: n.label.textDecoration(),
        selected: n.isSelected,
      })),
    };
  });

  // --- 1. Menu structure: status has no menu route any more (da-438). Task
  // status is a todo-graph concept, so the menu comes back with the plugin
  // that owns that identity; the COMMAND still works, which is what the rest
  // of this file exercises. ---
  const menu = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const root = km.buildRootSubmenuConfig();
    const labelsOf = (cfg) => {
      const out = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (k !== '_repeatConfig') out[k] = v.actionLabel ?? v.submenuLabel ?? null;
      }
      return out;
    };
    const labels = labelsOf(root);
    return { labels, statusEntries: Object.values(labels).filter(l => l === 'Status') };
  });
  check('no Status submenu at root', menu.statusEntries.length === 0, JSON.stringify(menu.statusEntries));
  check('the key it used to sit on is free', menu.labels['t'] === undefined, JSON.stringify(menu.labels['t']));

  // --- 2. Plain graph: setting a status warns ---
  await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    km.keyMenuOut.emit({ kind: 'SET_TASK_STATUS', status: 'done' });
  });
  await page.waitForTimeout(120);
  let s = await info();
  check('default identity warns about todo graphs', s.statuses.some(m => m.includes('Todo Graph')),
    JSON.stringify(s.statuses));

  // --- 3. Todo graph: real-key status marking ---
  await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    km.keyMenuOut.emit({ kind: 'SET_DIAGRAM_TYPE', typeId: 'todo-graph' });
  });
  await page.waitForTimeout(120);

  // Insert a node on empty canvas (hold a → d), type its label, escape out.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    da.crosshairsLayer.crosshairs.x = 400;
    da.crosshairsLayer.crosshairs.y = 500;
  });
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('d');
  await page.waitForTimeout(120);
  await page.keyboard.up('a');
  await page.waitForTimeout(150);
  await page.keyboard.type('fix parser', { delay: 30 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  s = await info();
  check('todo graph node created', s.diagramType === 'todo-graph' && s.nodes.length === 1
    && s.nodes[0].text === 'fix parser', JSON.stringify(s.nodes));

  // The status flow acts on the selection; re-select in case Escape cleared
  // it. The command is emitted directly now that no menu route reaches it.
  const STATUS_FOR_KEY = {r: 'draft', t: 'todo', w: 'in-progress',
                          b: 'blocked', d: 'done', c: 'none'};
  const holdStatusChord = async (key, { select = true } = {}) => {
    await page.evaluate(({sel, status}) => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      da.drawingLayer.getDANodes()[0].isSelected = sel;
      da.drawingLayer.batchDraw();
      window.ng.getComponent(document.querySelector('app-keymenu'))
        .keyMenuOut.emit({kind: 'SET_TASK_STATUS', status});
    }, {sel: select, status: STATUS_FOR_KEY[key]});
    await page.waitForTimeout(200);
  };

  await holdStatusChord('b');
  s = await info();
  let n = s.nodes[0];
  check('y→b marks BLOCKED', n.tags.join() === 'status/blocked' && n.badge && n.badgeLabel === 'BLOCKED',
    JSON.stringify(n));
  check('blocked does not dim', n.opacity === 1 && n.deco === '', JSON.stringify({o: n.opacity, deco: n.deco}));

  await holdStatusChord('d');
  s = await info();
  n = s.nodes[0];
  check('y→d replaces with DONE (exclusive)', n.tags.join() === 'status/done' && n.badgeLabel === 'DONE',
    JSON.stringify(n.tags));
  check('done dims and strikes through', n.opacity === 0.55 && n.deco === 'line-through',
    JSON.stringify({o: n.opacity, deco: n.deco}));
  check('status message announces DONE', s.statuses.some(m => m.includes('Status: DONE')),
    JSON.stringify(s.statuses.slice(-3)));

  // --- 4. Undo restores the previous status ---
  await page.keyboard.press('u');
  await page.waitForTimeout(200);
  s = await info();
  n = s.nodes[0];
  check('undo restores BLOCKED badge', n.tags.join() === 'status/blocked' && n.badgeLabel === 'BLOCKED'
    && n.opacity === 1, JSON.stringify(n));

  // --- 5. Clear status, then hover-only (unselected) marking ---
  await holdStatusChord('c');
  s = await info();
  n = s.nodes[0];
  check('y→c clears the status', n.tags.length === 0 && !n.badge && n.opacity === 1, JSON.stringify(n));

  // The node sits centered on the crosshairs, so with nothing selected the
  // chord targets the hovered node.
  await holdStatusChord('r', { select: false });
  s = await info();
  n = s.nodes[0];
  check('y→r marks a hovered unselected node DRAFT', n.tags.join() === 'status/draft'
    && n.badgeLabel === 'DRAFT' && !n.selected, JSON.stringify(n));

  // --- 6. Reload persistence via the localStorage draft ---
  await holdStatusChord('w');
  s = await info();
  check('y→w marks IN PROGRESS', s.nodes[0].tags.join() === 'status/in-progress'
    && s.nodes[0].badgeLabel === 'IN PROGRESS', JSON.stringify(s.nodes[0]));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(500);
  s = await info();
  n = s.nodes[0] ?? {};
  check('status survives reload (draft round trip)', s.diagramType === 'todo-graph'
    && n.tags?.join() === 'status/in-progress' && n.badge && n.badgeLabel === 'IN PROGRESS',
    JSON.stringify({type: s.diagramType, node: n}));

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
