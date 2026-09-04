#!/usr/bin/env node
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
execFileSync(process.execPath, [join(here, 'build.mjs')], {stdio: 'inherit'});

const generated = readFileSync(join(dist, 'index.html'), 'utf8');
const head = generated.match(/<head>([\s\S]*?)<\/head>/i)?.[1];
const body = generated.match(/<body>([\s\S]*?)<\/body>/i)?.[1];
assert.ok(generated.startsWith('<!doctype html>'), 'generated page starts with a doctype');
assert.ok(head, 'generated page has a head');
assert.ok(body, 'generated page has a body');
assert.match(head, /<title>KiDraw — Connect your thoughts, at the speed you have them<\/title>/);
assert.match(head, /<meta name="author" content="Benjamin Berman">/);
assert.match(head, /<link rel="canonical" href="https:\/\/kidraw\.net\/">/);
assert.match(head, /<link rel="stylesheet"/);
assert.doesNotMatch(body, /<title>|<link rel="stylesheet"|<style>/);
assert.doesNotMatch(generated, /site-head:(?:start|end)/);

// Every frame on the page is a capture of the running app.
const map = JSON.parse(readFileSync(join(dist, 'assets', 'map', 'map.json'), 'utf8'));
assert.equal(map.steps.length, 28, 'a frame sequence per box');
assert.ok(map.frames > 28 * 6, `each box is captured as a short animation (${map.frames} frames)`);
// A manifest entry is {file, ms}: the frame, and how long it stays on screen.
const fileOf = entry => (typeof entry === 'string' ? entry : entry.file);
for (const step of map.steps) {
  assert.ok(step.frames.length >= 4, `${step.id} is animated (${step.frames.length} frames)`);
  for (const entry of step.frames) {
    assert.ok(existsSync(join(dist, 'assets', 'map', fileOf(entry))), `build includes ${fileOf(entry)}`);
  }
  const typing = step.frames.filter(entry => /-(blank|typing|typed)\.webp$/.test(fileOf(entry)));
  const spent = typing.reduce((total, entry) => total + (entry.ms ?? 0), 0);
  assert.ok(spent > 300, `${step.id} spends a human amount of time typing its label (${spent}ms)`);
}
for (const extra of map.extras) {
  assert.ok(existsSync(join(dist, 'assets', 'map', extra.file)), `build includes ${extra.file}`);
}
// The portrait set: same runs, a different shape, so a phone gets frames that
// fill the top of the screen instead of a letterboxed strip.
const mapM = JSON.parse(readFileSync(join(dist, 'assets', 'map-m', 'map.json'), 'utf8'));
assert.equal(mapM.steps.length, map.steps.length, 'the portrait capture covers the same boxes');
assert.ok(mapM.viewport.height / mapM.viewport.width > 1.3,
  `the portrait capture is actually portrait (${mapM.viewport.width}x${mapM.viewport.height})`);
for (const step of mapM.steps) {
  assert.equal(step.frames.length, map.steps.find(other => other.id === step.id).frames.length,
    `${step.id} has the same run in both shapes`);
  for (const entry of step.frames) {
    assert.ok(existsSync(join(dist, 'assets', 'map-m', fileOf(entry))), `build includes map-m/${fileOf(entry)}`);
  }
}

const demo = JSON.parse(readFileSync(join(dist, 'assets', 'demo', 'demo.json'), 'utf8'));
assert.equal(demo.menu.length, 3, 'the keymenu break has its three frames');
assert.ok(demo.follow.length >= 10, `the follow sequence is long enough to read (${demo.follow.length})`);
assert.ok(demo.avoid.length >= 5, `the avoid sequence is long enough to read (${demo.avoid.length})`);
for (const file of [...demo.menu, ...demo.follow, ...demo.avoid]) {
  assert.ok(existsSync(join(dist, 'assets', 'demo', file)), `build includes ${file}`);
  assert.ok(existsSync(join(dist, 'assets', 'demo-m', file)), `build includes demo-m/${file}`);
}

