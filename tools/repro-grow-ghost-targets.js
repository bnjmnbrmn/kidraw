/*
 * Exact physical-key regression for the 2026-08-09 held-Add redesign:
 *
 *   - tap Add over a node creates a self-loop;
 *   - held Add exposes pairwise midpoint + source-grid insertion ghosts;
 *   - hjkl reaches a ghost through Move by Node, and release creates the
 *     linked node at that exact landing and enters text insertion;
 *   - the same augmented navigation can continue through ghosts to a real
 *     node and release creates only the edge.
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
  page.on('pageerror', error => console.error('[page error]', error.message));
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});

  const resetGraph = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const node = (id, x, y, text) => ({
      id, x, y, text, width: 140, height: 60, fontSize: 14, isSelected: false,
    });
    da.finishTweens();
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.scale({x: 1, y: 1});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
    da.drawingLayer.restoreGraph({
      nodes: [
        node('da-a', 300, 250, 'A'),
        node('da-b', 1100, 250, 'B'),
        node('da-c', 300, 750, 'C'),
      ],
      edges: [],
    });
    da.drawingLayer.batchDraw();
  });

  const parkOn = text => page.evaluate(label => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    const dl = da.drawingLayer;
    const node = dl.getDANodes().find(item => item.label.text() === label);
    const center = {
      x: node.group.x() + node.NODE_WIDTH / 2,
      y: node.group.y() + node.NODE_HEIGHT / 2,
    };
    da.crosshairsLayer.crosshairs.x = dl.x() + center.x * dl.scaleX();
    da.crosshairsLayer.crosshairs.y = dl.y() + center.y * dl.scaleY();
    da.crosshairsLayer.batchDraw();
  }, text);

  const state = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      mode: km.keyMenu.currentMode.name,
      growActive: da.growActive,
      insertion: da.growInsertionTarget && {...da.growInsertionTarget},
      target: da.growTarget?.id ?? null,
      ghosts: da.growGhostTargets.map(target => ({...target})),
      renderedGhosts: da.growGhost?.find('.grow-insertion-target').length ?? 0,
      augmentedStops: da.growActive ? da.navStops('nodes').length : 0,
      nodes: da.drawingLayer.getDANodes().map(node => ({
        id: node.id,
        text: node.label.text(),
        cx: node.group.x() + node.NODE_WIDTH / 2,
        cy: node.group.y() + node.NODE_HEIGHT / 2,
      })),
      edges: da.drawingLayer.getDAEdges().map(edge => ({
        from: edge.srcNode.id,
        to: edge.destNode.id,
      })),
    };
  });

  // Tap over a node is now the direct self-loop gesture.
  await resetGraph();
  await parkOn('A');
  await page.keyboard.press('a');
  await page.waitForTimeout(250);
  let current = await state();
  check('tap Add over a node creates one self-loop and no node',
    current.nodes.length === 3 && current.edges.length === 1 &&
      current.edges[0].from === 'da-a' && current.edges[0].to === 'da-a',
    JSON.stringify({nodes: current.nodes.length, edges: current.edges}));
  check('tap self-loop returns to normal mode', current.mode === 'normal', current.mode);

  // Hold: verify both candidate families, then navigate to the nearest east
  // insertion ghost and commit it with the physical Add-key release.
  await resetGraph();
  await parkOn('A');
  await page.keyboard.down('a');
  await page.waitForTimeout(180);
  current = await state();
  check('held Add renders midpoint ghosts',
    current.ghosts.some(target => target.source === 'midpoint' &&
      target.id.includes('da-a') && target.id.includes('da-b')));
  check('held Add renders source-grid ghosts',
    current.ghosts.some(target => target.source === 'grid'));
  check('Move by Node receives the augmented target tier',
    current.augmentedStops === current.nodes.length + current.ghosts.length,
    JSON.stringify({stops: current.augmentedStops, nodes: current.nodes.length, ghosts: current.ghosts.length}));
  check('ghost outlines are visible on the canvas', current.renderedGhosts > 0,
    `rendered=${current.renderedGhosts}`);

  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  current = await state();
  const chosenGhost = current.insertion;
  check('held Add + movement lands on a ghost', !!chosenGhost,
    JSON.stringify({target: current.target, insertion: current.insertion}));
  await page.keyboard.up('a');
  await page.waitForTimeout(300);
  current = await state();
  const inserted = current.nodes.find(node => !['da-a', 'da-b', 'da-c'].includes(node.id));
  check('release on a ghost creates one linked node at the landing',
    !!chosenGhost && !!inserted && current.nodes.length === 4 && current.edges.length === 1 &&
      Math.abs(inserted.cx - chosenGhost.x) < 0.01 &&
      Math.abs(inserted.cy - chosenGhost.y) < 0.01 &&
      current.edges[0].from === 'da-a' && current.edges[0].to === inserted.id,
    JSON.stringify({chosenGhost, inserted, edges: current.edges}));
  check('ghost insertion enters text insert mode', current.mode === 'labelEdit', current.mode);

  // Start clean and walk east until the real node is reached. Ghosts are
  // intermediate stops, but existing nodes remain first-class destinations.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await resetGraph();
  await parkOn('A');
  await page.keyboard.down('a');
  let hops = 0;
  const visited = [];
  for (; hops < 12; hops++) {
    await page.keyboard.press('l');
    await page.waitForTimeout(80);
    const landing = await state();
    visited.push(landing.target ?? landing.insertion?.id ?? null);
    if (landing.target === 'da-b') break;
  }
  current = await state();
  check('augmented navigation can reach an existing node after ghost stops',
    current.target === 'da-b', JSON.stringify({hops: hops + 1, target: current.target, visited}));
  await page.keyboard.up('a');
  await page.waitForTimeout(250);
  current = await state();
  check('release on a real node adds only the existing-to-existing edge',
    current.nodes.length === 3 && current.edges.length === 1 &&
      current.edges[0].from === 'da-a' && current.edges[0].to === 'da-b' &&
      current.mode === 'normal',
    JSON.stringify({nodes: current.nodes.length, edges: current.edges, mode: current.mode}));

  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
