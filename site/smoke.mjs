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
// The two runs are independent, so one can need a layout the other did not and
// end up a frame or two longer. The page pairs frames only where they match and
// falls back to the wide capture otherwise, so this checks the shapes are close
// rather than identical.
let paired = 0;
for (const step of mapM.steps) {
  const wide = map.steps.find(other => other.id === step.id);
  assert.ok(wide, `${step.id} was captured in both shapes`);
  if (wide.frames.length === step.frames.length) paired += 1;
  for (const entry of step.frames) {
    assert.ok(existsSync(join(dist, 'assets', 'map-m', fileOf(entry))), `build includes map-m/${fileOf(entry)}`);
  }
}
assert.ok(paired >= mapM.steps.length - 3,
  `nearly every step lines up between the two shapes (${paired}/${mapM.steps.length})`);

const demo = JSON.parse(readFileSync(join(dist, 'assets', 'demo', 'demo.json'), 'utf8'));
assert.equal(Object.keys(demo.digressions).length, 3, 'the three keymenu digressions were captured');
// The follow run is still captured, though the page shows only the avoid one.
assert.ok(demo.follow.length >= 10, `the follow sequence is long enough to read (${demo.follow.length})`);
assert.ok(demo.avoid.length >= 5, `the avoid sequence is long enough to read (${demo.avoid.length})`);
for (const file of [...demo.follow, ...demo.avoid]) {
  assert.ok(existsSync(join(dist, 'assets', 'demo', file)), `build includes ${file}`);
  assert.ok(existsSync(join(dist, 'assets', 'demo-m', file)), `build includes demo-m/${file}`);
}
for (const file of Object.values(demo.digressions)) {
  assert.ok(existsSync(join(dist, 'assets', 'demo', file)), `build includes ${file}`);
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

/** Put a point inside one panel's window of scrolling on the reading line. */
async function scrollInto(page, act, panel, through) {
  await page.evaluate(([act, panel, through]) => {
    document.documentElement.style.scrollBehavior = 'auto';
    const span = document.querySelector(`#${act}`).querySelectorAll('.act-span')[panel];
    const rect = span.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.top + rect.height * through - innerHeight * 0.5);
  }, [act, panel, through]);
  await page.waitForTimeout(320);
}

/** Which frame of a panel is up, by its index in the run. */
const frameAt = (page, act, panel) => page.evaluate(([act, panel]) => {
  const up = document.querySelector(`#${act}`).querySelectorAll('.panel')[panel].querySelector('.frame.is-on');
  return up ? Number(up.getAttribute('data-frame')) : -1;
}, [act, panel]);

/** How far the reel has been wound, in windows. */
const reelAt = (page, act) => page.evaluate(act => {
  const stage = document.querySelector(`#${act}`);
  const reel = stage.querySelector('[data-reel]');
  const shift = new DOMMatrixReadOnly(getComputedStyle(reel).transform).m42;
  return -shift / stage.querySelector('.stage-box').getBoundingClientRect().height;
}, act);

/** The words the page is allowed to say: the org file's, and the few links. */
const org = readFileSync(join(here, 'index.org'), 'utf8');
const orgWords = [
  ...[...org.matchAll(/^\*+\s+(.*)$/gm)].map(match => match[1]),
  ...[...org.matchAll(/^-\s+(.*)$/gm)].map(match => match[1]),
].map(line => line.replace(/[=_]([^=_]+)[=_]/g, '$1').trim());
const chrome = ['KiDraw', 'alpha.kidraw.net →', 'Older captures', 'index.org'];

