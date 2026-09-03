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
assert.doesNotMatch(body, /playable demo|id="demo"|id="scene"/i);

const expectedCaptures = [
  'fix-release-zoom.png',
  'ghost-after.png',
  'ghost-before.png',
  'grow-0.png',
  'grow-1.png',
  'grow-2.png',
  'menu-held-drag.png',
  'menu-held.png',
  'menu-root.png',
  'reroute-0.png',
  'reroute-1.png',
  'reroute-2.png',
  'reroute-final.png',
  'reroute-relaid.png',
];
for (const capture of expectedCaptures) {
  assert.ok(existsSync(join(dist, 'assets', 'captures', capture)), `build includes ${capture}`);
  assert.ok(generated.includes(`assets/captures/${capture}`), `homepage shows ${capture}`);
}
assert.ok(existsSync(join(dist, 'review', 'index.html')), 'build includes the capture review');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.png', 'image/png'],
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
    status: 200,
    contentType: 'text/css',
    body: '',
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

// Put the nth step on the reading line and let the camera settle.
async function readStep(page, index) {
  await page.evaluate(n => {
    document.documentElement.style.scrollBehavior = 'auto';
    const step = document.querySelectorAll('.step')[n];
    window.scrollTo(0, window.scrollY + step.getBoundingClientRect().top - innerHeight * 0.5);
  }, index);
  await page.waitForTimeout(400);
}

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

  // The outline is the page's content of record: the diagram is drawn from it.
  const outlineItems = await page.locator('#map-outline li').count();
  assert.ok(outlineItems > 80, `the outline carries the whole map (${outlineItems} items)`);
  assert.equal(await page.locator('#map-outline li[data-num]').count(), 21,
    'numbered list items keep their edge labels');
  assert.equal(await page.locator('#map-outline li[data-link]').count(), 3,
    'the three cross-branch links survive');
  assert.equal(await page.locator('#outline').evaluate(element => element.open), false,
    'the outline collapses once the diagram is drawn');

  // One sticky stage per act, each drawn from that same outline.
  const acts = await page.locator('.act').count();
  assert.equal(acts, 5);
  assert.equal(await page.locator('[data-graph]').count(), acts);
  assert.ok(await page.locator('[data-graph] .g-node').count() > 100, 'every stage draws its nodes');
  assert.ok(await page.locator('[data-graph] .g-label').count() > 0, 'numbered edges are labelled');
  assert.ok(await page.locator('[data-graph] .g-edge.is-link').count() > 0, 'cross-branch links are drawn');

  const firstStage = page.locator('.stage').first();
  await readStep(page, 0);
  assert.equal(await firstStage.locator('[data-stage-count]').textContent(), '1 / 5');
  const openingNodes = await firstStage.locator('.g-node.is-on').count();
  const openingCaption = await firstStage.locator('[data-stage-caption]').textContent();

  await readStep(page, 2);
  assert.equal(await firstStage.locator('[data-stage-count]').textContent(), '3 / 5');
  assert.notEqual(await firstStage.locator('[data-stage-caption]').textContent(), openingCaption);
  assert.ok(await firstStage.locator('.g-node.is-on').count() > openingNodes,
    'scrolling reveals more of the diagram');
  assert.equal(await page.locator('.step.is-active').count(), acts);

  // The camera moved rather than the page reflowing.
  const camera = await firstStage.locator('.cam').evaluate(element => element.style.transform);
  assert.match(camera, /^translate\(.*\) scale\(/);

  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#main');

  // Captures are lazy; ask for them all, then insist every one of them arrives.
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => {
    image.loading = 'eager';
  }));
  await page.waitForFunction(
    () => Array.prototype.every.call(document.images, image => image.complete && image.naturalWidth > 0),
    null,
    {timeout: 15000},
  );
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const reduced = await openPage({width: 1200, height: 900}, {reducedMotion: 'reduce'});
  await reduced.page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});
  assert.equal(
    await reduced.page.locator('.cam').first().evaluate(element => getComputedStyle(element).transitionDuration),
    '0s',
    'reduced motion stops the camera from animating',
  );
  await readStep(reduced.page, 2);
  assert.ok(await reduced.page.locator('.stage').first().locator('.g-node.is-on').count() > 0,
    'reduced motion still builds the diagram');
  assert.deepEqual(reduced.errors, []);
  await reduced.context.close();

  const mobile = await openPage({width: 390, height: 844}, {hasTouch: true});
  await mobile.page.waitForFunction(() => document.documentElement.classList.contains('js'), null, {timeout: 5000});
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.equal(
    await mobile.page.locator('.act-stage').first().evaluate(element => getComputedStyle(element).position),
    'sticky',
    'the diagram stays in view while the text scrolls under it',
  );
  await readStep(mobile.page, 10);
  assert.ok(await mobile.page.locator('.stage').nth(2).locator('.g-node.is-on').count() > 0,
    'the third act draws on a phone too');
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  // Without JavaScript the argument and the whole map are still readable.
  const plainContext = await browser.newContext({viewport: {width: 1200, height: 900}, javaScriptEnabled: false});
  const plain = await plainContext.newPage();
  await plain.goto(url, {waitUntil: 'load'});
  assert.equal(await plain.locator('#outline').evaluate(element => element.open), true,
    'the outline stays open when the diagram cannot be drawn');
  assert.ok(await plain.locator('#map-outline li').count() > 80, 'the outline is real markup, not generated');
  assert.equal(await plain.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await plainContext.close();

  const reviewContext = await browser.newContext({viewport: {width: 1200, height: 900}});
  const review = await reviewContext.newPage();
  await review.goto(`${url}review/`, {waitUntil: 'load'});
  assert.equal(await review.locator('h1').textContent(), 'KiDraw homepage capture review');
  assert.equal(await review.locator('figure img').count(), 14);
  assert.ok(await review.locator('figure img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)),
    'all review images load');
  assert.equal(await review.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await reviewContext.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('site smoke: document, captures, outline, five scroll-drawn stages, reduced motion, mobile, no-JS, and review page passed');
