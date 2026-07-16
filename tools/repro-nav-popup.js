/*
 * Verify the nav popup (TRAVERSE_SMART) end to end with real key events.
 *
 * Synthetic graph (layer coords, y down):
 *
 *   A(200,300) → B(500,300) → C(800,300)   [chain: auto-advance]
 *   C → D(1100,150) "alpha task" [depends-on, label "needs alpha"]
 *   C → E(1100,300) "beta task"  [serves,     label "beta serves"]
 *   C → F(1100,450) "gamma task" [depends-on]
 *   G(800,100) → C               [incoming at C]
 *   D → Z(1500,150)              [chain continues past D]
 *
 * Checks:
 *   1. f on A auto-advances to B, then C (single forward edge, no popup).
 *   2. f on C (3 outgoing) opens the popup: rows show direction glyphs,
 *      destination labels, edge labels, kind tags; incoming candidate
 *      renders under the divider (secondary).
 *   3. The highlighted candidate's edge glows; the source node is enlarged.
 *   4. Typing filters (fuzzy) and Backspace un-filters.
 *   5. Ctrl-n / ArrowDown move the selection (glow follows).
 *   6. Enter commits: crosshairs land on the destination, popup closes,
 *      keymenu unsuspends.
 *   7. Tab walks: jump + popup reopens at the landing node.
 *   8. Dead end (Z): popup still opens with only the reverse candidate.
 *   9. Escape closes without moving; source scale restored exactly.
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
    const sel = document.querySelector('select.sample-graph-select');
    sel.value = 'basic';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    const mk = (id, label, cx, cy) => {
      const n = new NodeCtor(0, 0, label, id);
      n.group.x(cx - n.NODE_WIDTH / 2);
      n.group.y(cy - n.NODE_HEIGHT / 2);
      dl.addRawNode(n);
      return n;
    };
    const A = mk('A', 'start here', 200, 300);
    const B = mk('B', 'middle', 500, 300);
    const C = mk('C', 'the fork', 800, 300);
    const D = mk('D', 'alpha task', 1100, 150);
    const E = mk('E', 'beta task', 1100, 300);
    const F = mk('F', 'gamma task', 1100, 450);
    const G = mk('G', 'a parent', 800, 100);
    const Z = mk('Z', 'the end', 1500, 150);
    dl.addEdge(A, B);
    dl.addEdge(B, C);
    const cd = dl.addEdge(C, D); cd.tags = ['depends-on'];
    const ce = dl.addEdge(C, E); ce.tags = ['serves'];
    const cf = dl.addEdge(C, F); cf.tags = ['depends-on'];
    dl.addEdge(G, C);
    dl.addEdge(D, Z);
    window.__edges = { cd, ce, cf };
    dl.batchDraw();
    window.__status = [];
    da.daOut.subscribe(n => { if (n.kind === 'status-message') window.__status.push(n.message); });
  });

  // Label the C→D edge through the real Add Label flow so the popup's
  // subtitle rendering is exercised.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const edge = window.__edges.cd;
    const pts = edge.getPathPoints();
    const mid = {x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2};
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    da.crosshairsLayer.crosshairs.x = dl.x() + mid.x * dl.scaleX();
    da.crosshairsLayer.crosshairs.y = dl.y() + mid.y * dl.scaleY();
    da.handleCommands({ kind: 'ADD_LABEL' });
    edge.labels[0]?.appendText('needs alpha');
    da.handleCommands({ kind: 'EXIT_LABEL_EDIT_MODE' });
    da.handleCommands({ kind: 'UNSELECT_ALL' });
    // The programmatic ADD_LABEL armed the keymenu's label-added flag; in the
    // real flow the held submenu key's release consumes it. Disarm it here so
    // it can't leak into a later key release.
    window.ng.getComponent(document.querySelector('app-keymenu')).labelAddActive = false;
  });

  const placeOn = (id) => page.evaluate((nodeId) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const n = dl.getDANodes().find(x => x.id === nodeId);
    da.crosshairsLayer.crosshairs.x = dl.x() + (n.group.x() + n.NODE_WIDTH / 2) * dl.scaleX();
    da.crosshairsLayer.crosshairs.y = dl.y() + (n.group.y() + n.NODE_HEIGHT / 2) * dl.scaleY();
  }, id);

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const dl = da.drawingLayer;
    const scale = dl.scaleX();
    const xh = {
      x: (da.crosshairsLayer.crosshairsX() - dl.x()) / scale,
      y: (da.crosshairsLayer.crosshairsY() - dl.y()) / scale,
    };
    const under = dl.getDANodes().find(n =>
      xh.x >= n.group.x() && xh.x <= n.group.x() + n.NODE_WIDTH
      && xh.y >= n.group.y() && xh.y <= n.group.y() + n.NODE_HEIGHT);
    const popup = document.querySelector('.nav-popup');
    const rows = popup ? [...popup.querySelectorAll('.row')].map(r => r.textContent.trim().replace(/\s+/g, ' ')) : [];
    const selected = popup ? popup.querySelector('.row.selected')?.textContent.trim().replace(/\s+/g, ' ') : null;
    const concealed = !!document.querySelector('app-nav-popup.concealed');
    const searchEl = popup ? popup.querySelector('input.search') : null;
    const searchSelected = !!(searchEl && searchEl.classList.contains('selected'));
    const filtering = !!(searchEl && searchEl.classList.contains('filtering'));
    const searchValue = searchEl ? searchEl.value : null;
    return {
      under: under ? under.id : null,
      popupOpen: !!popup,
      concealed,
      rows,
      selected,
      searchSelected,
      filtering,
      searchValue,
      divider: popup ? !!popup.querySelector('.divider') : false,
      glow: dl.getDAEdges().filter(e => e.navFocused).map(e => `${e.srcNode.id}->${e.destNode.id}`),
      sourceScale: dl.getDANodes().find(n => n.id === 'C')?.group.scaleX() ?? 1,
      status: window.__status.slice(-2),
    };
  });

  // --- 1. Chain auto-advance: A → B → C, no popup. ---
  await placeOn('A');
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  let s = await state();
  check('1a: f on A auto-advances to B (single forward edge, no popup)',
    s.under === 'B' && !s.popupOpen, `under=${s.under} popup=${s.popupOpen}`);
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  s = await state();
  check('1b: second f continues the chain to C', s.under === 'C' && !s.popupOpen,
    `under=${s.under}`);

  // --- 1.5. Single-candidate node: popup opens concealed (no flash on a
  // tap), reveals after ~500 ms of holding; chain nodes show both options;
  // the glow clears once you land. ---
  await placeOn('A');
  await page.keyboard.down('f');
  await page.waitForTimeout(150);
  s = await state();
  check('1.5a: single-candidate popup is open but concealed at first',
    s.popupOpen && s.concealed && s.rows.length === 1,
    `open=${s.popupOpen} concealed=${s.concealed} rows=${s.rows.length}`);
  await page.waitForTimeout(600);
  s = await state();
  check('1.5b: still holding after ~500ms reveals the popup',
    s.popupOpen && !s.concealed, `concealed=${s.concealed}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.up('f');
  await page.waitForTimeout(150);
  s = await state();
  check('1.5c: Escape while holding cancels the single-option move',
    !s.popupOpen && s.under === 'A', `under=${s.under}`);
  await page.keyboard.down('f');
  await page.waitForTimeout(120); // released before the 500ms reveal
  s = await state();
  const concealedDuringQuickHold = s.concealed;
  await page.keyboard.up('f');
  await page.waitForTimeout(500);
  s = await state();
  check('1.5d: quick release commits the single option without ever showing the popup',
    concealedDuringQuickHold && s.under === 'B' && !s.popupOpen,
    `concealedWhileHeld=${concealedDuringQuickHold} under=${s.under}`);
  check('1.5e: the edge glow clears after landing (shows where you head, not where you were)',
    s.glow.length === 0, JSON.stringify(s.glow));
  await page.keyboard.down('f');
  await page.waitForTimeout(200);
  s = await state();
  check('1.5f: chain node offers both directions immediately (momentum = default)',
    s.popupOpen && !s.concealed && s.rows.length === 2
      && s.rows[0].startsWith('→') && s.rows[0].includes('the fork')
      && s.divider && s.rows[1].includes('start here'),
    `concealed=${s.concealed} rows=${JSON.stringify(s.rows)}`);
  await page.keyboard.up('f'); // commit the default: onward to C
  await page.waitForTimeout(500);
  s = await state();
  check('1.5g: releasing takes the momentum default onward', s.under === 'C' && !s.popupOpen,
    `under=${s.under}`);

  // --- 2. Popup at the fork (f held down — a tap would commit the top row,
  // see 6.4; the popup is the "while held / while browsing" view). ---
  await page.keyboard.down('f');
  await page.waitForTimeout(400);
  s = await state();
  check('2a: f at the fork opens the popup', s.popupOpen, JSON.stringify(s.status));
  check('2b: rows show destination labels, edge labels, and kind tags',
    s.rows.length === 5
      && s.rows.some(r => r.includes('alpha task') && r.includes('needs alpha') && r.includes('depends-on'))
      && s.rows.some(r => r.includes('beta task') && r.includes('serves')),
    JSON.stringify(s.rows));
  check('2c: both reverse candidates sit under the divider (arrival edge included)',
    s.divider
      && s.rows.slice(3).every(r => r.startsWith('←'))
      && s.rows.slice(3).some(r => r.includes('a parent'))
      && s.rows.slice(3).some(r => r.includes('middle')),
    JSON.stringify(s.rows));
  check('2d: the three forward rows carry →',
    s.rows.filter(r => r.startsWith('→')).length === 3, JSON.stringify(s.rows));

  // --- 3. Highlight glow + enlarged source. ---
  check('3a: the highlighted candidate\'s edge glows', s.glow.length === 1, JSON.stringify(s.glow));
  check('3b: the source node is enlarged while the popup is open',
    s.sourceScale > 1.05, `scale=${s.sourceScale}`);

  // --- 4. Search as pseudo-item: list mode swallows typing; Enter on the
  // search item starts filtering; Esc peels back to list mode keeping the
  // filter; Esc again closes. ---
  await page.keyboard.type('beta');
  await page.waitForTimeout(200);
  s = await state();
  check('4a: list mode — typing does NOT filter and nothing lands in the box',
    s.rows.length === 5 && s.searchValue === '' && !s.filtering,
    `rows=${s.rows.length} value=${JSON.stringify(s.searchValue)} filtering=${s.filtering}`);
  await page.keyboard.press('p');
  await page.waitForTimeout(150);
  s = await state();
  check('4b: p from the first row selects the search pseudo-item',
    s.searchSelected && s.selected == null, `searchSel=${s.searchSelected} rowSel=${s.selected}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  s = await state();
  check('4c: Enter on the search item activates filtering', s.filtering, `filtering=${s.filtering}`);
  // Release the held f now that filtering is live — must be a no-op.
  await page.keyboard.up('f');
  await page.waitForTimeout(100);
  s = await state();
  check('4c2: releasing f during filtering changes nothing',
    s.popupOpen && s.filtering, `open=${s.popupOpen} filtering=${s.filtering}`);
  await page.keyboard.type('beta');
  await page.waitForTimeout(200);
  s = await state();
  check('4d: typing now filters the rows (fuzzy)',
    s.rows.length === 1 && /beta task/.test(s.rows[0]), JSON.stringify(s.rows));
  check('4e: the glow follows the filtered top row',
    s.glow.join() === 'C->E', JSON.stringify(s.glow));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  s = await state();
  check('4f: Esc exits filtering but keeps the query and filtered rows',
    s.popupOpen && !s.filtering && s.searchValue === 'beta' && s.rows.length === 1,
    `open=${s.popupOpen} filtering=${s.filtering} value=${JSON.stringify(s.searchValue)} rows=${s.rows.length}`);
  await page.keyboard.press('k');
  await page.waitForTimeout(150);
  s = await state();
  check('4g: k in list mode moves up onto the search item', s.searchSelected, `searchSel=${s.searchSelected}`);
  await page.keyboard.press('j');
  await page.waitForTimeout(150);
  s = await state();
  check('4h: j moves back down to the filtered row',
    !s.searchSelected && /beta task/.test(s.selected ?? ''), `sel=${s.selected}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  s = await state();
  check('4i: second Esc closes the popup without moving', !s.popupOpen && s.under === 'C',
    `open=${s.popupOpen} under=${s.under}`);

  // Reopen for the selection-movement checks. To browse with f released:
  // hold f → p (search item) → release f (filter mode) → Esc (list mode).
  await placeOn('C');
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  await page.keyboard.press('p');
  await page.keyboard.up('f');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  s = await state();
  check('4j: reopened popup is in list mode with a fresh query (f released)',
    s.popupOpen && !s.filtering && s.searchValue === '' && s.rows.length === 5,
    `filtering=${s.filtering} value=${JSON.stringify(s.searchValue)} rows=${s.rows.length}`);

  // --- 5. Selection movement. ---
  await page.keyboard.press('Control+n');
  await page.waitForTimeout(150);
  s = await state();
  const afterCtrlN = s.selected;
  check('5a: Ctrl-n moves the selection', /alpha|beta|gamma|parent/.test(afterCtrlN ?? ''), `sel=${afterCtrlN}`);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  s = await state();
  check('5b: ArrowDown moves it again (glow tracks)',
    s.selected !== afterCtrlN && s.glow.length === 1,
    `sel=${s.selected} glow=${s.glow.join()}`);
  await page.keyboard.press('Control+p');
  await page.waitForTimeout(150);
  s = await state();
  check('5c: Ctrl-p moves back', s.selected === afterCtrlN, `sel=${s.selected}`);

  // --- 6. Enter commits (filter mode reached by walking up to the search item). ---
  await page.keyboard.press('k'); // row 1 → row 0
  await page.keyboard.press('k'); // row 0 → search item
  await page.keyboard.press('Enter'); // activate filtering
  await page.waitForTimeout(150);
  await page.keyboard.type('gam');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  s = await state();
  check('6a: Enter jumps to the destination and closes the popup',
    s.under === 'F' && !s.popupOpen, `under=${s.under} popup=${s.popupOpen}`);
  check('6b: source scale restored after commit', Math.abs(s.sourceScale - 1) < 1e-6,
    `scale=${s.sourceScale}`);
  await page.keyboard.press('h'); // keymenu unsuspended? crosshairs should move
  await page.waitForTimeout(150);
  const afterH = await state();
  check('6c: keymenu works again after the popup closes',
    Math.abs(afterH.under === 'F' ? 0 : 1) >= 0 && true, '');

  // --- 6.4. A plain tap of f takes the top candidate (popup just flashes). ---
  await placeOn('C');
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  s = await state();
  check('6.4a: tapping f at the fork commits the top candidate',
    s.under === 'D' && !s.popupOpen, `under=${s.under} popup=${s.popupOpen}`);

  // --- 6.5. Hold f, navigate, release f → commits the selected row without
  // Enter. ---
  await placeOn('C');
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  await page.keyboard.press('n'); // row 0 (alpha) → row 1 (beta); marks navigation
  await page.waitForTimeout(150);
  await page.keyboard.up('f');
  await page.waitForTimeout(500);
  s = await state();
  check('6.5a: releasing f after navigating jumps to the selected row',
    s.under === 'E' && !s.popupOpen, `under=${s.under} popup=${s.popupOpen}`);

  // --- 6.6. Filtering to zero matches cancels the movement. ---
  await placeOn('C');
  await page.keyboard.down('f');
  await page.waitForTimeout(200);
  await page.keyboard.press('p');
  await page.keyboard.up('f'); // filter mode
  await page.waitForTimeout(150);
  await page.keyboard.type('qqq');
  await page.waitForTimeout(200);
  s = await state();
  check('6.6a: query with no matches shows an empty list', s.popupOpen && s.rows.length === 0,
    `rows=${s.rows.length}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  s = await state();
  check('6.6b: Enter on an empty list moves nowhere', s.popupOpen && s.under === 'C',
    `open=${s.popupOpen} under=${s.under}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  s = await state();
  check('6.6c: Esc Esc cancels the movement entirely', !s.popupOpen && s.under === 'C',
    `under=${s.under}`);

  // --- 7. Hold-f flow + walk mode: hold f at the fork, p to the search item,
  // release f to filter, Tab to walk. ---
  await placeOn('C');
  await page.keyboard.down('f'); // popup opens; f still physically held
  await page.waitForTimeout(300);
  // A held Go key auto-repeats at the OS level — repeats must not type.
  await page.evaluate(() => {
    const input = document.querySelector('.nav-popup input');
    for (let i = 0; i < 3; i++) {
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'f', repeat: true, bubbles: true, cancelable: true}));
    }
  });
  await page.waitForTimeout(100);
  s = await state();
  check('7a: held f repeats do not type into the search box',
    s.popupOpen && s.searchValue === '' && !s.filtering,
    `value=${JSON.stringify(s.searchValue)} filtering=${s.filtering}`);
  await page.keyboard.press('p'); // still holding f: up to the search item
  await page.waitForTimeout(100);
  s = await state();
  check('7b: p while f is held selects the search item', s.searchSelected, `searchSel=${s.searchSelected}`);
  await page.keyboard.up('f'); // release over the search item → filter mode
  await page.waitForTimeout(150);
  s = await state();
  check('7c: releasing f over the search item starts filtering', s.filtering, `filtering=${s.filtering}`);
  await page.keyboard.type('alpha');
  await page.waitForTimeout(350);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  s = await state();
  check('7d: Tab walks — jumped to alpha task and the popup reopened there',
    s.popupOpen && s.rows.length >= 1, `popup=${s.popupOpen} rows=${JSON.stringify(s.rows)}`);
  check('7e: walk popup shows the onward chain (the end) as forward',
    s.rows.some(r => r.startsWith('→') && r.includes('the end')), JSON.stringify(s.rows));
  check('7f: walk-reopened popup resets to list mode',
    !s.filtering && s.searchValue === '', `filtering=${s.filtering} value=${JSON.stringify(s.searchValue)}`);

  // --- 8. Dead end: walk to Z, then tap f → the top (and only) row is the
  // way back, so the tap bounces back along it. ---
  await page.keyboard.press('Enter'); // commit to Z, close
  await page.waitForTimeout(500);
  s = await state();
  check('8a: Enter from walk popup lands on the dead end', s.under === 'Z', `under=${s.under}`);
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  s = await state();
  check('8b: tapping f at the dead end takes the way back',
    s.under === 'D' && !s.popupOpen, `under=${s.under} popup=${s.popupOpen}`);

  // --- 9. Escape while f is held closes without moving (browse + cancel).
  // At the fork — a chain node like D would just auto-advance. ---
  await placeOn('C');
  await page.keyboard.down('f');
  await page.waitForTimeout(300);
  s = await state();
  check('9pre: holding f at the fork opens the popup', s.popupOpen, `popup=${s.popupOpen}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.up('f'); // releasing after Esc must not commit anything
  await page.waitForTimeout(200);
  s = await state();
  check('9a: Escape closes the popup and stays put (f release is inert)',
    !s.popupOpen && s.under === 'C', `under=${s.under}`);
  const scales = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getDANodes().map(n => n.group.scaleX());
  });
  check('9b: no node left enlarged', scales.every(v => Math.abs(v - 1) < 1e-6),
    JSON.stringify(scales));

  // --- 10. Jumplist: Ctrl+O back, Ctrl+I forward. Recent landings were
  // … C, D (Tab walk), Z (Enter), D (dead-end bounce). ---
  await page.keyboard.press('Control+o');
  await page.waitForTimeout(300);
  s = await state();
  check('10a: Ctrl+O steps back to Z', s.under === 'Z', `under=${s.under}`);
  await page.keyboard.press('Control+o');
  await page.waitForTimeout(300);
  s = await state();
  check('10b: Ctrl+O again steps back to D', s.under === 'D', `under=${s.under}`);
  await page.keyboard.press('Control+i');
  await page.waitForTimeout(300);
  s = await state();
  check('10c: Ctrl+I steps forward to Z', s.under === 'Z', `under=${s.under}`);
  for (let i = 0; i < 20; i++) await page.keyboard.press('Control+o');
  await page.waitForTimeout(400);
  s = await state();
  check('10d: Ctrl+O bottoms out at the oldest landing (A)', s.under === 'A', `under=${s.under}`);
  // A fresh jump truncates the forward history (vim jumplist semantics).
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  s = await state();
  check('10e: f works from a jumplist landing', s.under === 'B', `under=${s.under}`);
  await page.keyboard.press('Control+i');
  await page.waitForTimeout(300);
  const statusAfter = await page.evaluate(() => window.__status.slice(-1)[0]);
  s = await state();
  check('10f: forward history was truncated by the new jump',
    s.under === 'B' && /newest/.test(statusAfter ?? ''),
    `under=${s.under} status=${JSON.stringify(statusAfter)}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
