/*
 * Shared plumbing for the browser tests.
 *
 * Every script grew its own copy of the same four things: launch a browser,
 * open the app, a check() that prints PASS/FAIL, and a pile of
 * `waitForTimeout(200)` calls standing in for "the app has probably finished
 * reacting by now". This module owns all four.
 *
 * The waits are the interesting part. A fixed sleep is wrong twice over: it is
 * too long on a quiet machine (the region spent 16s of its 46s asleep) and too
 * short on a loaded one, which is how a test starts failing for reasons that
 * have nothing to do with the code. `settled()` and friends watch the app's own
 * state instead and return the moment it stops moving.
 *
 * Sleeps that remain in a script should be the ones *testing* time-based
 * behavior — a key-repeat cadence, a fade timeout, a reveal delay. Those are
 * the subject of the test, not a guess about scheduling.
 */
const { chromium } = require('@playwright/test');

/** Where the app is. Set KIDRAW_QA_URL to drive a server other than the local one. */
const APP_URL = process.env.KIDRAW_QA_URL || 'http://localhost:4200';

/**
 * Chrome's default multi-process layout costs about 1.1GB per script on this
 * hardware, which is why the runner is stuck at concurrency 1. These flags cut
 * that by roughly 15%; on a larger box they raise the concurrency ceiling
 * rather than lower the floor.
 */
const LOW_MEMORY_ARGS = [
  '--renderer-process-limit=1',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--no-sandbox',
  '--js-flags=--max-old-space-size=384',
];

async function launch(options = {}) {
  return chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
    args: LOW_MEMORY_ARGS,
    ...options,
  });
}

/** Open the app and wait for the canvas to exist. */
async function openApp(browser, {width = 1400, height = 900} = {}) {
  const page = await (await browser.newContext({viewport: {width, height}})).newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));
  await page.goto(APP_URL, {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForSelector('#mainDrawingArea canvas', {timeout: 15000});
  await settled(page);
  return page;
}

/** The drawing area component, as the tests reach it. */
const DA = "window.ng.getComponent(document.querySelector('app-drawing-area'))";

/**
 * Wait until the app stops moving: the crosshairs and the stage transform read
 * the same on three consecutive polls, ~25ms apart, so roughly 50ms of
 * stillness.
 *
 * Deliberately not `tweens.length === 0`: the drawing area pushes tweens onto
 * that array and only empties it in finishTweens(), so finished animations stay
 * in it and the count never returns to zero. Watching the values the animation
 * actually moves is both correct and independent of that bookkeeping.
 */
function settled(page, {timeout = 8000, stableReads = 3} = {}) {
  return page.waitForFunction(`(() => {
    const da = ${DA};
    if (!da) return false;
    const key = [
      da.crosshairsLayer?.crosshairsX?.(), da.crosshairsLayer?.crosshairsY?.(),
      da.drawingLayer?.x?.(), da.drawingLayer?.y?.(), da.drawingLayer?.scaleX?.(),
    ].join(',');
    window.__qaSettleRuns = (window.__qaSettleKey === key) ? (window.__qaSettleRuns || 0) + 1 : 0;
    window.__qaSettleKey = key;
    return window.__qaSettleRuns >= ${stableReads};
  })()`, undefined, {timeout, polling: 25});
}

/** Where the crosshairs are right now. */
function crosshairsOf(page) {
  return page.evaluate(`(() => { const da = ${DA}; return {x: da.crosshairsLayer.crosshairsX(), y: da.crosshairsLayer.crosshairsY()}; })()`);
}

/**
 * Wait until the crosshairs have moved away from `before` *and* come to rest.
 *
 * `settled()` alone is not enough after a keypress: it can return in the gap
 * between the key going down and the app reacting, when nothing has moved yet
 * and everything therefore looks still. That reads as a press that did not
 * register, and it is intermittent, which is the worst kind of test failure.
 * Waiting for the change first removes the race.
 *
 * A press that legitimately moves nothing will time out here rather than pass
 * quietly — use settled() for those.
 */
function movedAndSettled(page, before, {timeout = 8000, stableReads = 2} = {}) {
  return page.waitForFunction(`(() => {
    const da = ${DA};
    if (!da) return false;
    const x = da.crosshairsLayer.crosshairsX(), y = da.crosshairsLayer.crosshairsY();
    if (x === ${before.x} && y === ${before.y}) return false;
    const key = x + ',' + y;
    window.__qaMoveRuns = (window.__qaMoveKey === key) ? (window.__qaMoveRuns || 0) + 1 : 0;
    window.__qaMoveKey = key;
    return window.__qaMoveRuns >= ${stableReads};
  })()`, undefined, {timeout, polling: 20});
}

/**
 * Let the browser process a dispatched event and paint once. Two frames,
 * because the handler runs in the first and its render lands in the second.
 *
 * Use this before settled() for an action that may legitimately change
 * nothing — a press that selects rather than moves, say. settled() alone can
 * return in the gap before the app reacts, and movedAndSettled() would time
 * out waiting for a movement that was never going to happen.
 */
function afterFrame(page) {
  return page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Wait for the held-key navigation overlay to appear or disappear. */
function overlay(page, visible, {timeout = 5000} = {}) {
  return page.waitForFunction(
    `(() => { const da = ${DA}; return !!da && da.navGrid.nodeGridVisible === ${visible ? 'true' : 'false'}; })()`,
    undefined, {timeout, polling: 16});
}

/** Wait for an arbitrary expression against the drawing area to become true. */
function waitForDA(page, expression, {timeout = 5000} = {}) {
  return page.waitForFunction(`(() => { const da = ${DA}; return !!da && (${expression}); })()`,
    undefined, {timeout, polling: 16});
}

/** A PASS/FAIL line the runner counts, and a failure tally for the exit code. */
function checker() {
  const state = {failures: 0};
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) state.failures++;
  };
  check.exit = async (browser) => {
    if (browser) await browser.close();
    process.exit(state.failures === 0 ? 0 : 1);
  };
  Object.defineProperty(check, 'failures', {get: () => state.failures});
  return check;
}

module.exports = {APP_URL, LOW_MEMORY_ARGS, launch, openApp, settled, movedAndSettled, crosshairsOf,
  afterFrame, overlay, waitForDA, checker, DA};
