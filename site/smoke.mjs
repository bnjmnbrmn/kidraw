#!/usr/bin/env node
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {dirname, extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {OUTLINE, flatten} from '../tools/capture/outline.mjs';

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

// ---------------------------------------------------------------------------
// The film: one video per branch of the outline, cut from a recording of the
// running app. Consistent speed is the point of it — the reader's scroll used
// to be the clock — so the manifest is checked for real durations rather than
// for a count of screenshots.
const film = JSON.parse(readFileSync(join(dist, 'assets', 'film', 'film.json'), 'utf8'));
const entries = flatten(OUTLINE);
assert.equal(film.acts.length, 4, 'a video for each of the four questions');
assert.equal(film.width, 820);
assert.ok(film.fps >= 20, `filmed at a frame rate that carries a tween (${film.fps}fps)`);

const trails = [];
for (const act of film.acts) {
  const video = join(dist, act.src);
  assert.ok(existsSync(video), `build includes ${act.src}`);
  assert.ok(existsSync(join(dist, act.poster)), `build includes ${act.poster}`);
  assert.ok(statSync(video).size > 200e3, `${act.id} is a real video (${statSync(video).size} bytes)`);
  assert.ok(act.seconds > 20, `${act.id} runs long enough to show something (${act.seconds}s)`);
  assert.ok(act.cues.length >= 1, `${act.id} says where in the tree it is`);
  assert.ok(act.cues[0].t < 1, `${act.id} has a breadcrumb from its first frame`);
  for (let at = 1; at < act.cues.length; at++) {
    assert.ok(act.cues[at].t > act.cues[at - 1].t, `${act.id} cues run forwards`);
    assert.ok(act.cues[at].t < act.seconds, `${act.id} cues land inside the video`);
  }
  for (const cue of act.cues) {
    assert.equal(cue.trail[0], 'KiDraw', 'every breadcrumb starts at the root');
    trails.push(cue.trail.join(' > '));
  }
}
// One breadcrumb per box, and the boxes are the org file's headings and bullets.
assert.equal(new Set(trails).size, entries.length,
  `a breadcrumb for every box in the outline (${new Set(trails).size} of ${entries.length})`);
const filmSeconds = film.acts.reduce((total, act) => total + act.seconds, 0);
assert.ok(filmSeconds > 120 && filmSeconds < 600,
  `the whole film is a sitting rather than an afternoon (${Math.round(filmSeconds)}s)`);

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
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.webm', 'video/webm'],
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
  const body = readFileSync(filePath);
  response.setHeader('Content-Type', contentTypes.get(extname(filePath)) ?? 'application/octet-stream');
  // Video wants ranges; without them Chromium will not seek.
  response.setHeader('Accept-Ranges', 'bytes');
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : body.length - 1;
    response.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${body.length}`,
      'Content-Length': end - start + 1,
    });
    response.end(body.subarray(start, end + 1));
    return;
  }
  response.end(body);
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

/** The breadcrumb over one act's video, as text. */
const crumbsOf = (page, act) => page.evaluate(act =>
  Array.prototype.map.call(
    document.querySelectorAll(`[data-crumbs="${act}"] .crumb`),
    crumb => crumb.textContent), act);

/** Put the playhead somewhere and wait for the seek to land. */
async function seekTo(page, act, seconds) {
  await page.evaluate(([act, seconds]) => new Promise(resolve => {
    const video = document.querySelector(`video[data-act="${act}"]`);
    video.addEventListener('seeked', resolve, {once: true});
    video.currentTime = seconds;
  }), [act, seconds]);
  await page.waitForTimeout(120);
}

/** The words the page is allowed to say: the org file's, and the few links. */
const org = readFileSync(join(here, 'index.org'), 'utf8');
const orgWords = [
  ...[...org.matchAll(/^\*+\s+(.*)$/gm)].map(match => match[1]),
  ...[...org.matchAll(/^-\s+(.*)$/gm)].map(match => match[1]),
].map(line => line.replace(/[=_]([^=_]+)[=_]/g, '$1').trim());
// The page's own words, all of them: three lines of hero and the links. Ben
// asked for these back on 2026-09-06; everything else on the page is org.
const chrome = [
  'KiDraw',
  'A keyboard-first diagram editor',
  'Connect your thoughts, at the speed you have them',
  "A work in progress. I'd love to hear your ideas about how to improve it.",
  'alpha.kidraw.net →',
  'Older captures',
  'index.org',
];

try {
  const desktop = await openPage({width: 1440, height: 1000});
  const {page} = desktop;
  await page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});

  assert.equal(await page.title(), 'KiDraw — Connect your thoughts, at the speed you have them');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('h1').innerText(), 'KiDraw');
  assert.equal(await page.locator('main').count(), 1);
  // The name, then what it is, then what it is for — each a step smaller.
  assert.equal(await page.locator('.hero-subtitle').innerText(), 'A keyboard-first diagram editor');
  assert.equal(await page.locator('.hero-tagline').innerText(),
    'Connect your thoughts, at the speed you have them');
  assert.match(await page.locator('.hero-note').innerText(), /^A work in progress\./);
  const sizes = await page.evaluate(() => ['h1', '.hero-subtitle', '.hero-tagline']
    .map(css => parseFloat(getComputedStyle(document.querySelector(css)).fontSize)));
  assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2], `each line is smaller than the last (${sizes})`);

  // Nothing on the page is written by the page: its words are the org file's
  // headings and bullets, which are all boxes in the diagram now, and the
  // breadcrumbs are those same words again.
  const allowed = new Set([...orgWords, ...chrome]);
  await page.locator('#outline').evaluate(element => { element.open = true; });
  const said = await page.evaluate(() => {
    // The breadcrumb is checked on its own: its steps are laid out in a row,
    // so they would come back run together.
    // The breadcrumb is laid out in a row and the player's clock is a widget,
    // not prose; both are checked on their own terms below.
    const bars = document.querySelectorAll('.crumbs, .film-controls');
    bars.forEach(bar => { bar.style.display = 'none'; });
    const text = document.querySelector('main').innerText;
    bars.forEach(bar => { bar.style.display = ''; });
    return text;
  });
  const lines = said.split('\n').map(line => line.replace(/^[–-]\s*/, '').trim()).filter(Boolean);
  await page.locator('#outline').evaluate(element => { element.open = false; });
  assert.deepEqual(lines.filter(line => !allowed.has(line)), [],
    'every word on the page comes from index.org');
  assert.deepEqual(orgWords.filter(word => !lines.includes(word)), [],
    'and every heading and bullet in index.org is on the page');
  // "diagram", not "graph".
  assert.doesNotMatch(lines.join('\n'), /\bgraphs?\b/i, 'the page talks about diagrams, not graphs');
  assert.equal(await page.locator('footer').getByText('Benjamin Berman', {exact: false}).count(), 1);
  assert.equal(
    await page.locator('footer a').filter({hasText: 'github.com/bnjmnbrmn'}).getAttribute('href'),
    'https://github.com/bnjmnbrmn',
  );
  assert.ok(await page.locator('a[href="https://alpha.kidraw.net"]').count() >= 3,
    'the live alpha stays linked from the header, the hero, and the close');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);

  // One act, one video, one breadcrumb.
  assert.equal(await page.locator('.act').count(), film.acts.length);
  assert.equal(await page.locator('video[data-act]').count(), film.acts.length);
  assert.equal(await page.locator('.crumbs').count(), film.acts.length);
  assert.equal(await page.locator('.act h2:not(.visually-hidden)').count(), 0,
    'the breadcrumb replaced the section headings');
  const players = await page.evaluate(() => Array.prototype.map.call(
    document.querySelectorAll('video[data-act]'), video => ({
      // The player's own controls are drawn over the app's mode chip, so with
      // JavaScript they are replaced by a bar underneath the video.
      controls: video.controls, muted: video.muted, poster: !!video.getAttribute('poster'),
      inline: video.hasAttribute('playsinline'),
      source: video.querySelector('source').getAttribute('type'),
      bar: !!video.closest('.film-frame').nextElementSibling?.classList.contains('film-controls'),
      play: !!video.closest('.film').querySelector('.film-play'),
      seek: !!video.closest('.film').querySelector('input.film-seek'),
    })));
  for (const player of players) {
    assert.deepEqual(player, {
      controls: false, muted: true, poster: true, inline: true, source: 'video/webm',
      bar: true, play: true, seek: true,
    });
  }
  // And the bar is below the picture, which is the whole point of it.
  const under = await page.evaluate(() => {
    const frame = document.querySelector('#what .film-frame').getBoundingClientRect();
    const bar = document.querySelector('#what .film-controls').getBoundingClientRect();
    return bar.top >= frame.bottom - 1;
  });
  assert.ok(under, 'the controls sit under the video, clear of the mode chip');

  // The breadcrumb is the video's clock: seek, and it says where the build has
  // got to.
  const act = film.acts[0];
  assert.deepEqual(await crumbsOf(page, act.id), act.cues[0].trail,
    'the breadcrumb starts at the first box, before a frame has played');
  const late = act.cues[act.cues.length - 1];
  await seekTo(page, act.id, late.t + .3);
  assert.deepEqual(await crumbsOf(page, act.id), late.trail,
    'and follows the playhead to the last one');
  for (const crumb of await crumbsOf(page, act.id)) {
    assert.ok(allowed.has(crumb), `the breadcrumb says only the org file's words (${crumb})`);
  }
  await seekTo(page, act.id, 0);

  // The outline is the content of record, and the diagram was built from it.
  assert.equal(await page.locator('#map-outline li[data-id]').count(), entries.length,
    'the outline carries every box');
  assert.equal(await page.locator('#map-outline .outline-note-item').count(), 6,
    'and the bullets are boxes too');
  assert.equal(await page.locator('#outline').evaluate(element => element.open), false,
    'the outline collapses once the film is available');

  // The video plays itself where it is being looked at, and stops when it is
  // not — nothing else on the page moves.
  await page.locator('#what').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => !document.querySelector('video[data-act="what"]').paused, null, {timeout: 8000});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(
    () => document.querySelector('video[data-act="what"]').paused, null, {timeout: 8000});

  // Elapsed time, so a note about the film can say when.
  await page.waitForFunction(
    () => /^\d+:\d\d/.test(document.querySelector('#what .film-time')?.textContent ?? ''),
    null, {timeout: 8000});
  // And the picture itself starts and stops it, with nothing drawn over it.
  const clicked = await page.evaluate(async () => {
    const video = document.querySelector('video[data-act="what"]');
    video.pause();
    video.click();
    await new Promise(resolve => setTimeout(resolve, 400));
    const playing = !video.paused;
    video.pause();
    return playing;
  });
  assert.ok(clicked, 'clicking the video plays it');
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  // Reduced motion: the film is there, with its controls, and starts nothing
  // by itself.
  const reduced = await openPage({width: 1200, height: 900}, {reducedMotion: 'reduce'});
  await reduced.page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});
  await reduced.page.locator('#what').scrollIntoViewIfNeeded();
  await reduced.page.waitForTimeout(1200);
  assert.equal(
    await reduced.page.evaluate(() => document.querySelector('video[data-act="what"]').paused), true,
    'reduced motion leaves the video for the reader to start');
  assert.deepEqual(await crumbsOf(reduced.page, 'what'), film.acts[0].cues[0].trail);
  assert.deepEqual(reduced.errors, []);
  await reduced.context.close();

  const mobile = await openPage({width: 390, height: 844}, {hasTouch: true});
  await mobile.page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  // Edge to edge: at 820 wide the capture is small enough on a phone that the
  // page's own padding would cost the labels their legibility.
  const width = await mobile.page.locator('.film-frame').first().evaluate(
    element => element.getBoundingClientRect().width / innerWidth);
  assert.ok(width > .98, `the video runs the full width of a phone (${width.toFixed(2)})`);
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  // Without JavaScript the videos and the whole map are still there.
  const plainContext = await browser.newContext({viewport: {width: 1200, height: 900}, javaScriptEnabled: false});
  const still = await plainContext.newPage();
  await still.goto(url, {waitUntil: 'load'});
  assert.equal(await still.locator('#outline').evaluate(element => element.open), true,
    'the outline stays open when there is nothing to play it against');
  assert.ok(await still.locator('#map-outline li').count() >= entries.length,
    'the outline is real markup, not generated');
  assert.equal(await still.locator('video[controls]').count(), film.acts.length,
    'every video can still be played by hand');
  assert.deepEqual(await crumbsOf(still, 'what'), film.acts[0].cues[0].trail,
    'and each one says where it starts');
  assert.equal(await still.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
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

console.log('site smoke: document, four videos, a breadcrumb per box, org words only, ' +
  'play on sight, reduced motion, mobile, no-JS, and review page passed');
