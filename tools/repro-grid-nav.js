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
 *   3. Everything is reachable (row then column).
 */
const { chromium } = require('@playwright/test');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
  await page.waitForTimeout(400);

  // 3×3 grid at rows y=200,400,600 and cols x=300,650,1000, minus the centre
  // (r1c1) so the middle column has a gap.
  await page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(t => t.finish()); da.tweens = [];
    const mk = (id, cx, cy) => ({id, x: cx - 50, y: cy - 25, text: id, width: 100, height: 50, fontSize: 14, isSelected: false});
    const nodes = []; const cols = [300, 650, 1000], rows = [200, 400, 600];
    rows.forEach((y, r) => cols.forEach((x, c) => { if (!(r === 1 && c === 1)) nodes.push(mk('r' + r + 'c' + c, x, y)); }));
    da.drawingLayer.restoreGraph({ nodes, edges: [] });
    da.drawingLayer.batchDraw();
  });

  const park = (id) => page.evaluate((t) => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    da.tweens.forEach(x => x.finish()); da.tweens = [];
    da.navGridLast = null; da.navGoalX = null; da.navGoalY = null;
    const n = da.drawingLayer.getDANodes().find(n => n.id === t); const p = n.group.position();
    da.crosshairsLayer.crosshairs.x = (p.x + 50) * da.drawingLayer.scaleX() + da.drawingLayer.x();
    da.crosshairsLayer.crosshairs.y = (p.y + 25) * da.drawingLayer.scaleY() + da.drawingLayer.y();
  }, id);
  const at = () => page.evaluate(() => {
    const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const cx = da.crosshairsLayer.crosshairsX(), cy = da.crosshairsLayer.crosshairsY();
    let best = '(none)', bd = 1e9;
    for (const n of da.drawingLayer.getDANodes()) { const c = da.getNodeCenterInStageCoordinates(n); const d = Math.hypot(c.x - cx, c.y - cy); if (d < bd) { bd = d; best = n.id; } }
    return bd < 12 ? best : '(none)';
  });
  const press = async (k) => {
    await page.keyboard.down('g'); await page.waitForTimeout(150);
    await page.keyboard.press(k); await page.waitForTimeout(230);
    await page.keyboard.up('g'); await page.waitForTimeout(180);
  };

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

  // 3. up from the bottom-left returns up the column
  await park('r2c0');
  await press('k'); const u1 = await at();
  await press('k'); const u2 = await at();
  check('up steps row-by-row keeping the column (c0)', u1 === 'r1c0' && u2 === 'r0c0', `${u1}, ${u2}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
