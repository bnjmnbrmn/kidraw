/*
 * Verify the label add/edit/move flow end to end with real key events
 * (vim profile: a = insert submenu, f = Add Label, v = Select+Drag, hjkl drag).
 *
 *   1. a→f over an edge adds exactly ONE label (held key must not auto-repeat
 *      into a stack of labels), created empty and selected.
 *   2. Releasing a enters label-edit mode; typing goes straight into the new
 *      label with no default "label" text to fight.
 *   3. Shift+Enter exits; the typed label survives.
 *   4. A label left empty on exit is pruned, not left as an invisible target.
 *   5. Select+Drag (hold v + hjkl) over a label selects it and slides it
 *      along the edge / cycles its side.
 *   6. There is no label size limit: long text grows the box and the grown
 *      box stays selectable at its far edge.
 *   7. a→f over empty canvas adds nothing and does NOT enter label edit.
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
  await page.waitForTimeout(500);

  const placeAtT = t => page.evaluate(t => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const xh = c.crosshairsLayer.crosshairs;
    const points = dl.getDAEdges()[0].getPathPoints();
    const lens = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const l = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      lens.push(l); total += l;
    }
    let target = t * total, acc = 0, p = points[points.length - 1];
    for (let i = 0; i < lens.length; i++) {
      if (acc + lens[i] >= target || i === lens.length - 1) {
        const st = lens[i] > 0 ? (target - acc) / lens[i] : 0;
        p = { x: points[i].x + st * (points[i + 1].x - points[i].x),
              y: points[i].y + st * (points[i + 1].y - points[i].y) };
        break;
      }
      acc += lens[i];
    }
    xh.x = p.x * dl.scaleX() + dl.x();
    xh.y = p.y * dl.scaleY() + dl.y();
  }, t);

  const placeAtStage = (x, y) => page.evaluate(([x, y]) => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    c.crosshairsLayer.crosshairs.x = x;
    c.crosshairsLayer.crosshairs.y = y;
  }, [x, y]);

  const placeOverLabel = i => page.evaluate(i => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const xh = c.crosshairsLayer.crosshairs;
    const label = dl.getDAEdges()[0].labels[i];
    xh.x = label.x * dl.scaleX() + dl.x();
    xh.y = label.y * dl.scaleY() + dl.y();
  }, i);

  const state = () => page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    return {
      mode: km.keyMenu.currentMode.name,
      labels: c.drawingLayer.getDAEdges()[0].labels.map(l =>
        ({ text: l.label, t: l.edgeT, side: l.side, selected: l.isSelected,
           w: l.width, h: l.height })),
    };
  });

  // 1. Add a label with the label key held well past the auto-repeat delay.
  //    (vim profile: hold `a` = Insert submenu, `f` = Label)
  await placeAtT(0.5);
  await page.keyboard.down('a');
  await page.waitForTimeout(120);
  await page.keyboard.down('f');
  await page.waitForTimeout(900);          // repeat would fire several times here
  await page.keyboard.up('f');
  await page.waitForTimeout(80);
  let s = await state();
  check('held Add Label key adds exactly one label', s.labels.length === 1, `${s.labels.length} labels`);
  check('new label starts empty', s.labels[0]?.text === '', JSON.stringify(s.labels[0]?.text));
  check('new label is selected', s.labels[0]?.selected === true);
  check('still in normal mode while a held', s.mode === 'normal', s.mode);

  // 2. Release a → label edit mode; type into the new label.
  await page.keyboard.up('a');
  await page.waitForTimeout(120);
  s = await state();
  check('releasing a enters label-edit mode', s.mode === 'labelEdit', s.mode);
  // Explicit slow shift chord for the capital — keyboard.type()'s fast
  // synthetic Shift races the keymenu's shift-submenu push.
  await page.keyboard.down('Shift');
  await page.waitForTimeout(120);
  await page.keyboard.press('H');
  await page.waitForTimeout(120);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(80);
  await page.keyboard.type('ello world', { delay: 25 });
  s = await state();
  check('typed text lands in the label with no default prefix',
    s.labels[0]?.text === 'Hello world', JSON.stringify(s.labels[0]?.text));

  // 3. Shift+Enter exits; the label survives.
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  s = await state();
  check('Shift+Enter exits label-edit mode', s.mode === 'normal', s.mode);
  check('typed label survives exit', s.labels.length === 1 && s.labels[0].text === 'Hello world',
    JSON.stringify(s.labels.map(l => l.text)));

  // 4. A label left empty on exit is pruned.
  await placeAtT(0.1);
  await page.keyboard.down('a');
  await page.waitForTimeout(120);
  await page.keyboard.press('f');
  await page.waitForTimeout(80);
  await page.keyboard.up('a');
  await page.waitForTimeout(120);
  s = await state();
  check('second label added and in edit mode', s.labels.length === 2 && s.mode === 'labelEdit',
    `${s.labels.length} labels, mode=${s.mode}`);
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  s = await state();
  check('empty label pruned on exit', s.labels.length === 1 && s.labels[0].text === 'Hello world',
    JSON.stringify(s.labels.map(l => l.text)));

  // 5. Select+Drag over the label: hold v, slide with l, change side with k.
  await placeOverLabel(0);
  const tBefore = (await state()).labels[0].t;
  await page.keyboard.down('v');
  await page.waitForTimeout(120);
  s = await state();
  check('holding v over a label selects it', s.labels[0]?.selected === true);
  await page.keyboard.press('l');
  await page.waitForTimeout(60);
  await page.keyboard.press('l');
  await page.waitForTimeout(60);
  await page.keyboard.press('k');
  await page.waitForTimeout(60);
  await page.keyboard.up('v');
  await page.waitForTimeout(120);
  s = await state();
  check('drag right slides the label along the edge', s.labels[0].t > tBefore,
    `t ${tBefore.toFixed(3)} → ${s.labels[0].t.toFixed(3)}`);
  check('drag up cycles the label side to above', s.labels[0].side === 'above', s.labels[0].side);
  check('label still in normal mode after drag', s.mode === 'normal', s.mode);

  // 6. No size limit: long text grows the box, and the grown box is still
  //    hit-testable at its edge (select via v works out there).
  await placeOverLabel(0);
  await page.keyboard.press('i');           // tap edit key over the label
  await page.waitForTimeout(150);
  await page.keyboard.type(' and quite a lot more text to stretch the box', { delay: 10 });
  s = await state();
  const grownW = s.labels[0].w;
  check('long text grows the label box', grownW > 200, `w=${grownW}`);
  check('long text fully stored', s.labels[0].text.endsWith('stretch the box'),
    JSON.stringify(s.labels[0].text));
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  const edgeHit = await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer;
    const xh = c.crosshairsLayer.crosshairs;
    const label = dl.getDAEdges()[0].labels[0];
    // Near the right edge of the grown box — far outside the old 50px width.
    xh.x = (label.x + label.width / 2 - 5) * dl.scaleX() + dl.x();
    xh.y = label.y * dl.scaleY() + dl.y();
    c.handleCommands({ kind: 'MULTI_ITEM_SELECT' });
    const hit = label.isSelected;
    c.handleCommands({ kind: 'UNSELECT_ALL' });
    return hit;
  });
  check('grown box is selectable at its far edge', edgeHit);

  // 7. Add Label over empty canvas: nothing added, no label-edit mode.
  await placeAtStage(60, 60);
  await page.keyboard.down('a');
  await page.waitForTimeout(120);
  await page.keyboard.press('f');
  await page.waitForTimeout(80);
  await page.keyboard.up('a');
  await page.waitForTimeout(120);
  s = await state();
  check('Add Label over empty canvas adds nothing', s.labels.length === 1, `${s.labels.length} labels`);
  check('failed Add Label does not enter label-edit mode', s.mode === 'normal', s.mode);

  await browser.close();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
