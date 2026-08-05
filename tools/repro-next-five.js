/*
 * Browser smoke test for the six 2026-08-03 Next items plus the 2026-08-04
 * Move by Link entry/release refinements: held NSEW navigation, its ellipsis
 * label, exact edge hover tracing, Vim visual mode, grow target quadrant
 * selection, sequential Vim `r` replacement, nearest-node snapping,
 * immediate link focus, quadrant overlay, release-to-walk, and one-press
 * traversal when a quadrant has only one incident link, nearest-corner
 * transitions, active entry scanning, and post-landing edge/quadrant focus.
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
    } else if (graphKind === 'entry-scan') {
      const source = mk('source', 'source', 800, 300);
      const westCenter = mk('west-center', 'west center', 500, 300);
      const westBelow = mk('west-below', 'west below', 500, 440);
      const edges = [westCenter, westBelow].map(node => dl.addEdge(source, node));
      window.__entryScanEdges = Object.fromEntries(edges.map(edge => [edge.destNode.id, edge.id]));
    } else if (graphKind === 'corner') {
      const source = mk('source', 'source', 800, 300);
      const eastNorth = mk('east-north', 'east north', 1150, 220);
      const eastSouth = mk('east-south', 'east south', 1150, 480);
      const northEast = mk('north-east', 'north east', 1000, -150);
      const northWest = mk('north-west', 'north west', 600, -150);
      const edges = [eastNorth, eastSouth, northEast, northWest]
        .map(node => dl.addEdge(source, node));
      window.__cornerEdges = Object.fromEntries(edges.map(edge => [edge.destNode.id, edge.id]));
    } else {
      const source = mk('source', 'source', 800, 300);
      const westCenter = mk('west-center', 'west center', 500, 300);
      const westBelow = mk('west-below', 'west below', 500, 440);
      const southLeft = mk('south-left', 'south left', 680, 650);
      const southRight = mk('south-right', 'south right', 920, 650);
      const east = mk('east', 'east', 1100, 300);
      const edges = [westCenter, westBelow, southLeft, southRight, east]
        .map(node => dl.addEdge(source, node));
      window.__nextFiveEdges = Object.fromEntries(edges.map(edge => [edge.destNode.id, edge.id]));
    }
    dl.batchDraw();
  }, kind);

  const placeOn = async (id) => page.evaluate((nodeId) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
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

  await page.keyboard.press('v');
  await page.keyboard.press('l');
  const visual = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const node = da.drawingLayer.getSelectedDANodes()[0];
    return {
      mode: document.querySelector('.mode-badge')?.textContent?.trim(),
      visible: node._visualSelection.visible(),
      blocks: node._visualSelection.getChildren().length,
    };
  });
  check('v enters character-wise visual mode and motions extend the highlight',
    visual.mode === 'Label Edit (V)' && visual.visible && visual.blocks > 0, JSON.stringify(visual));

  await page.keyboard.press('r');
  await page.keyboard.press('Z');
  let replaced = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getSelectedDANodes()[0].label.text();
  });
  check('visual r replaces every selected character and returns to normal',
    replaced === 'foZZbar', replaced);

  await page.keyboard.press('0');
  await page.keyboard.press('r');
  await page.keyboard.press('Q');
  replaced = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getSelectedDANodes()[0].label.text();
  });
  check('normal-mode r consumes the next key and replaces one character',
    replaced === 'QoZZbar', replaced);

  await page.keyboard.press('c');
  await page.keyboard.press('w');
  await page.keyboard.type('changed');
  const changed = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.drawingLayer.getSelectedDANodes()[0].label.text();
  });
  check('normal-mode cw changes the word and enters insert mode', changed === 'changed', changed);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await makeGraph('links');
  await placeOn('source');
  const label = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return km.buildRootSubmenuConfig().f.submenuLabel;
  });
  check('Move by Link submenu is labeled with an ellipsis', label === 'Move by Link...', label);

  // Add-edge target selection uses the same W scan and corner flow.
  await page.keyboard.down('a');
  await page.keyboard.press('h');
  await page.keyboard.press('j');
  let growState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {target: da.growTarget?.id ?? null, popup: da.navPopupOpen};
  });
  check('add-edge target selection scans links like Move by Link',
    growState.target === 'west-below' && !growState.popup, JSON.stringify(growState));
  await page.keyboard.press('Escape');
  await page.keyboard.up('a');

  // Start just off the source: entry should snap onto it before choosing a
  // default incident edge.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const source = dl.getDANodes().find(node => node.id === 'source');
    da.crosshairsLayer.crosshairs.x = dl.x() +
      (source.group.x() + source.NODE_WIDTH / 2 + 100) * dl.scaleX();
    da.crosshairsLayer.crosshairs.y = dl.y() +
      (source.group.y() + source.NODE_HEIGHT / 2) * dl.scaleY();
  });
  await page.keyboard.down('f');
  await page.waitForTimeout(150);
  let linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const source = dl.getDANodes().find(node => node.id === 'source');
    const sx = dl.x() + (source.group.x() + source.NODE_WIDTH / 2) * dl.scaleX();
    const sy = dl.y() + (source.group.y() + source.NODE_HEIGHT / 2) * dl.scaleY();
    return {
      open: da.navPopupOpen,
      focus: da.graphNavEdge?.id ?? null,
      source: da.linkNavSource?.id ?? null,
      snapDistance: Math.hypot(da.crosshairsLayer.crosshairs.x - sx,
        da.crosshairsLayer.crosshairs.y - sy),
      diagonals: da.linkNavQuadrantLines?.find('.move-by-link-diagonal').length ?? 0,
      activeQuadrants: da.linkNavQuadrantLines?.find('.move-by-link-active-quadrant').length ?? 0,
    };
  });
  check('held Move by Link does not open a popup', !linkState.open, JSON.stringify(linkState));
  check('Move by Link snaps to the nearest node and immediately highlights an edge',
    linkState.source === 'source' && linkState.snapDistance < 1 && linkState.focus !== null,
    JSON.stringify(linkState));
  check('held Move by Link shows four diagonal quadrant boundaries',
    linkState.diagonals === 4, JSON.stringify(linkState));
  check('the highlighted link quadrant is shaded',
    linkState.activeQuadrants === 1, JSON.stringify(linkState));

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
  await page.keyboard.up('f');

  linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      focus: da.graphNavEdge?.id ?? null,
      source: da.linkNavSource?.id ?? null,
      landed: da.graphNavLastNode?.id ?? null,
      diagonals: da.linkNavQuadrantLines?.find('.move-by-link-diagonal').length ?? 0,
    };
  });
  check('releasing Move by Link traverses its focus, then clears the overlay',
    linkState.focus === null && linkState.source === null &&
      linkState.landed === 'south-left' && linkState.diagonals === 0,
    JSON.stringify(linkState));

  await page.waitForTimeout(150);
  await placeOn('source');
  await page.keyboard.down('f');
  await page.keyboard.press('h');
  await page.waitForTimeout(50);
  await page.keyboard.press('h');
  await page.waitForTimeout(200);
  linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      landed: da.graphNavLastNode?.id,
      source: da.linkNavSource?.id,
      focus: da.graphNavEdge?.destNode?.id ?? null,
      open: da.navPopupOpen,
    };
  });
  check('pressing h again walks the focused W link',
    linkState.landed === 'west-center' && !linkState.open, JSON.stringify(linkState));
  await page.keyboard.up('f');

  await page.waitForTimeout(150);
  await placeOn('source');
  await page.keyboard.down('f');
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      landed: da.graphNavLastNode?.id,
      source: da.linkNavSource?.id,
      focus: da.graphNavEdge?.id ?? null,
      ids: window.__nextFiveEdges,
      activeQuadrants: da.linkNavQuadrantLines?.find('.move-by-link-active-quadrant').length ?? 0,
    };
  });
  check('one directional press walks the only link in a quadrant',
    linkState.landed === 'east' && linkState.source === 'east',
    JSON.stringify(linkState));
  check('a link and its quadrant are selected immediately after a landing',
    linkState.focus === linkState.ids['east'] && linkState.activeQuadrants === 1,
    JSON.stringify(linkState));
  await page.keyboard.up('f');

  await makeGraph('corner');
  await placeOn('source');
  await page.keyboard.down('f');
  await page.keyboard.press('l');
  await page.keyboard.press('k');
  await page.waitForTimeout(100);
  linkState = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      focus: da.graphNavEdge?.id ?? null,
      ids: window.__cornerEdges,
      source: da.linkNavSource?.id ?? null,
      landed: da.graphNavLastNode?.id ?? null,
    };
  });
  check('k crosses from the northernmost E link to the easternmost N link',
    linkState.focus === linkState.ids['north-east'] &&
      linkState.source === 'source' && linkState.landed === 'source',
    JSON.stringify(linkState));
  await page.keyboard.up('f');

  await makeGraph('entry-scan');
  await placeOn('source');
  await page.keyboard.down('f');
  const entryScanBefore = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {focus: da.graphNavEdge?.id ?? null, ids: window.__entryScanEdges};
  });
  await page.keyboard.press('k');
  const entryScanAfter = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {focus: da.graphNavEdge?.id ?? null, ids: window.__entryScanEdges};
  });
  check('perpendicular movement scans from the edge highlighted on f entry',
    entryScanBefore.focus === entryScanBefore.ids['west-below'] &&
      entryScanAfter.focus === entryScanAfter.ids['west-center'],
    `${JSON.stringify(entryScanBefore)} → ${JSON.stringify(entryScanAfter)}`);
  await page.keyboard.up('f');

  // The dotted hover overlay is an untensioned trace of the exact points the
  // smooth edge renderer paints, not a second approximation of the curve.
  const hover = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const edge = da.drawingLayer.getDAEdges()[0];
    da.getLabelUnderCrosshairs = () => undefined;
    da.getWaypointUnderCrosshairs = () => undefined;
    da.getDANodesContainingCrosshairs = () => [];
    da.getDAEdgesContainingCrosshairs = () => [edge];
    da.refreshCrosshairHoverHighlight();
    const trace = da.crosshairHoverHighlight;
    return {
      tension: trace.tension(),
      points: trace.points(),
      expected: edge.getRenderedPathPoints().flatMap(p => [p.x, p.y]),
    };
  });
  check('edge hover trace follows the exact rendered path',
    hover.tension === 0 && JSON.stringify(hover.points) === JSON.stringify(hover.expected),
    `tension=${hover.tension}, points=${hover.points.length}`);

  check('no browser errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
