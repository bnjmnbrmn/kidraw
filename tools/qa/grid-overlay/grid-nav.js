/*
 * Grid navigation for move-by-node (notes/design-grid-navigation.md), vim
 * profile, real keys. Purely spatial (no edges): visible stops form a loose
 * grid; a press steps one row/column that way and snaps to the goal position
 * on the perpendicular axis (text-editor "goal column", both axes).
 *
 *   1. Stepping right/left moves column-by-column; up/down row-by-row.
 *   2. Goal-column memory: descending a column past a GAP row lands on the
 *      nearest stop, but the goal column is preserved and re-acquired on the
 *      next row that has it.
 *   3. Every spatially distinct stop owns one cell.
 *   4. The held-key overlay is made of spreadsheet bands/boundaries and
 *      replaces the ordinary drawing grid.
 */
const {launch, openApp, settled, movedAndSettled, crosshairsOf, overlay: waitForOverlay, checker} =
  require('../harness');

const check = checker();

async function main() {
  const browser = await launch();
  const page = await openApp(browser);

  // 3×3 grid at rows y=200,400,600 and cols x=300,650,1000, minus the center
  // (r1c1) so the middle column has a gap.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    const mk = (id, cx, cy) => ({id, x: cx - 50, y: cy - 25, text: id, width: 100, height: 50, fontSize: 14, isSelected: false});
    const nodes = []; const cols = [300, 650, 1000], rows = [200, 400, 600];
    rows.forEach((y, r) => cols.forEach((x, c) => { if (!(r === 1 && c === 1)) nodes.push(mk('r' + r + 'c' + c, x, y)); }));
    da.drawingLayer.restoreGraph({ nodes, edges: [] });
    da.drawingLayer.batchDraw();
  });

  const park = (id) => page.evaluate((t) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.finishTweens();
    da.navGrid.navGridLast = null; da.navGrid.navGoalX = null; da.navGrid.navGoalY = null;
    // Nodes auto-size to their label, so the fixture's declared 100x50 is not
    // what renders. Park on the real center — the same one at() measures
    // against — or the remembered goal column lands beside every stop.
    const n = da.drawingLayer.getDANodes().find(n => n.id === t);
    const center = da.getNodeCenterInStageCoordinates(n);
    da.crosshairsLayer.crosshairs.x = center.x;
    da.crosshairsLayer.crosshairs.y = center.y;
  }, id);
  const at = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const cx = da.crosshairsLayer.crosshairsX(), cy = da.crosshairsLayer.crosshairsY();
    let best = '(none)', bd = 1e9;
    for (const n of da.drawingLayer.getDANodes()) { const c = da.getNodeCenterInStageCoordinates(n); const d = Math.hypot(c.x - cx, c.y - cy); if (d < bd) { bd = d; best = n.id; } }
    return bd < 12 ? best : '(none)';
  });
  const press = async (k) => {
    await page.keyboard.down('g'); await waitForOverlay(page, true);
    const before = await crosshairsOf(page);
    await page.keyboard.press(k); await movedAndSettled(page, before);
    await page.keyboard.up('g'); await waitForOverlay(page, false);
  };

  // 0. The overlay is a shaded spreadsheet, not centerlines over the normal
  //    movement grid. The synthetic graph has three row and column bands.
  await park('r0c0');
  await page.keyboard.down('g'); await waitForOverlay(page, true);
  await page.keyboard.press('e'); await settled(page);
  const selectedStrategy = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return da.navGrid.graphItemNavigationStrategy;
  });
  check('g→e explicitly selects the adaptive band-grid strategy',
    selectedStrategy === 'adaptive-band-grid', String(selectedStrategy));
  // The spreadsheet overlay belongs to the band-grid strategy, so this has to
  // come after g→e selects it: the app now starts on adaptive-quadrant-rings,
  // which draws a different overlay entirely.
  const overlay = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const children = da.navGrid.nodeGridGroup ? [...da.navGrid.nodeGridGroup.getChildren()] : [];
    return {
      rects: children.filter(shape => shape.getClassName() === 'Rect').length,
      lines: children.filter(shape => shape.getClassName() === 'Line').length,
      membershipMarkers: da.navGrid.nodeGridGroup?.find('.node-grid-membership-marker').length ?? 0,
      rowArmOpacities: da.navGrid.nodeGridGroup?.find('.node-grid-row-arm').map(line => line.opacity()) ?? [],
      columnArmOpacities: da.navGrid.nodeGridGroup?.find('.node-grid-column-arm').map(line => line.opacity()) ?? [],
      visibleStops: da.navStops('labels').filter(stop =>
        stop.cx >= 0 && stop.cx <= da.stage.width() && stop.cy >= 0 && stop.cy <= da.stage.height()).length,
      ordinaryGridVisible: da.drawingLayer.gridVisible,
    };
  });
  check('overlay uses shaded row/column bands plus cell boundaries',
    overlay.rects >= 5 && overlay.lines >= 3,
    `${overlay.rects} fills, ${overlay.lines} boundaries`);
  check('move-by-node overlay replaces the ordinary drawing grid',
    !overlay.ordinaryGridVisible, `ordinary grid visible=${overlay.ordinaryGridVisible}`);
  check('every stop has a two-axis light/dark band-membership marker',
    overlay.membershipMarkers === overlay.visibleStops &&
      new Set(overlay.rowArmOpacities).size === 2 &&
      new Set(overlay.columnArmOpacities).size === 2,
    `${overlay.membershipMarkers}/${overlay.visibleStops} markers; rows=${overlay.rowArmOpacities}; columns=${overlay.columnArmOpacities}`);
  await page.keyboard.up('g'); await waitForOverlay(page, false);

  // 1. step right along the top row, then down the right column
  await park('r0c0');
  await press('l'); const a1 = await at();
  await press('l'); const a2 = await at();
  check('right steps column-by-column across the row', a1 === 'r0c1' && a2 === 'r0c2', `${a1}, ${a2}`);
  await press('j'); const a3 = await at();
  await press('j'); const a4 = await at();
  check('down keeps the goal column (c2)', a3 === 'r1c2' && a4 === 'r2c2', `${a3}, ${a4}`);

  // 2. goal-column preserved past a gap: from r0c1, down hits the gap row
  //    (nearest stop) then re-acquires column c1 on r2.
  await park('r0c1');
  await press('j'); const g1 = await at();
  await press('j'); const g2 = await at();
  check('down past the middle-column gap lands on the gap row then re-acquires c1',
    g1 !== 'r0c1' && g2 === 'r2c1', `${g1}, ${g2}`);

  // 2b. While sitting off-column in the gap row, the overlay shows the
  //     remembered column that the following vertical step will re-acquire.
  await park('r0c1');
  await page.keyboard.down('g'); await waitForOverlay(page, true);
  await page.keyboard.press('j'); await settled(page);
  const goalGuide = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const guide = da.navGrid.nodeGridGroup?.findOne('.node-grid-goal-guide');
    return guide ? {
      points: guide.points(),
      dash: guide.dash(),
      crosshairX: da.crosshairsLayer.crosshairsX(),
    } : null;
  });
  // The column to return to is wherever c1's stops actually sit, not the
  // fixture's nominal 650: nodes auto-size to their labels.
  const columnC1 = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const n = da.drawingLayer.getDANodes().find(n => n.id === 'r0c1');
    return da.getNodeCenterInStageCoordinates(n).x;
  });
  check('gap row shows the remembered return column as a dashed guide',
    !!goalGuide && goalGuide.dash.length > 0 &&
      Math.abs(goalGuide.points[0] - columnC1) < 3 &&
      Math.abs(goalGuide.crosshairX - goalGuide.points[0]) > 100,
    `${JSON.stringify(goalGuide)} vs column ${columnC1}`);
  await page.keyboard.press('j'); await settled(page);
  const reacquired = await at();
  const guideAfterReacquire = await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const guide = da.navGrid.nodeGridGroup?.findOne('.node-grid-goal-guide');
    return {
      present: !!guide,
      guideX: guide ? guide.points()[0] : null,
      crosshairX: da.crosshairsLayer.crosshairsX(),
      goalX: da.navGrid.navGoalX,
      axis: da.navGrid.navGoalAxis,
    };
  });
  check('return guide clears after its column is re-acquired',
    reacquired === 'r2c1' && !guideAfterReacquire.present,
    `at=${reacquired}, ${JSON.stringify(guideAfterReacquire)}`);
  await page.keyboard.up('g'); await waitForOverlay(page, false);

  // 3. up from the bottom-left returns up the column
  await park('r2c0');
  await press('k'); const u1 = await at();
  await press('k'); const u2 = await at();
  check('up steps row-by-row keeping the column (c0)', u1 === 'r1c0' && u2 === 'r0c0', `${u1}, ${u2}`);

  await browser.close();
  console.log(check.failures === 0 ? 'ALL CHECKS PASSED' : `${check.failures} CHECK(S) FAILED`);
  process.exit(check.failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
