/* Repro for da-193 "Fix coarse dragging": drag a node at each tier and zoom,
 * measuring actual node movement. Ben's live log (2026-08-14 11:47) shows
 * three coarse drags at scale 0.567 with zero movement. */
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
  const page = await (await browser.newContext({viewport: {width: 1600, height: 1000}})).newPage();
  page.on('pageerror', error => console.error('[page error]', error.message));
  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});

  const keys = await page.evaluate(() => {
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      left: km.keyAssignments.drag.left,
      right: km.keyAssignments.drag.right,
      coarse: km.keyAssignments.dragSpeed.bigger,
      fine: km.keyAssignments.dragSpeed.smaller,
      select: km.keyAssignments.root.selectDragSubmenu,
    };
  });
  console.log('keys:', JSON.stringify(keys));

  const setup = (scale) => page.evaluate(async (s) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.cancelDragAnimation?.();
    da.clearNormalMovementGoal();
    da.drawingLayer.restoreGraph({
      nodes: [{id: 'da-n1', x: 700, y: 400, text: 'Dragme', width: 140, height: 60, fontSize: 14, isSelected: false}],
      edges: [],
    });
    da.drawingLayer.scale({x: s, y: s});
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
    const node = da.drawingLayer.getDANodes()[0];
    // Crosshairs onto node center, in stage coords
    da.crosshairsLayer.crosshairs.x = (node.group.x() + node.NODE_WIDTH / 2) * s;
    da.crosshairsLayer.crosshairs.y = (node.group.y() + node.NODE_HEIGHT / 2) * s;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
    return {
      x: node.group.x(),
      grid: da.drawingLayer.getGridSpacing(),
      subgrid: da.drawingLayer.getSubGridSpacing(),
    };
  }, scale);

  const nodeX = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    const node = da.drawingLayer.getDANodes()[0];
    return {x: node.group.x(), selected: node.isSelected};
  });

  const dragOnce = async (tierKey) => {
    await page.keyboard.down(keys.select);
    await page.waitForTimeout(60);
    if (tierKey) {
      await page.keyboard.down(tierKey);
      await page.waitForTimeout(60);
    }
    await page.keyboard.press(keys.left);
    await page.waitForTimeout(500); // let the drag tween finish
    if (tierKey) await page.keyboard.up(tierKey);
    await page.keyboard.up(keys.select);
    await page.waitForTimeout(100);
  };

  for (const scale of [1, 0.5665991902834009]) {
    for (const [tierName, tierKey] of [['normal', null], ['fine', keys.fine], ['coarse', keys.coarse]]) {
      const init = await setup(scale);
      await dragOnce(tierKey);
      const after = await nodeX();
      const moved = init.x - after.x;
      console.log(`scale=${scale.toFixed(3)} tier=${tierName}: moved ${moved.toFixed(1)} ` +
        `(grid=${init.grid}, subgrid=${init.subgrid}, selected=${after.selected})`);
      check(`${tierName} drag moves the node at scale ${scale.toFixed(3)}`, moved > 0.5,
        `moved=${moved.toFixed(1)}`);
    }
  }

  // ---- Label drag at each tier: select an edge label, drag along the edge ----
  const setupLabel = (scale, t = 0.5) => page.evaluate(async ({s, t}) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.cancelDragAnimation?.();
    da.clearNormalMovementGoal();
    da.drawingLayer.restoreGraph({
      nodes: [
        {id: 'da-a', x: 200, y: 400, text: 'A', width: 140, height: 60, fontSize: 14, isSelected: false},
        {id: 'da-b', x: 1100, y: 400, text: 'B', width: 140, height: 60, fontSize: 14, isSelected: false},
      ],
      edges: [{
        id: 'da-e', srcNodeId: 'da-a', destNodeId: 'da-b', isSelected: false,
        labels: [{id: 'da-l', x: 0, y: 0, text: 'lbl', fontSize: 12, isSelected: false, edgeT: t, side: 'on'}],
      }],
    });
    da.drawingLayer.scale({x: s, y: s});
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
    const label = da.drawingLayer.getDAEdges()[0].labels[0];
    da.crosshairsLayer.crosshairs.x = (label.x + label.width / 2) * s;
    da.crosshairsLayer.crosshairs.y = (label.y + label.height / 2) * s;
    da.crosshairsLayer.showCrosshairs();
    da.drawingLayer.batchDraw();
    return {t: label.edgeT};
  }, {s: scale, t});

  const labelState = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const label = da.drawingLayer.getDAEdges()[0].labels[0];
    return {t: label.edgeT, selected: label.isSelected};
  });

  for (const scale of [1, 0.5665991902834009]) {
    for (const [tierName, tierKey] of [['normal', null], ['fine', keys.fine], ['coarse', keys.coarse]]) {
      const init = await setupLabel(scale);
      await dragOnce(tierKey);
      const after = await labelState();
      const dt = Math.abs(after.t - init.t);
      console.log(`LABEL scale=${scale.toFixed(3)} tier=${tierName}: t ${init.t} -> ${after.t.toFixed(3)} (selected=${after.selected})`);
      check(`${tierName} label drag moves the label at scale ${scale.toFixed(3)}`, dt > 0.001,
        `dt=${dt.toFixed(4)}`);
    }
  }

  // ---- The hijack: crosshairs on a node but near its bottom-right corner ----
  // Ben's live log (11:47): three coarse drags, zero movement, auto-saves
  // firing. Hypothesis: the resize handle latched and every drag became an
  // invisible resize.
  const setupCorner = (scale, overNode) => page.evaluate(async ({s, overNode}) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.cancelDragAnimation?.();
    da.clearNormalMovementGoal();
    da.drawingLayer.restoreGraph({
      nodes: [{id: 'da-n1', x: 700, y: 400, text: 'Corner', width: 140, height: 60, fontSize: 14, isSelected: false}],
      edges: [],
    });
    da.drawingLayer.scale({x: s, y: s});
    da.drawingLayer.position({x: 0, y: 0});
    da.drawingLayer.rebuildGrid(da.stage.width(), da.stage.height());
    const node = da.drawingLayer.getDANodes()[0];
    const br = node.getBottomRightAbsolute();
    // Just inside the node, 10 units up-left of its bottom-right corner
    // (within the 25-unit proximity band), or just outside it.
    const px = overNode ? br.x - 10 : br.x + 12;
    const py = overNode ? br.y - 10 : br.y + 12;
    da.crosshairsLayer.crosshairs.x = px * s;
    da.crosshairsLayer.crosshairs.y = py * s;
    da.crosshairsLayer.showCrosshairs();
    // The proximity check normally runs on movement completion; call it the
    // way a real crosshair landing does.
    da.checkResizeHandleProximity();
    da.drawingLayer.batchDraw();
    return {x: node.group.x(), w: node.NODE_WIDTH, h: node.NODE_HEIGHT};
  }, {s: scale, overNode});

  const nodeState = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    const node = da.drawingLayer.getDANodes()[0];
    return {x: node.group.x(), w: node.NODE_WIDTH, h: node.NODE_HEIGHT, selected: node.isSelected};
  });

  // Post-fix contract: whenever the crosshairs (including their hit slop)
  // reach the node, v+drag drags — it never silently resizes. The corner
  // handle only captures when the gesture has nothing else to act on.
  for (const overNode of [true, false]) {
    const init = await setupCorner(0.5665991902834009, overNode);
    await dragOnce(keys.coarse);
    await dragOnce(keys.coarse);
    await dragOnce(keys.coarse);
    const after = await nodeState();
    const moved = init.x - after.x;
    const shrunk = init.w - after.w;
    console.log(`CORNER overNode=${overNode}: moved=${moved.toFixed(1)} shrunk=${shrunk.toFixed(1)} (w ${init.w} -> ${after.w})`);
    check(`coarse drag near the corner (overNode=${overNode}) never silently resizes`,
      shrunk === 0, `shrunk=${shrunk.toFixed(1)}`);
    check(`coarse drag near the corner (overNode=${overNode}) drags the slop-selected node`,
      moved > 0.5, `moved=${moved.toFixed(1)}`);
  }

  // The explicit resize commands remain the reliable resize path.
  {
    await setupCorner(1, true);
    const resized = await page.evaluate(() => {
      const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
      const node = da.drawingLayer.getDANodes()[0];
      node.isSelected = true;
      const before = node.NODE_WIDTH;
      da.handleCommands({kind: 'INCREASE_SELECTED_NODE_SIZE'});
      return {before, after: node.NODE_WIDTH};
    });
    check('explicit Increase Node Size still resizes a selected node',
      resized.after > resized.before, JSON.stringify(resized));
  }

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
