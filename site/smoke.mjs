#!/usr/bin/env node
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath, [join(here, 'build.mjs')], {stdio: 'inherit'});

const generated = readFileSync(join(here, 'dist', 'index.html'), 'utf8');
const head = generated.match(/<head>([\s\S]*?)<\/head>/i)?.[1];
const body = generated.match(/<body>([\s\S]*?)<\/body>/i)?.[1];
assert.ok(generated.startsWith('<!doctype html>'), 'generated page starts with a doctype');
assert.ok(head, 'generated page has a head');
assert.ok(body, 'generated page has a body');
assert.match(head, /<title>KiDraw — keyboard-first diagramming<\/title>/);
assert.match(head, /<link rel="canonical" href="https:\/\/kidraw\.net\/">/);
assert.match(head, /<link rel="stylesheet"/);
assert.doesNotMatch(body, /<title>|<link rel="stylesheet"|<style>/);
assert.doesNotMatch(generated, /site-head:(?:start|end)/);

const server = createServer((request, response) => {
  if (request.url !== '/') {
    response.writeHead(404).end('not found');
    return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(generated);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/`;

const launchOptions = process.env.CHROME_BIN
  ? {headless: true, executablePath: process.env.CHROME_BIN}
  : {headless: true};
const browser = await chromium.launch(launchOptions);

async function openPage(viewport, hasTouch = false) {
  const context = await browser.newContext({viewport, hasTouch});
  // The site has system-font fallbacks; keep the smoke test independent of
  // Google Fonts and of whether CI happens to have outbound network access.
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
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  return {context, page, errors};
}

try {
  const desktop = await openPage({width: 1440, height: 1000});
  const {page} = desktop;
  assert.equal(await page.title(), 'KiDraw — keyboard-first diagramming');
  assert.equal(await page.locator('title').evaluate(element => element.parentElement?.tagName), 'HEAD');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('main').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);

  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#main');

  await page.locator('#demo').focus();
  await page.keyboard.press('l');
  await page.keyboard.press('a');
  await page.keyboard.type('child');
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');
  await page.keyboard.press('a');
  await page.keyboard.type('sibling');
  await page.keyboard.press('Escape');

  const graph = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('#scene text')].map(element => element.textContent);
    const nodes = [...document.querySelectorAll('#scene > rect')].map(element => ({
      x: Number(element.getAttribute('x')) + Number(element.getAttribute('width')) / 2,
      y: Number(element.getAttribute('y')) + Number(element.getAttribute('height')) / 2,
    }));
    const edges = [...document.querySelectorAll('#scene line[marker-end]')].map(element => ({
      x1: Number(element.getAttribute('x1')),
      y1: Number(element.getAttribute('y1')),
    }));
    return {labels, nodes, edges, status: document.querySelector('#demoStatus')?.textContent};
  });
  assert.deepEqual(graph.labels, ['idea', 'child', 'sibling']);
  assert.equal(new Set(graph.nodes.map(node => `${node.x},${node.y}`)).size, 3,
    'demo never stacks nodes at the same position');
  assert.equal(graph.edges.length, 2);
  assert.ok(graph.edges.every(edge => Math.hypot(edge.x1 - 300, edge.y1 - 170) < 50),
    'revisiting the root grows both edges from the root');
  assert.match(graph.status ?? '', /normal mode\. 3 nodes\./);
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const mobile = await openPage({width: 390, height: 844}, true);
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await mobile.page.locator('#cards button[data-key="l"]').click();
  await mobile.page.locator('#cards button[data-key="a"]').click();
  await mobile.page.locator('#cards button').filter({hasText: 'Done'}).click();
  assert.equal(await mobile.page.locator('#modeName').textContent(), 'normal');
  assert.equal(await mobile.page.locator('#scene line[marker-end]').count(), 1);
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('site smoke: generated document, desktop keyboard demo, and mobile tap demo passed');
