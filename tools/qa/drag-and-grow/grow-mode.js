/*
 * Held-Add grow mode (notes/design-add-insert-model.md, ledger rows 6-10, 13),
 * vim profile, real keys. Each case starts from the same three nodes (anchor
 * A, B far to its right, C below-left) and a clean normal mode, so one
 * failure cannot leave state behind for the next.
 *
 *   1. Hold a over a node: targeting surface. Release with no keypress is
 *      the tap: a self-loop, normal mode (row 6, revised 2026-08-09).
 *   2. a + l…: the aim walks the lattice right and on to B; the crosshairs
 *      ride the aim (da-551). Release on B wires A→B, no new node.
 *   3. Release on a lattice spot: a new node there, linked, labelEdit (row 7).
 *   4. o cycles the direction (row 8): new edges start directed, so o o is
 *      undirected.
 *   5. Hop out and back onto the anchor: release commits nothing.
 *   6. / opens the target search (row 9); releasing a keeps it open;
 *      Enter commits; Esc Esc cancels the whole add.
 *   7. a + f: the type popup (row 10); j browses, releasing f picks, l
 *      places, releasing a commits a linked node. Sticky variant: a released
 *      first, Enter commits. Escape in placement cancels.
 *   8. Empty canvas a + f (row 13): a free node of the picked type.
 *   9. Existing nodes stay reachable through the lattice (Ben, 2026-09-06):
 *      straight up reaches the near node; up-and-right reaches the diagonal one.
 *
 * Rewritten 2026-09-24. The previous version followed the design before
 * 2026-08-09 (a pristine release added a node to the right, the crosshairs
 * stayed put, new edges started undirected), and each case built on the
 * last, so 17 of its 25 checks failed.
 */
const {launch, openApp, settled, checker} = require('../harness');

const check = checker();
const DA = "window.ng.getComponent(document.querySelector('app-drawing-area'))";
const KM = "window.ng.getComponent(document.querySelector('app-keymenu'))";

