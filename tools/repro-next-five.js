/*
 * Browser smoke test for the five 2026-08-01 Next items: blinking/mode-aware
 * text cursor, vim `e`, outgoing connected-add default, quadrant Move by
 * Link behavior, and the Move by Link label.
 */
const {chromium} = require('@playwright/test');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
  });
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle'});
  await page.waitForSelector('#mainDrawingArea canvas');

  await page.evaluate(() => {
    const select = document.querySelector('select.sample-graph-select');
    select.value = 'basic';
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(250);

  const makeGraph = async (kind) => page.evaluate((graphKind) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    const mk = (id, label, cx, cy) => {
      const n = new NodeCtor(cx - 60, cy - 60, label, id);
      dl.addRawNode(n);
      return n;
    };
    if (graphKind === 'add') {
      mk('anchor', 'anchor', 400, 350);
    } else {
      const source = mk('source', 'source', 800, 300);
      const westCenter = mk('west-center', 'west center', 500, 300);
      const westBelow = mk('west-below', 'west below', 500, 440);
      const southLeft = mk('south-left', 'south left', 680, 650);
      const southRight = mk('south-right', 'south right', 920, 650);
      const edges = [westCenter, westBelow, southLeft, southRight]
        .map(node => dl.addEdge(source, node));
      window.__nextFiveEdges = Object.fromEntries(edges.map(edge => [edge.destNode.id, edge.id]));
    }
    dl.batchDraw();
  }, kind);

  const placeOn = async (id) => page.evaluate((nodeId) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const node = dl.getDANodes().find(candidate => candidate.id === nodeId);
    da.crosshairsLayer.crosshairs.x = dl.x() + (node.group.x() + node.NODE_WIDTH / 2) * dl.scaleX();
    da.crosshairsLayer.crosshairs.y = dl.y() + (node.group.y() + node.NODE_HEIGHT / 2) * dl.scaleY();
  }, id);

  await makeGraph('add');
  await placeOn('anchor');
  await page.keyboard.press('a');
  await page.waitForTimeout(350);
  const added = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const edge = da.drawingLayer.getDAEdges()[0];
    return {from: edge?.srcNode.id, to: edge?.destNode.id, directedness: edge?.directedness};
  });
  check('connected add defaults to an outgoing directed edge',
    added.from === 'anchor' && added.to !== 'anchor' && added.directedness === 'directed', JSON.stringify(added));

  await page.keyboard.type('foo bar');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  const cursorShape = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const node = da.drawingLayer.getSelectedDANodes()[0];
    return {closed: node._cursor.closed(), points: node._cursor.points().length};
  });
  check('vim-normal edit cursor is a box', cursorShape.closed && cursorShape.points === 8,
    JSON.stringify(cursorShape));

  const opacities = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(220);
    opacities.push(await page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      return da.drawingLayer.getSelectedDANodes()[0]._cursor.opacity();
    }));
  }
  check('editing cursor blinks', new Set(opacities).size > 1, JSON.stringify(opacities));

  await page.keyboard.press('0');
  await page.keyboard.press('e');
  const wordEnd = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getSelectedDANodes()[0].cursorIndex;
  });
  check('vim e moves to the current word end', wordEnd === 2, `cursor=${wordEnd}`);
  await page.keyboard.press('Escape');

  await makeGraph('links');
  await placeOn('source');
  const label = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return km.buildRootSubmenuConfig().f.actionLabel;
  });
  check('Go is relabeled Move by Link', label === 'Move by Link', label);

  await page.keyboard.press('f');
  await page.waitForTimeout(150);
  let linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {open: da.navPopupOpen, focus: da.graphNavEdge?.id ?? null};
  });
  check('Move by Link remains open after releasing its opener', linkState.open, JSON.stringify(linkState));

  await page.keyboard.press('h');
  linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {focus: da.graphNavEdge?.id, ids: window.__nextFiveEdges};
  });
  check('h focuses the central W-quadrant link',
    linkState.focus === linkState.ids['west-center'], JSON.stringify(linkState));

  await page.keyboard.press('j');
  linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {focus: da.graphNavEdge?.id, ids: window.__nextFiveEdges};
  });
  check('j focuses the immediately lower W-quadrant link',
    linkState.focus === linkState.ids['west-below'], JSON.stringify(linkState));

  await page.keyboard.press('j');
  linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {focus: da.graphNavEdge?.id, ids: window.__nextFiveEdges};
  });
  check('j crosses from the bottom of W to the leftmost S link',
    linkState.focus === linkState.ids['south-left'], JSON.stringify(linkState));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await placeOn('source');
  await page.keyboard.press('f');
  await page.waitForTimeout(100);
  await page.keyboard.press('h');
  await page.waitForTimeout(50);
  await page.keyboard.press('h');
  await page.waitForTimeout(200);
  linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {landed: da.graphNavLastNode?.id, open: da.navPopupOpen};
  });
  check('pressing h again walks the focused W link',
    linkState.landed === 'west-center' && linkState.open, JSON.stringify(linkState));

  check('no browser errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
