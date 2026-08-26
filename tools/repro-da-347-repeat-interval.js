/*
 * Repro for da-347: "Key repeat interval setting doesn't seem to be working."
 *
 * Holds a movement key and times the gaps between the repeats the drawing
 * area actually receives, before and after changing "Repeat interval (ms)"
 * in Settings. The measured gap should track the setting.
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
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.__t = [];
    const km = window.ng.getComponent(document.querySelector('app-keymenu'));
    km.keyMenuOut.subscribe(c => {
      if (typeof c.kind === 'string' && c.kind.startsWith('MOVE_CROSSHAIRS_')) {
        window.__t.push(performance.now());
      }
    });
  });

  const keys = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-keymenu')).keyAssignments.movement);

  const settings = () => page.evaluate(() => {
    const c = window.ng.getComponent(document.querySelector('app-header')).config.cursor;
    return {delay: c.initialRepeatDelayMs, interval: c.repeatIntervalMs};
  });

  /** Hold the key for `ms`, return the observed gaps between repeats. */
  const measure = async ms => {
    await page.evaluate(() => { window.__t = []; });
    await page.keyboard.down(keys.left);
    await page.waitForTimeout(ms);
    await page.keyboard.up(keys.left);
    await page.waitForTimeout(200);
    const t = await page.evaluate(() => window.__t);
    const gaps = [];
    for (let i = 1; i < t.length; i++) gaps.push(Math.round(t[i] - t[i - 1]));
    // The first gap is the initial delay; the rest are the interval.
    return {count: t.length, initial: gaps[0], intervals: gaps.slice(1)};
  };

  const median = xs => {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  // Locate the "Repeat interval (ms)" number input by its label text.
  const intervalIndex = () => page.evaluate(() => {
    const inputs = [...document.querySelectorAll('app-header input[type="number"]')];
    return inputs.findIndex(i =>
      /repeat interval/i.test(i.closest('label')?.textContent ?? ''));
  });

  // Drive the real Settings input and dispatch a real 'input' event, so the
  // change runs through the component's handler inside Angular's zone
  // exactly as a user's would (see the note on repro-compact-viewport.js).
  // The panel must be open first or the input is not interactable.
  const setInterval_ = async value => {
    const idx = await intervalIndex();
    await page.evaluate(([idx, value]) => {
      const d = document.querySelector('app-header details.settings-dropdown');
      if (d) d.open = true;
      const input = [...document.querySelectorAll('app-header input[type="number"]')][idx];
      input.value = String(value);
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }, [idx, value]);
    await page.waitForTimeout(400);
  };

  console.log('settings before:', JSON.stringify(await settings()));
  const idx = await intervalIndex();
  check('the Repeat interval input exists', idx >= 0, `index ${idx}`);

  const base = await measure(1600);
  console.log(`  default: ${base.count} moves, initial ${base.initial}ms, ` +
              `intervals ${JSON.stringify(base.intervals)}`);
  const baseMedian = median(base.intervals);
  const configured = (await settings()).interval;
  check('the default repeat matches the configured interval',
    Math.abs(baseMedian - configured) <= Math.max(40, configured * 0.5),
    `measured ~${baseMedian}ms vs setting ${configured}ms`);

  // Now make it dramatically slower and re-measure.
  await setInterval_(400);
  console.log('settings after:', JSON.stringify(await settings()));
  check('the setting actually changed', (await settings()).interval === 400,
    String((await settings()).interval));

  const slow = await measure(2600);
  console.log(`  at 400ms: ${slow.count} moves, initial ${slow.initial}ms, ` +
              `intervals ${JSON.stringify(slow.intervals)}`);
  const slowMedian = median(slow.intervals);
  check('a changed Repeat interval takes effect on the next hold',
    Math.abs(slowMedian - 400) <= 150, `measured ~${slowMedian}ms, expected ~400ms`);

  check('the repeat got measurably slower', slowMedian > baseMedian + 80,
    `${baseMedian}ms -> ${slowMedian}ms`);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