try {
  const desktop = await openPage({width: 1440, height: 1000});
  const {page} = desktop;
  await page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});

  assert.equal(await page.title(), 'KiDraw — Connect your thoughts, at the speed you have them');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('h1').innerText(), 'KiDraw');
  assert.equal(await page.locator('main').count(), 1);

  // Nothing on the page is written by the page: its words are the org file's
  // headings, which are the boxes, and its bullets, which are the captions.
  const allowed = new Set([...orgWords, ...chrome]);
  // With the outline open the page shows every heading and every bullet, and
  // still says nothing else.
  await page.locator('#outline').evaluate(element => { element.open = true; });
  const said = (await page.locator('main').innerText())
    .split('\n')
    .map(line => line.replace(/^[–-]\s*/, '').trim())
    .filter(Boolean);
  await page.locator('#outline').evaluate(element => { element.open = false; });
  assert.deepEqual(said.filter(line => !allowed.has(line)), [],
    'every word on the page comes from index.org');
  assert.deepEqual(orgWords.filter(word => !said.includes(word)), [],
    'and every heading and bullet in index.org is on the page');
  // "diagram", not "graph".
  assert.doesNotMatch(said.join('\n'), /\bgraphs?\b/i, 'the page talks about diagrams, not graphs');
  assert.equal(await page.locator('footer').getByText('Benjamin Berman', {exact: false}).count(), 1);
  assert.equal(
    await page.locator('footer a').filter({hasText: 'github.com/bnjmnbrmn'}).getAttribute('href'),
    'https://github.com/bnjmnbrmn',
  );
  assert.ok(await page.locator('a[href="https://alpha.kidraw.net"]').count() >= 3,
    'the live alpha stays linked from the header, the hero, and the close');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);

  // One act per branch, and one spacer per panel: the column of spacers is what
  // gives the act its length and winds its reel.
  assert.equal(await page.locator('.act').count(), 5);
  assert.equal(await page.locator('.panel[data-kind="caption"]').count(), 4,
    'a caption panel for each org node with bullets');
  assert.equal(await page.locator('.panel[data-kind="example"]').count(), 4,
    'three keymenu close-ups and the edge-routing demo');
  assert.equal(
    await page.evaluate(() => Array.prototype.every.call(document.querySelectorAll('.act'), act =>
      act.querySelectorAll('.panel').length === act.querySelectorAll('.act-span').length)),
    true,
    'every panel has a window of scrolling to itself',
  );
  const frames = await page.locator('.frame').count();
  assert.ok(frames > 700, `the whole capture is on the page (${frames} frames)`);

  // The outline is the content of record, and the diagram was built from it.
  assert.equal(await page.locator('#map-outline li[data-id]').count(), 28, 'the outline carries every box');
  assert.equal(await page.locator('#map-outline .outline-note-item').count(), 6, 'and every bullet');
  assert.equal(await page.locator('#outline').evaluate(element => element.open), false,
    'the outline collapses once the frames are available');

  // The scroll is the playback. Standing still leaves the frame where it is;
  // scrolling further runs further through the typing.
  await scrollInto(page, 'what', 0, .2);
  const parked = await frameAt(page, 'what', 0);
  assert.ok(parked > 0, 'the run has started');
  await page.waitForTimeout(900);
  assert.equal(await frameAt(page, 'what', 0), parked, 'frames do not advance on their own');
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(200);
  const nudged = await frameAt(page, 'what', 0);
  assert.ok(nudged > parked, `a small scroll advances the run (${parked} to ${nudged})`);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(200);
  const flicked = await frameAt(page, 'what', 0);
  assert.ok(flicked - nudged > nudged - parked,
    `a longer scroll advances it further (${parked}, ${nudged}, ${flicked})`);
  await page.evaluate(() => window.scrollBy(0, -600));
  await page.waitForTimeout(200);
  assert.ok(await frameAt(page, 'what', 0) < flicked, 'scrolling back winds it back');

  // At the end of a panel's window the build sequence is wound out of the way
  // and the caption has the window to itself.
  await scrollInto(page, 'what', 0, .5);
  assert.ok(Math.abs(await reelAt(page, 'what')) < .02, 'the frames hold the window while they run');
  await scrollInto(page, 'what', 0, .999);
  const wound = await reelAt(page, 'what');
  assert.ok(Math.abs(wound - 1) < .05, `the caption has taken the window (${wound.toFixed(2)})`);
  const caption = await page.locator('#what .panel[data-kind="caption"]').boundingBox();
  const box = await page.locator('#what .stage-box').boundingBox();
  assert.ok(Math.abs(caption.y - box.y) < 6 && caption.height > box.height - 6,
    'the caption is where the frames were, at the same size');

  // Frames are lazy; ask for them all, then insist every one arrives.
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => {
    image.loading = 'eager';
  }));
  await page.waitForFunction(
    () => Array.prototype.every.call(document.images, image => image.complete && image.naturalWidth > 0),
    null,
    {timeout: 60000},
  );
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  // Reduced motion changes nothing here: the reader's scroll is the only thing
  // that moves a frame either way.
  const reduced = await openPage({width: 1200, height: 900}, {reducedMotion: 'reduce'});
  await reduced.page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});
  await scrollInto(reduced.page, 'what', 0, .3);
  assert.ok(await frameAt(reduced.page, 'what', 0) > 0, 'reduced motion still steps through the build');
  assert.deepEqual(reduced.errors, []);
  await reduced.context.close();

  const mobile = await openPage({width: 390, height: 844}, {hasTouch: true});
  await mobile.page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.equal(
    await mobile.page.locator('.act-stage').first().evaluate(element => getComputedStyle(element).position),
    'sticky',
    'the window stays in view while the spacers scroll under it',
  );
  // The app fills the top two thirds of a phone screen.
  const share = await mobile.page.locator('.stage-box').first().evaluate(
    element => element.getBoundingClientRect().height / innerHeight);
  assert.ok(share > 0.6 && share < 0.72, `the window is about two thirds of the screen (${share.toFixed(2)})`);
  assert.equal(
    await mobile.page.locator('.frame').first().evaluate(
      picture => picture.querySelector('img').currentSrc.includes('/map-m/')),
    true,
    'a phone is served the portrait capture',
  );
  // A keymenu close-up is a wide strip: on a phone it is drawn bigger than the
  // window and starts in the middle of the picture rather than fitted to width.
  const panned = await mobile.page.locator('#how .panel[data-wide]').first().evaluate(panel => ({
    over: panel.scrollWidth / panel.clientWidth,
    left: panel.scrollLeft,
  }));
  assert.ok(panned.over > 1.4, `the strip is drawn larger than the window (${panned.over.toFixed(2)}x)`);
  assert.ok(panned.left > 0, 'and starts centred on the picture');
  await scrollInto(mobile.page, 'how', 0, .4);
  assert.equal(await mobile.page.locator('#how .panel').first().locator('.frame.is-on').count(), 1);
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  // Without JavaScript the first frame of each act and the whole map are still
  // there.
  const plainContext = await browser.newContext({viewport: {width: 1200, height: 900}, javaScriptEnabled: false});
  const plain = await plainContext.newPage();
  await plain.goto(url, {waitUntil: 'load'});
  assert.equal(await plain.locator('#outline').evaluate(element => element.open), true,
    'the outline stays open when the frames cannot be stepped');
  assert.ok(await plain.locator('#map-outline li').count() >= 28, 'the outline is real markup, not generated');
  assert.equal(await plain.locator('.frame.is-on').count(), 5, 'the first frame of each act is up');
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

console.log('site smoke: document, captured frames, org words only, five reels, ' +
  'scroll-driven playback, the handover, reduced motion, mobile, no-JS, and review page passed');