async function main() {
  const browser = await launch();
  const page = await openApp(browser, {width: 1600, height: 1000});
  const wait = ms => page.waitForTimeout(ms);

  const state = () => page.evaluate(`(() => { const da = ${DA}; const km = ${KM};
    return {
      mode: km.keyMenu.currentMode.name,
      statuses: window.__statuses ?? [],
      growActive: da.growActive,
      target: da.growTarget?.label.text() ?? null,
      insertion: da.growInsertionTarget?.id ?? null,
      popup: {open: da.navPopupOpen, purpose: da.navPopupPurpose},
      placing: da.growPlacing, shape: da.growShape,
      xh: {x: da.crosshairsLayer.crosshairsX(), y: da.crosshairsLayer.crosshairsY()},
      nodes: da.drawingLayer.getDANodes().map(n => ({text: n.label.text(), shape: n.nodeShape,
        x: n.konvaGroup.x(), edges: n.connectedEdges.length})),
      edges: da.drawingLayer.getDAEdges().map(e => ({
        from: e.srcNode.label.text(), to: e.destNode.label.text(), dir: e.directedness})),
    }; })()`);

  /** Three unconnected nodes, a clean normal mode, the crosshairs on A. */
  const reset = async (nodes = [['A', 400, 300], ['B', 900, 300], ['C', 300, 700]], park = 'A') => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(`(() => { const da = ${DA}; da.finishTweens();
      const dl = da.drawingLayer;
      dl.restoreGraph({nodes: ${JSON.stringify(nodes)}.map(([text, x, y]) =>
        ({id: 'n-' + text, x, y, text, width: 120, height: 60, fontSize: 14, isSelected: false})), edges: []});
      dl.scale({x: 1, y: 1}); dl.position({x: 0, y: 0}); dl.unselectAll(); dl.batchDraw();
      window.__statuses = []; window.__statusSub?.unsubscribe();
      window.__statusSub = da.daOut.subscribe(n => { if (n.kind === 'status-message') window.__statuses.push(n.message); });
      const node = dl.getDANodes().find(n => n.label.text() === ${JSON.stringify(park)});
      if (node) {
        da.crosshairsLayer.crosshairs.x = node.group.x() + node.NODE_WIDTH / 2;
        da.crosshairsLayer.crosshairs.y = node.group.y() + node.NODE_HEIGHT / 2;
      }
      da.crosshairsLayer.showCrosshairs(); })()`);
    await settled(page);
  };
  const holdA = async () => { await page.keyboard.down('a'); await wait(250); };
  const tap = async key => { await page.keyboard.press(key); await wait(120); };
  const release = async key => { await page.keyboard.up(key); await wait(250); };
  /** Press `key` until the aim is on the node labelled `label`, at most `max` times. */
  const hopTo = async (key, label, max = 8) => {
    for (let i = 0; i < max; i++) {
      await tap(key);
      if ((await state()).target === label) return true;
    }
    return false;
  };

  // --- 1. hold, then release untouched: the tap's self-loop ---
  await reset();
  await holdA();
  let s = await state();
  check('holding a over a node shows targeting controls',
    s.growActive && s.mode === 'surfaceGrowTargeting', JSON.stringify({grow: s.growActive, mode: s.mode}));
  await release('a');
  s = await state();
  check('a release without a keypress adds a self-loop and no node',
    s.nodes.length === 3 && s.edges.length === 1 && s.edges[0].from === 'A' && s.edges[0].to === 'A',
    JSON.stringify(s.edges));
  check('and stays in normal mode', s.mode === 'normal' && !s.growActive, s.mode);

  // --- 2. walk right to B; the crosshairs ride the aim ---
  await reset();
  const start = (await state()).xh;
  await holdA();
  await tap('l');
  s = await state();
  check('the first l aims at a lattice spot to the right', s.insertion !== null && s.target === null,
    JSON.stringify({target: s.target, insertion: s.insertion}));
  check('the crosshairs ride the aim', s.xh.x > start.x && s.xh.y === start.y,
    JSON.stringify({start, now: s.xh}));
  const reachedB = await hopTo('l', 'B');
  check('further l presses reach B', reachedB, (await state()).target);
  await release('a');
  s = await state();
  check('release on B wires A→B, directed, no new node',
    s.nodes.length === 3 && s.edges.length === 1 && s.edges[0].from === 'A' && s.edges[0].to === 'B'
      && s.edges[0].dir === 'directed', JSON.stringify(s.edges));
  check('and stays in normal mode', s.mode === 'normal' && !s.growActive, s.mode);

  // --- 3. release on a lattice spot: a new linked node, labelEdit ---
  await reset();
  await holdA();
  await tap('l');
  await release('a');
  s = await state();
  check('release on a spot adds a linked node there', s.nodes.length === 4
    && s.edges.some(e => e.from === 'A' && e.to === ''), JSON.stringify(s.edges));
  check('and opens its label for editing', s.mode === 'labelEdit', s.mode);

  // --- 4. o cycles the direction before commit ---
  await reset();
  await holdA();
  await hopTo('l', 'B');
  await tap('o');
  await tap('o');
  await release('a');
  s = await state();
  check('o o before release commits an undirected edge',
    s.edges.length === 1 && s.edges[0].dir === 'undirected', JSON.stringify(s.edges));

  // --- 5. come home to cancel ---
  await reset();
  await holdA();
  await tap('l');
  await tap('h');
  s = await state();
  check('hopping back lands on the anchor', s.target === 'A', JSON.stringify({target: s.target, insertion: s.insertion}));
  await release('a');
  s = await state();
  check('release on the anchor commits nothing', s.edges.length === 0 && s.nodes.length === 3
    && s.mode === 'normal', JSON.stringify({edges: s.edges.length, mode: s.mode}));

  // --- 6. / target search: sticky, Enter commits, Esc Esc cancels ---
  await reset();
  await holdA();
  await tap('/');
  s = await state();
  check('/ opens the target search popup and updates the keymenu',
    s.popup.open && s.popup.purpose === 'grow-target' && s.mode === 'surfaceGrowTargetPopup',
    JSON.stringify({...s.popup, mode: s.mode}));
  await release('a');
  s = await state();
  check('releasing a with the popup open commits nothing', s.growActive && s.popup.open && s.edges.length === 0,
    JSON.stringify({grow: s.growActive, popup: s.popup}));
  await page.keyboard.type('c', {delay: 40});
  await wait(150);
  await page.keyboard.press('Enter');
  await wait(250);
  s = await state();
  check('Enter commits the edge to the searched node',
    s.edges.length === 1 && s.edges[0].from === 'A' && s.edges[0].to === 'C', JSON.stringify(s.edges));
  check('grow mode fully exited after the search commit', !s.growActive && s.mode === 'normal',
    JSON.stringify({grow: s.growActive, mode: s.mode}));

  await reset();
  await holdA();
  await tap('/');
  await release('a');
  await tap('Escape');
  await tap('Escape');
  await wait(150);
  s = await state();
  check('Esc Esc cancels the add from the search popup', s.edges.length === 0 && !s.growActive
    && s.mode === 'normal' && s.statuses.some(m => m.includes('Add canceled')),
    JSON.stringify({edges: s.edges.length, grow: s.growActive, mode: s.mode}));

  // --- 7. a + f: type popup, placement, commit ---
  await reset();
  await holdA();
  await page.keyboard.down('f');
  await wait(300);
  s = await state();
  check('a+f opens the type popup and updates the keymenu',
    s.popup.open && s.popup.purpose === 'grow-type' && s.mode === 'surfaceGrowTypePopup',
    JSON.stringify({...s.popup, mode: s.mode}));
  await tap('j'); // Circle
  await release('f');
  s = await state();
  check('j then releasing f picks Circle and enters placement',
    s.placing && s.shape === 'circle' && !s.popup.open && s.mode === 'surfaceGrowPlacement',
    JSON.stringify({placing: s.placing, shape: s.shape, popup: s.popup, mode: s.mode}));
  await tap('l');
  await tap('l');
  await release('a');
  s = await state();
  const circle = s.nodes.find(n => n.shape === 'circle');
  check('release commits a linked circle to the right of A',
    s.nodes.length === 4 && circle && circle.x > 400 && circle.edges === 1, JSON.stringify(circle));
  check('placement commit enters labelEdit', s.mode === 'labelEdit', s.mode);

  await reset();
  await holdA();
  await page.keyboard.down('f');
  await wait(300);
  await release('a'); // sticky: the popup owns the flow now
  await release('f'); // picks Box, the top row
  await tap('h');
  await page.keyboard.press('Enter');
  await wait(250);
  s = await state();
  check('sticky placement commits on Enter', s.nodes.length === 4 && s.mode === 'labelEdit',
    JSON.stringify({n: s.nodes.length, mode: s.mode}));

  await reset();
  await holdA();
  await page.keyboard.down('f');
  await wait(300);
  await release('f');
  await tap('Escape');
  await release('a');
  s = await state();
  check('Escape in placement cancels without creating', s.nodes.length === 3 && !s.growActive && s.mode === 'normal',
    JSON.stringify({n: s.nodes.length, grow: s.growActive, mode: s.mode}));

  // --- 8. empty canvas a + f: a free node of the picked type ---
  await reset(undefined, null);
  await page.evaluate(`(() => { const da = ${DA};
    da.crosshairsLayer.crosshairs.x = 1300; da.crosshairsLayer.crosshairs.y = 800; })()`);
  await holdA();
  await page.keyboard.down('f');
  await wait(300);
  s = await state();
  check('empty-canvas a+f opens the type popup',
    s.popup.open && s.popup.purpose === 'grow-type' && s.mode === 'surfaceGrowTypePopup', JSON.stringify(s.popup));
  await tap('j');
  await tap('j'); // Diamond
  await release('f');
  await release('a');
  s = await state();
  const diamond = s.nodes.find(n => n.shape === 'diamond');
  check('it commits a free diamond', s.nodes.length === 4 && s.edges.length === 0 && diamond && diamond.edges === 0
    && s.mode === 'labelEdit', JSON.stringify({diamond, mode: s.mode}));

  // --- 9. existing nodes stay reachable through the lattice ---
  // X, U1 straight above it, U2 above and to the right.
  await reset([['X', 540, 670], ['U1', 540, 470], ['U2', 690, 420]], 'X');
  await holdA();
  check('up reaches the near node straight above', await hopTo('k', 'U1', 4), (await state()).target);
  await tap('Escape');
  await release('a');

  await reset([['X', 540, 670], ['U1', 540, 470], ['U2', 690, 420]], 'X');
  await holdA();
  await tap('l');
  check('up and right reaches the node on the diagonal', await hopTo('k', 'U2', 5), (await state()).target);
  await tap('Escape');
  await release('a');

  await browser.close();
  console.log(check.failures === 0 ? 'ALL CHECKS PASSED' : `${check.failures} CHECK(S) FAILED`);
  process.exit(check.failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
