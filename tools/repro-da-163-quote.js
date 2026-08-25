/*
 * Repro for da-163: "typing something in double quotes and the second double
 * quote I have to enter twice to make visible. Doesn't always seem to
 * happen — maybe some sort of timing issue?"
 *
 * A `"` is Shift(held) + Quote: holding Shift pushes the "Misc 2" submenu,
 * Quote fires insertChar('"'). Typed at speed, in the release orders a real
 * typist produces.
 *
 * For each round this records BOTH the INSERT_CHAR commands the keymenu
 * emitted and the actual change in the node's text, so a dropped keystroke
 * (no command) is distinguishable from one that was inserted but never
 * drawn (command fired, text unchanged) — which is what "have to enter it
 * twice to make visible" would look like.
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
  page.on('pageerror', e => console.error('[page error]', e.message));

  await page.goto('http://localhost:4200', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const sel = document.querySelector('select.sample-graph-select');
    if (sel) { sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true})); }
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.__cmds = [];
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    km.keyMenuOut.subscribe(c => { if (c.value !== undefined) window.__cmds.push(c.value); });
  });

  const keys = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-keymenu')).keyAssignments.root);

  await page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const dl = c.drawingLayer, n = dl.getDANodes()[0];
    c.crosshairsLayer.crosshairs.x = n.konvaGroup.x() * dl.scaleX() + dl.x();
    c.crosshairsLayer.crosshairs.y = n.konvaGroup.y() * dl.scaleY() + dl.y();
  });

  await page.keyboard.press(keys.editText);
  await page.waitForTimeout(250);
  await page.keyboard.press('i');
  await page.waitForTimeout(250);
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight'); // caret to end
  await page.waitForTimeout(150);

  const text = () => page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area'))
      .drawingLayer.getDANodes()[0].label.text());
  const drain = () => page.evaluate(() => { const c = window.__cmds; window.__cmds = []; return c; });

  const quote = {
    'tidy':                async gap => {
      await page.keyboard.down('Shift'); if (gap) await page.waitForTimeout(gap);
      await page.keyboard.press('Quote'); if (gap) await page.waitForTimeout(gap);
      await page.keyboard.up('Shift');
    },
    'Shift up before Quote up': async gap => {
      await page.keyboard.down('Shift'); if (gap) await page.waitForTimeout(gap);
      await page.keyboard.down('Quote'); if (gap) await page.waitForTimeout(gap);
      await page.keyboard.up('Shift'); if (gap) await page.waitForTimeout(gap);
      await page.keyboard.up('Quote');
    },
  };

  for (const [name, fn] of Object.entries(quote)) {
    for (const gap of [30, 5, 0]) {
      let notEmitted = 0, notDrawn = 0;
      const rounds = 12;
      for (let r = 0; r < rounds; r++) {
        await drain();
        const before = await text();
        // say"hi" — letters then a quote, twice, typed at speed.
        await page.keyboard.press('KeyH'); if (gap) await page.waitForTimeout(gap);
        await fn(gap);
        await page.keyboard.press('KeyI'); if (gap) await page.waitForTimeout(gap);
        await fn(gap);
        await page.waitForTimeout(150);
        const after = await text();
        const cmds = (await drain()).join('');
        const quotesEmitted = (cmds.match(/"/g) || []).length;
        const quotesDrawn = ((after.slice(0, after.length - before.length)).match(/"/g) || []).length;
        if (quotesEmitted < 2) notEmitted++;
        else if (quotesDrawn < 2) notDrawn++;
        if (quotesEmitted < 2 || quotesDrawn < 2) {
          console.log(`    round ${r}: emitted=${JSON.stringify(cmds)} added=${JSON.stringify(after.slice(0, after.length - before.length))}`);
        }
      }
      check(`${name} @${gap}ms`, notEmitted === 0 && notDrawn === 0,
        `${notEmitted}/${rounds} keystroke never reached the app, ${notDrawn}/${rounds} inserted but not drawn`);
    }
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