// The older capture set still backs the review page.
const reviewCaptures = [
  'fix-release-zoom.png', 'ghost-after.png', 'ghost-before.png', 'grow-0.png', 'grow-1.png',
  'grow-2.png', 'menu-held-drag.png', 'menu-held.png', 'menu-root.png', 'reroute-0.png',
  'reroute-1.png', 'reroute-2.png', 'reroute-final.png', 'reroute-relaid.png',
];
for (const capture of reviewCaptures) {
  assert.ok(existsSync(join(dist, 'assets', 'captures', capture)), `build includes ${capture}`);
}
assert.ok(existsSync(join(dist, 'review', 'index.html')), 'build includes the capture review');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.json', 'application/json'],
]);
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const relative = pathname === '/'
    ? 'index.html'
    : pathname === '/review/'
      ? 'review/index.html'
      : normalize(pathname).replace(/^\/+/, '');
  const filePath = join(dist, relative);
  if (!filePath.startsWith(`${dist}/`) || !existsSync(filePath)) {
    response.writeHead(404).end('not found');
    return;
  }
  response.setHeader('Content-Type', contentTypes.get(extname(filePath)) ?? 'application/octet-stream');
  response.end(readFileSync(filePath));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/`;

const launchOptions = process.env.CHROME_BIN
  ? {headless: true, executablePath: process.env.CHROME_BIN}
  : {headless: true};
const browser = await chromium.launch(launchOptions);

async function openPage(viewport, options = {}) {
  const context = await browser.newContext({viewport, ...options});
  // The page has system-font fallbacks, so CI need not reach Google Fonts.
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'text/css', body: '',
  }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url, {waitUntil: 'load'});
  return {context, page, errors};
}

/** Put a step (or any element) on the reading line. */
async function scrollTo(page, pick) {
  await page.evaluate(spec => {
    document.documentElement.style.scrollBehavior = 'auto';
    const element = spec.act === undefined
      ? document.querySelectorAll(spec.selector)[spec.index]
      : document.querySelectorAll('.act')[spec.act].querySelectorAll('.step')[spec.index];
    window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - innerHeight * 0.45);
  }, pick);
  await page.waitForTimeout(340);
}
const readTo = (page, act, index) => scrollTo(page, {act, index});


try {
  const desktop = await openPage({width: 1440, height: 1000});
  const {page} = desktop;
  await page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});

  assert.equal(await page.title(), 'KiDraw — Connect your thoughts, at the speed you have them');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal((await page.locator('h1').innerText()).replace(/\s+/g, ' '),
    'Connect your thoughts, at the speed you have them.');
  assert.equal(await page.locator('main').count(), 1);
  assert.equal(await page.locator('.byline a').filter({hasText: 'Benjamin Berman'}).count(), 1);
  assert.equal(await page.locator('footer').getByText('Benjamin Berman', {exact: false}).count(), 1);
  assert.equal(
    await page.locator('footer a').filter({hasText: 'github.com/bnjmnbrmn'}).getAttribute('href'),
    'https://github.com/bnjmnbrmn',
  );
  assert.ok(await page.locator('a[href="https://alpha.kidraw.net"]').count() >= 3,
    'the live alpha stays linked from the header, the hero, and the close');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);

  // One act per branch, one step per box, one frame per step.
  assert.equal(await page.locator('.act').count(), 5);
  // The section title travels with the frames, since the real heading scrolls
  // away as soon as the stage sticks.
  assert.equal(await page.locator('.act').nth(1).locator('.stage-head').count(), 1);
  assert.match(await page.locator('.act').nth(1).locator('.stage-head').innerText(), /What is it\?/);
  const steps = await page.locator('.act .step').count();
  const frames = await page.locator('.act .frame').count();
  assert.ok(steps >= 28, `a step per node (${steps})`);
  assert.ok(frames > steps * 3, `each step carries a run of frames (${frames} for ${steps} steps)`);
  assert.equal(
    await page.locator('.act').first().evaluate(act => {
      const seen = new Set();
      act.querySelectorAll('.frame').forEach(frame => seen.add(frame.getAttribute('data-step')));
      return seen.size;
    }),
    await page.locator('.act').first().locator('.step').count(),
    'every step in an act has frames of its own',
  );

  // The frames are the argument, so they take about two thirds of the width.
  const columns = await page.locator('.act-inner').first().evaluate(
    element => getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat));
  assert.equal(columns.length, 2);
  assert.ok(columns[1] / (columns[0] + columns[1]) > 0.6,
    `the stage column is about two thirds (${(columns[1] / (columns[0] + columns[1])).toFixed(2)})`);

  // The outline is the content of record, and the graph was built from it.
  assert.equal(await page.locator('#map-outline li[data-id]').count(), 28,
    'the outline carries every box');
  assert.equal(await page.locator('#map-outline .outline-note-item').count(), 6,
    'the org bullets are kept as notes, not turned into boxes');
  assert.equal(await page.locator('#outline').evaluate(element => element.open), false,
    'the outline collapses once the frames are available');

  // Scrolling advances the frame beside the prose.
  const whatStage = page.locator('.act').nth(1).locator('.stage');
  await readTo(page, 1, 0);
  assert.match(await whatStage.locator('[data-stage-count]').textContent() ?? '', /^1 \/ \d+$/);
  const openingCaption = await whatStage.locator('[data-stage-caption]').textContent();
  assert.equal(await whatStage.locator('.frame.is-on').getAttribute('data-step'), '0');

  // Step 2 rather than the last one: the closing overview is a single frame and
  // would settle instantly.
  await readTo(page, 1, 2);
  assert.match(await whatStage.locator('[data-stage-count]').textContent() ?? '', /^3 \/ \d+$/);
  assert.notEqual(await whatStage.locator('[data-stage-caption]').textContent(), openingCaption);
  assert.equal(await whatStage.locator('.frame.is-on').count(), 1, 'exactly one frame is shown');
  assert.equal(await whatStage.locator('.frame.is-on').getAttribute('data-step'), '2');
  // The run plays at a human pace and settles on its last frame. Frames carry
  // their own duration — roughly as long as the keys they stand for would take
  // to press — so this waits rather than assuming a fixed frame rate.
  const startedPlaying = Date.now();
  await page.waitForFunction(() => {
    const run = document.querySelectorAll('.act')[1].querySelectorAll('[data-step="2"]');
    return run[run.length - 1].classList.contains('is-on');
  }, null, {timeout: 20000});
  const played = Date.now() - startedPlaying;
  assert.ok(played > 600, `the run is paced for a reader rather than flashed past (${played}ms)`);
  assert.equal(await whatStage.locator('.frame.is-on').getAttribute('data-step'), '2');
  assert.ok(
    await page.locator('.act').nth(1).locator('[data-step="2"]').evaluateAll(
      frames => frames.every(frame => Number(frame.getAttribute('data-ms')) >= 0)),
    'every frame declares how long it stays up',
  );

  // Both drag sequences scrub the same way.
  assert.equal(await page.locator('[data-scrub]').count(), 2, 'a follow demo and an avoid demo');
  await scrollTo(page, {selector: '#reroute [data-scrub-step]', index: 0});
  assert.equal(await page.locator('#reroute [data-scrub-frame].is-on').getAttribute('data-scrub-frame'), '0');
  await scrollTo(page, {selector: '#reroute [data-scrub-step]', index: 5});
  assert.equal(await page.locator('#reroute [data-scrub-frame].is-on').getAttribute('data-scrub-frame'), '5');
  await scrollTo(page, {selector: '#avoid [data-scrub-step]', index: 4});
  assert.equal(await page.locator('#avoid [data-scrub-frame].is-on').getAttribute('data-scrub-frame'), '4');
  assert.equal(await page.locator('#avoid [data-scrub-frame].is-on').count(), 1);

  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#main');

  // Frames are lazy; ask for them all, then insist every one arrives.
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => {
    image.loading = 'eager';
  }));
  await page.waitForFunction(
    () => Array.prototype.every.call(document.images, image => image.complete && image.naturalWidth > 0),
    null,
    {timeout: 30000},
  );
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const reduced = await openPage({width: 1200, height: 900}, {reducedMotion: 'reduce'});
  await reduced.page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});
  assert.equal(
    await reduced.page.locator('.frame').first().evaluate(element => getComputedStyle(element).transitionDuration),
    '0s',
    'reduced motion stops the frames cross-fading',
  );
  await readTo(reduced.page, 1, 3);
  const reducedFrame = reduced.page.locator('.act').nth(1).locator('.frame.is-on');
  assert.equal(await reducedFrame.getAttribute('data-step'), '3', 'reduced motion still steps through the build');
  assert.equal(
    await reducedFrame.evaluate(frame => {
      const run = frame.closest('.stage-frame').querySelectorAll('[data-step="3"]');
      return run[run.length - 1] === frame;
    }),
    true,
    'reduced motion goes straight to the settled frame',
  );
  assert.deepEqual(reduced.errors, []);
  await reduced.context.close();

  const mobile = await openPage({width: 390, height: 844}, {hasTouch: true});
  await mobile.page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.equal(
    await mobile.page.locator('.act-stage').first().evaluate(element => getComputedStyle(element).position),
    'sticky',
    'the frame stays in view while the text scrolls under it',
  );
  // The app fills the top two thirds of a phone screen.
  const share = await mobile.page.locator('.stage-frame').first().evaluate(
    element => element.getBoundingClientRect().height / innerHeight);
  assert.ok(share > 0.6 && share < 0.72, `the frame is about two thirds of the screen (${share.toFixed(2)})`);
  assert.equal(
    await mobile.page.locator('.frame').first().evaluate(
      picture => picture.querySelector('img').currentSrc.includes('/map-m/')),
    true,
    'a phone is served the portrait capture',
  );
  await readTo(mobile.page, 3, 3);
  assert.equal(await mobile.page.locator('.act').nth(3).locator('.frame.is-on').count(), 1);
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  // Without JavaScript the argument and the whole map are still readable.
  const plainContext = await browser.newContext({viewport: {width: 1200, height: 900}, javaScriptEnabled: false});
  const plain = await plainContext.newPage();
  await plain.goto(url, {waitUntil: 'load'});
  assert.equal(await plain.locator('#outline').evaluate(element => element.open), true,
    'the outline stays open when the frames cannot be stepped');
  assert.ok(await plain.locator('#map-outline li').count() >= 28, 'the outline is real markup, not generated');
  assert.equal(await plain.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await plainContext.close();

  const reviewContext = await browser.newContext({viewport: {width: 1200, height: 900}});
  const review = await reviewContext.newPage();
  await review.goto(`${url}review/`, {waitUntil: 'load'});
  assert.equal(await review.locator('h1').textContent(), 'KiDraw homepage capture review');
  assert.equal(await review.locator('figure img').count(), 14);
  assert.equal(await review.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await reviewContext.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('site smoke: document, captured frames, outline, five scroll-stepped acts, the drag, reduced motion, mobile, no-JS, and review page passed');
