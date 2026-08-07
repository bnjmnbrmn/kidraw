/* Browser acceptance checks for the 2026-08-06 live Next set. */
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

  const loadSample = async id => page.evaluate(sampleId => {
    const select = document.querySelector('select.sample-graph-select');
    select.value = sampleId;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  }, id);

  await loadSample('modes');
  await page.waitForTimeout(150);
  const sample = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    window.__NextItemsLabelCtor = Object.getPrototypeOf(
      da.drawingLayer.getDAEdges()[0].labels[0],
    ).constructor;
    return {
      nodes: da.drawingLayer.getDANodes().map(node => node.label.text()),
      labels: da.drawingLayer.getDAEdges().flatMap(edge => edge.labels.map(label => label.label)),
      selfLoops: da.drawingLayer.getDAEdges().filter(edge => edge.srcNode === edge.destNode)
        .flatMap(edge => edge.labels.map(label => label.label)),
    };
  });
  check('the keymenu sample uses concrete menu states and event/action transitions',
    sample.nodes.includes('Main Mode Menu') &&
      sample.nodes.includes('Zoom/Pan') &&
      sample.nodes.filter(node => node === '').length === 2 &&
      sample.labels.includes('r-down') &&
      sample.labels.includes('i-down / Zoom In') &&
      sample.labels.includes('o-down / Zoom Out') &&
      sample.selfLoops.includes('key repeat fired / Zoom In') &&
      sample.selfLoops.includes('key repeat fired / Zoom Out') &&
      sample.labels.filter(label => label === 'r-up').length === 3 &&
      sample.labels.includes('i-up') && sample.labels.includes('o-up'),
    `${sample.nodes.length} states / ${sample.labels.length} transitions`);

  await loadSample('basic');
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    const node = new NodeCtor(500, 220, 'existing text', 'existing');
    dl.addRawNode(node);
    dl.position({x: 0, y: 0});
    dl.scale({x: 1, y: 1});
    da.crosshairsLayer.crosshairs.x = node.group.x() + node.NODE_WIDTH / 2;
    da.crosshairsLayer.crosshairs.y = node.group.y() + node.NODE_HEIGHT / 2;
    da.crosshairsLayer.showCrosshairs();
    dl.batchDraw();
  });
  await page.keyboard.press('i');
  await page.waitForTimeout(80);
  let edit = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const node = da.drawingLayer.getSelectedDANodes()[0];
    return {
      mode: km.keyMenu.currentMode.name,
      selected: da.drawingLayer.getSelectedDANodes().length,
      cursorClosed: node?._cursor.closed() ?? null,
    };
  });
  check('i over existing node text enters Vim normal',
    edit.mode === 'labelEditVimNormal' && edit.cursorClosed, JSON.stringify(edit));
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    dl.position({x: 0, y: 0});
    const src = new NodeCtor(300, 200, 'source', 'label-src');
    const dest = new NodeCtor(700, 200, 'dest', 'label-dest');
    dl.addRawNode(src);
    dl.addRawNode(dest);
    const edge = dl.addEdge(src, dest);
    const label = new window.__NextItemsLabelCtor(0, 0, 'existing label', 'existing-label');
    edge.addLabel(label);
    edge.refreshGeometry();
    da.crosshairsLayer.crosshairs.x = label.x;
    da.crosshairsLayer.crosshairs.y = label.y;
    da.crosshairsLayer.showCrosshairs();
    dl.batchDraw();
  });
  await page.keyboard.press('i');
  await page.waitForTimeout(80);
  const labelEdit = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    const label = da.drawingLayer.getDAEdges()[0].labels[0];
    return {mode: km.keyMenu.currentMode.name, selected: label.isSelected, cursorClosed: label._cursor.closed()};
  });
  check('i over an existing edge label also enters Vim normal',
    labelEdit.mode === 'labelEditVimNormal' && labelEdit.selected && labelEdit.cursorClosed,
    JSON.stringify(labelEdit));
  await page.keyboard.press('Escape');

  // New-node quick add retains direct insert entry.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.drawingLayer.clearAll();
    da.crosshairsLayer.crosshairs.x = 600;
    da.crosshairsLayer.crosshairs.y = 300;
    da.crosshairsLayer.showCrosshairs();
  });
  await page.keyboard.press('a');
  await page.waitForTimeout(350);
  edit = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {mode: km.keyMenu.currentMode.name};
  });
  check('adding a new node still enters insert mode', edit.mode === 'labelEdit', JSON.stringify(edit));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Put an existing node partly below the viewport, enter at its visible
  // center, and verify entry pans enough for three rendered lines of context.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    dl.position({x: 0, y: 0});
    dl.scale({x: 1, y: 1});
    const node = new NodeCtor(500, da.stage.height() - 80, 'one\ntwo\nthree\nfour', 'caret');
    dl.addRawNode(node);
    da.crosshairsLayer.crosshairs.x = node.group.x() + node.NODE_WIDTH / 2;
    da.crosshairsLayer.crosshairs.y = da.stage.height() - 20;
    da.crosshairsLayer.showCrosshairs();
    window.__caretStartLayerY = dl.y();
    dl.batchDraw();
  });
  await page.keyboard.press('i');
  await page.waitForTimeout(100);
  const caret = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const node = dl.getSelectedDANodes()[0];
    const box = node.caretViewportBox();
    const bottom = dl.y() + node.group.y() + box.y + box.height;
    return {
      startY: window.__caretStartLayerY,
      layerY: dl.y(),
      bottom,
      limit: da.stage.height() - box.lineHeight * 3,
    };
  });
  check('text editing pans to keep the caret and three surrounding lines visible',
    caret.layerY < caret.startY && caret.bottom <= caret.limit + 0.01, JSON.stringify(caret));
  await page.keyboard.press('Escape');

  // A semantic landing at low zoom receives an actual natural-scale clone.
  const tinyGhost = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const node = dl.getDANodes()[0];
    dl.scale({x: 0.25, y: 0.25});
    dl.position({x: 500, y: 250});
    da.normalMovementHoverTarget = {kind: 'node', id: node.id};
    da.crosshairsLayer.showCrosshairs();
    da.refreshCrosshairHoverHighlight();
    const ghost = da.crosshairsLayer.findOne('.navigation-node-ghost');
    return {
      target: ghost?.getAttr('targetId'),
      reasons: ghost?.getAttr('reasons') ?? [],
      texts: ghost?.find('Text').map(text => text.text()) ?? [],
      scale: ghost?.findOne('Group')?.scaleX(),
    };
  });
  check('navigation ghosts make too-small landed nodes readable at natural scale',
    tinyGhost.target === 'caret' && tinyGhost.reasons.includes('too-small') &&
      tinyGhost.texts.includes('one\ntwo\nthree\nfour') && tinyGhost.scale === 1,
    JSON.stringify(tinyGhost));

  const occludedGhost = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    dl.scale({x: 1, y: 1});
    dl.position({x: 0, y: 0});
    const target = new NodeCtor(500, 200, 'underneath', 'under');
    const cover = new NodeCtor(515, 215, 'covering', 'cover');
    dl.addRawNode(target);
    dl.addRawNode(cover);
    da.normalMovementHoverTarget = {kind: 'node', id: target.id};
    da.crosshairsLayer.showCrosshairs();
    da.refreshCrosshairHoverHighlight();
    const ghost = da.crosshairsLayer.findOne('.navigation-node-ghost');
    return {
      target: ghost?.getAttr('targetId'),
      reasons: ghost?.getAttr('reasons') ?? [],
      texts: ghost?.find('Text').map(text => text.text()) ?? [],
    };
  });
  check('navigation ghosts reveal a semantically landed node hidden by another node',
    occludedGhost.target === 'under' && occludedGhost.reasons.includes('occluded') &&
      occludedGhost.texts.includes('underneath'), JSON.stringify(occludedGhost));

  const offscreenGhost = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = da.drawingLayer;
    const NodeCtor = Object.getPrototypeOf(dl.getDANodes()[0]).constructor;
    dl.clearAll();
    dl.scale({x: 1, y: 1});
    dl.position({x: 0, y: 0});
    const target = new NodeCtor(-80, 180, 'offscreen target', 'offscreen');
    dl.addRawNode(target);
    da.normalMovementHoverTarget = {kind: 'node', id: target.id};
    da.crosshairsLayer.showCrosshairs();
    da.refreshCrosshairHoverHighlight();
    let ghost = da.crosshairsLayer.findOne('.navigation-node-ghost');
    const partial = {reasons: ghost?.getAttr('reasons') ?? [], x: ghost?.x()};
    target.group.x(-500);
    da.refreshCrosshairHoverHighlight();
    ghost = da.crosshairsLayer.findOne('.navigation-node-ghost');
    return {
      partial,
      whole: {reasons: ghost?.getAttr('reasons') ?? [], x: ghost?.x()},
    };
  });
  check('partly and wholly offscreen navigation targets get viewport-clamped ghosts',
    offscreenGhost.partial.reasons.includes('offscreen') && offscreenGhost.partial.x >= 12 &&
      offscreenGhost.whole.reasons.includes('offscreen') && offscreenGhost.whole.x >= 12,
    JSON.stringify(offscreenGhost));

  check('no browser errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
