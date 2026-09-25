/*
 * Repro for da-161, rewritten 2026-09-25 for the keys since da-473: a tap of
 * the yank key (y) copies, the delete key (x) cuts, and root p pastes. The
 * held copy/paste submenu is gone. What cut-copy.js does not cover:
 *
 *   1. y is Copy at the root and the task Status menu is not on y.
 *   2. Tap y over a selected node → the node is copied.
 *   3. Move the crosshairs, tap p → a fresh copy lands there, with new ids,
 *      and the pasted node is the selection.
 *   4. Copying two connected nodes carries the edge between them.
 *   5. Cut removes the original; paste puts it back.
 *   6. Paste is undoable.
 */
const {launch, openApp, settled, movedAndSettled, crosshairsOf, afterFrame,
  overlay: waitForOverlay, waitForDA, checker} = require('../harness');

const check = checker();

async function main() {
  const browser = await launch();
  const page = await openApp(browser, {width: 1600, height: 1000});
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(500);

  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {root: JSON.parse(JSON.stringify(km.keyAssignments.root)),
            clipboard: JSON.parse(JSON.stringify(km.keyAssignments.clipboard)),
            cut: km.keyAssignments.shared.delete};
  });
  console.log('root:', JSON.stringify(keys.root), 'clipboard:', JSON.stringify(keys.clipboard));
  check('copy is on y', keys.root.clipboardSubmenu === 'y', keys.root.clipboardSubmenu);
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

  /** Tap a root key and let the app react. */
  const tap = async key => {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  };
  const copy = () => tap(keys.root.clipboardSubmenu);
  const paste = () => tap(keys.clipboard.paste);
  const cut = () => tap(keys.cut);

  const before = await graph();
  const first = before.nodes[0];
  console.log(`copying node ${first.id} ${JSON.stringify(first.text)}`);

  await selectNodes([first.id]);
  await copy();
  await placeCrosshairs(first.x + 400, first.y + 300);
  await paste();

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
    await copy();
    await placeCrosshairs(first.x, first.y + 700);
    await paste();
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
  await cut();
  const afterCut = await graph();
  check('cut removes the node', afterCut.nodes.length === base.nodes.length - 1,
    `${base.nodes.length} -> ${afterCut.nodes.length}`);
  await placeCrosshairs(victim.x, victim.y);
  await paste();
  const afterRepaste = await graph();
  check('paste after cut restores it', afterRepaste.nodes.length === base.nodes.length,
    `${afterRepaste.nodes.length} nodes`);

  console.log(check.failures ? `\n${check.failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(check.failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
