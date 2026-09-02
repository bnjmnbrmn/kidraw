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

try {
  const desktop = await openPage({width: 1440, height: 1000});
  const {page} = desktop;
  assert.equal(await page.title(), 'KiDraw — Connect your thoughts, at the speed you have them');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal((await page.locator('h1').innerText()).replace(/\s+/g, ' '),
    'Connect your thoughts, at the speed you have them.');
  assert.equal(await page.locator('main').count(), 1);
  assert.equal(await page.locator('[data-sequence]').count(), 2);
  assert.equal(await page.locator('#demo').count(), 0);
  assert.equal(await page.locator('.byline a').filter({hasText: 'Benjamin Berman'}).count(), 1);
  assert.equal(await page.locator('footer').getByText('Benjamin Berman', {exact: false}).count(), 1);
  assert.equal(
    await page.locator('footer a').filter({hasText: 'github.com/bnjmnbrmn'}).getAttribute('href'),
    'https://github.com/bnjmnbrmn',
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)),
    'all homepage images load');

  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#main');

  const growth = page.locator('[data-sequence]').first();
  await growth.hover();
  await growth.locator('[data-frame-button]').last().click();
  assert.equal(await growth.locator('[data-frame-button]').last().getAttribute('aria-pressed'), 'true');
  assert.equal(await growth.locator('[data-sequence-number]').textContent(), '3 / 3');
  assert.match(await growth.locator('[data-sequence-caption]').textContent() ?? '', /outline cannot show/);
  assert.equal(await growth.locator('[data-sequence-status]').textContent(), 'Paused');
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const reduced = await openPage({width: 1000, height: 800}, {reducedMotion: 'reduce'});
  const reducedSequence = reduced.page.locator('[data-sequence]').first();
  assert.equal(await reducedSequence.locator('[data-sequence-status]').textContent(), 'Motion paused');
  const reducedNumber = await reducedSequence.locator('[data-sequence-number]').textContent();
  await reduced.page.waitForTimeout(2600);
  assert.equal(await reducedSequence.locator('[data-sequence-number]').textContent(), reducedNumber,
    'reduced-motion preference disables autoplay');
  assert.deepEqual(reduced.errors, []);
  await reduced.context.close();

  const mobile = await openPage({width: 390, height: 844}, {hasTouch: true});
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.equal(await mobile.page.locator('.roadmap').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  await mobile.page.locator('[data-sequence]').first().locator('[data-frame-button]').nth(1).tap();
  assert.equal(await mobile.page.locator('[data-sequence]').first().locator('[data-sequence-number]').textContent(), '2 / 3');
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

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

console.log('site smoke: document, captures, sequences, reduced motion, mobile layout, and review page passed');
