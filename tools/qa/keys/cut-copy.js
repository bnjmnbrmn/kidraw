/*
 * Repro for da-272: "Make x be 'Cut' (instead of just Delete) and make y
 * 'Copy' directly (without needing a second key press)."
 *
 * y already copied on a single tap, but only ever acted on the SELECTION —
 * so hovering a node and pressing y said "Nothing selected to copy", which
 * is the second key press (selecting first) the note is about. Copy and cut
 * now fall back to the node under the crosshairs, the way vim yanks the
 * line you are on.
 *
 * The risk in making x cut is losing what Delete could do: the clipboard has
 * no representation for waypoints, edges or labels, so cut must still remove
 * them. Most of this file guards that.
 */
const {chromium} = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);
  const reload = async () => {
    await page.evaluate(() => {
      const sel = document.querySelector('select.sample-graph-select');
      if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
    });
    await page.waitForTimeout(500);
  };
  await reload();

  const counts = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    return {nodes: dl.getDANodes().length, edges: dl.getDAEdges().length,
            waypoints: dl.getDAWaypoints().length,
            labels: dl.getDAEdges().reduce((a, e) => a + e.labels.length, 0)};
  });
  const status = () => page.evaluate(() => {
    const el = document.querySelector('app-header .status-message');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '(none)';
  });
  const rootLabel = k => page.evaluate(k => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const v = km.buildRootSubmenuConfig()[k];
    return v ? (v.actionLabel ?? v.submenuLabel ?? '?') : '(unbound)';
  }, k);
  const overNode = i => page.evaluate(i => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer, n = dl.getDANodes()[i];
    c.crosshairsLayer.crosshairs.x = (n.group.x() + n.NODE_WIDTH / 2) * dl.scaleX() + dl.x();
    c.crosshairsLayer.crosshairs.y = (n.group.y() + n.NODE_HEIGHT / 2) * dl.scaleY() + dl.y();
  }, i);
  const parkCrosshairs = () => page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    c.crosshairsLayer.crosshairs.x = 40;
    c.crosshairsLayer.crosshairs.y = 700;
  });
  const clearSelection = () => page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    dl.unselectAll(); dl.batchDraw();
  });
  const selectNode = i => page.evaluate(i => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    dl.unselectAll(); dl.getDANodes()[i].isSelected = true; dl.batchDraw();
  }, i);
  const selectEdge = i => page.evaluate(i => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    dl.unselectAll(); dl.getDAEdges()[i].isSelected = true; dl.batchDraw();
  }, i);

  check('x is bound to Cut', (await rootLabel('x')) === 'Cut', await rootLabel('x'));

  // --- y copies directly ------------------------------------------------
  await selectNode(0);
  await page.keyboard.press('y');
  await page.waitForTimeout(250);
  check('one tap of y copies the selection', /Copied 1 node/.test(await status()), await status());

  await clearSelection();
  await overNode(1);
  await page.keyboard.press('y');
  await page.waitForTimeout(250);
  check('one tap of y copies the node under the crosshairs, with nothing selected',
    /Copied 1 node/.test(await status()), await status());

  // What it copied is what gets pasted.
  const beforePaste = await counts();
  await parkCrosshairs();
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  check('the hovered copy pastes', (await counts()).nodes === beforePaste.nodes + 1,
    `${beforePaste.nodes} -> ${(await counts()).nodes}`);
  await page.keyboard.press('u');
  await page.waitForTimeout(250);

  // --- x cuts -----------------------------------------------------------
  await reload();
  await selectNode(0);
  let before = await counts();
  await page.keyboard.press('x');
  await page.waitForTimeout(300);
  check('x removes the selected node', (await counts()).nodes === before.nodes - 1,
    `${before.nodes} -> ${(await counts()).nodes}`);
  check('x reports a cut, not a delete', /Cut 1 node/.test(await status()), await status());

  await parkCrosshairs();
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  check('what x removed can be pasted back', (await counts()).nodes === before.nodes,
    `${(await counts()).nodes} nodes`);

  // Cut the node under the crosshairs, with nothing selected.
  await reload();
  await clearSelection();
  await overNode(2);
  before = await counts();
  await page.keyboard.press('x');
  await page.waitForTimeout(300);
  check('x cuts the node under the crosshairs with nothing selected',
    (await counts()).nodes === before.nodes - 1 && /Cut 1 node/.test(await status()),
    `${before.nodes} -> ${(await counts()).nodes}, ${await status()}`);

  // --- x is still a full Delete ----------------------------------------
  // The clipboard cannot hold an edge, but x must still remove one.
  await reload();
  await clearSelection();
  await parkCrosshairs();
  await selectEdge(0);
  before = await counts();
  await page.keyboard.press('x');
  await page.waitForTimeout(300);
  check('x still deletes a selected edge', (await counts()).edges === before.edges - 1,
    `${before.edges} -> ${(await counts()).edges} edges`);
  check('deleting an edge does not claim to have cut nodes',
    !/Cut \d+ node/.test(await status()), await status());

  // A waypoint, likewise.
  await reload();
  await clearSelection();
  await parkCrosshairs();
  const madeWaypoint = await page.evaluate(() => {
    const dl = window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer;
    const edge = dl.getDAEdges()[0];
    edge.restoreControlPoints([{x: edge.srcNode.group.x() + 60,
                                y: edge.srcNode.group.y() + 60, waypointId: 'wp-test'}]);
    edge.refreshGeometry();
    const wp = dl.getDAWaypoints()[0];
    if (wp) { wp.isSelected = true; dl.batchDraw(); return true; }
    return false;
  });
  if (madeWaypoint) {
    before = await counts();
    await page.keyboard.press('x');
    await page.waitForTimeout(300);
    check('x still deletes a selected waypoint',
      (await counts()).waypoints === before.waypoints - 1,
      `${before.waypoints} -> ${(await counts()).waypoints} waypoints`);
  } else {
    console.log('  (skipped waypoint case — could not create one)');
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
