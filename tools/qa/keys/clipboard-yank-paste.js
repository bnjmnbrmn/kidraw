/*
 * Repro for da-161: copy/paste, held on the vim yank key (y), with the task
 * Status menu moved off y to t.
 *
 *   1. y is "Copy/Paste..." and t is "Status..." at the root.
 *   2. Hold y, tap y over a selected node → the node is copied.
 *   3. Move the crosshairs, hold y + tap p → a fresh copy lands there, with
 *      new ids, and the pasted node is the selection.
 *   4. Copying two connected nodes carries the edge between them.
 *   5. Cut removes the original; paste puts it back.
 *   6. Paste is undoable.
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

  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {root: JSON.parse(JSON.stringify(km.keyAssignments.root)),
            clipboard: JSON.parse(JSON.stringify(km.keyAssignments.clipboard))};
  });
  console.log('root:', JSON.stringify(keys.root), 'clipboard:', JSON.stringify(keys.clipboard));
  check('copy/paste is on y', keys.root.clipboardSubmenu === 'y', keys.root.clipboardSubmenu);
  check('status moved off y', keys.root.statusSubmenu !== 'y', keys.root.statusSubmenu);

  const graph = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    return {
      nodes: dl.getDANodes().map(n => ({id: n.id, text: n.label.text(),
        x: Math.round(n.group.x()), y: Math.round(n.group.y()), sel: n.isSelected})),
      edges: dl.getDAEdges().map(e => ({id: e.id, src: e.srcNode.id, dest: e.destNode.id})),
    };
  });
  const selectNodes = ids => page.evaluate(ids => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    dl.unselectAll();
    dl.getDANodes().filter(n => ids.includes(n.id)).forEach(n => { n.isSelected = true; });
    dl.batchDraw();
  }, ids);
  const placeCrosshairs = (lx, ly) => page.evaluate(([lx, ly]) => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    c.crosshairsLayer.crosshairs.x = lx * dl.scaleX() + dl.x();
    c.crosshairsLayer.crosshairs.y = ly * dl.scaleY() + dl.y();
  }, [lx, ly]);

  // Hold the clipboard key, tap the child, release.
  const chord = async child => {
    await page.keyboard.down(keys.root.clipboardSubmenu);
    await page.waitForTimeout(80);
    await page.keyboard.press(child);
    await page.waitForTimeout(80);
    await page.keyboard.up(keys.root.clipboardSubmenu);
    await page.waitForTimeout(200);
  };

  const before = await graph();
  const first = before.nodes[0];
  console.log(`copying node ${first.id} ${JSON.stringify(first.text)}`);

  await selectNodes([first.id]);
  await chord(keys.clipboard.copy);
  await placeCrosshairs(first.x + 400, first.y + 300);
  await chord(keys.clipboard.paste);

  let after = await graph();
  check('paste added exactly one node',
    after.nodes.length === before.nodes.length + 1,
    `${before.nodes.length} -> ${after.nodes.length}`);
  const pasted = after.nodes.filter(n => !before.nodes.some(b => b.id === n.id));
  check('pasted node has a fresh id and the same text',
    pasted.length === 1 && pasted[0].text === first.text,
    JSON.stringify(pasted));
  check('pasted node landed at the crosshairs',
    pasted.length === 1 && Math.abs(pasted[0].x - (first.x + 400)) < 3
      && Math.abs(pasted[0].y - (first.y + 300)) < 3,
    JSON.stringify(pasted[0]));
  check('pasted node is the selection',
    pasted.length === 1 && pasted[0].sel &&
      after.nodes.filter(n => n.sel).length === 1,
    JSON.stringify(after.nodes.filter(n => n.sel).map(n => n.id)));

  // Undo should take the paste back out.
  await page.keyboard.press('u');
  await page.waitForTimeout(300);
  after = await graph();
  check('paste is undoable', after.nodes.length === before.nodes.length,
    `${after.nodes.length} nodes`);

  // Copying a connected pair carries the edge.
  const edge = before.edges[0];
  if (edge) {
    await selectNodes([edge.src, edge.dest]);
    await chord(keys.clipboard.copy);
    await placeCrosshairs(first.x, first.y + 700);
    await chord(keys.clipboard.paste);
    const withPair = await graph();
    check('copying a connected pair carries the edge',
      withPair.nodes.length === before.nodes.length + 2 &&
      withPair.edges.length === before.edges.length + 1,
      `${withPair.nodes.length} nodes, ${withPair.edges.length} edges`);
    await page.keyboard.press('u');
    await page.waitForTimeout(300);
  }

  // Cut removes the original; paste restores it.
  const base = await graph();
  const victim = base.nodes[base.nodes.length - 1];
  await selectNodes([victim.id]);
  await chord(keys.clipboard.cut);
  const afterCut = await graph();
  check('cut removes the node', afterCut.nodes.length === base.nodes.length - 1,
    `${base.nodes.length} -> ${afterCut.nodes.length}`);
  await placeCrosshairs(victim.x, victim.y);
  await chord(keys.clipboard.paste);
  const afterRepaste = await graph();
  check('paste after cut restores it', afterRepaste.nodes.length === base.nodes.length,
    `${afterRepaste.nodes.length} nodes`);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
