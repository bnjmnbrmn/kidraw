#!/usr/bin/env node
/**
 * The small demo graphs:
 *   - the keymenu at rest and under a held key;
 *   - dragging a box and watching its own arrows re-route;
 *   - dragging a box *into* an arrow's path, so the arrow routes around it.
 *
 *   node tools/capture/demo.mjs
 */
import {writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open, keys, shooter} from './driver.mjs';
import {seed, grow, layout, focus, fit, frameAbove, park, goTo, edges, settle, counts, undo, typeLabel, labels, fitEveryBox} from './build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROFILES = {
  desktop: {dir: 'demo', viewport: {width: 820, height: 700}},
  mobile: {dir: 'demo-m', viewport: {width: 820, height: 1170}},
};
const profile = PROFILES[process.env.CAPTURE_PROFILE ?? 'desktop'];
if (!profile) throw new Error(`unknown CAPTURE_PROFILE ${process.env.CAPTURE_PROFILE}`);
const outDir = join(here, '..', '..', 'site', 'assets', profile.dir);
rmSync(outDir, {recursive: true, force: true});
mkdirSync(outDir, {recursive: true});

const VIEWPORT = profile.viewport;
let session = await open({...VIEWPORT, scale: 1});
let {page} = session;
let shot = shooter(outDir, {type: 'webp', quality: 0.76, scratch: session.scratch});
const allErrors = [];

/** Which box the crosshairs are over — worth checking before a drag. */
const under = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const node = component.nearestNodeToCrosshairs();
  if (!node) return null;
  const value = node.label;
  return typeof value === 'string' ? value : (value && value.text ? value.text() : null);
});

const digressions = {};
const follow = [];
const avoid = [];

/* ---------- the keymenu, on a four-box graph ---------- */

await seed(page, 'Ship the alpha');
await layout(page);
for (const [parent, child] of [
  ['Ship the alpha', 'Landing page'],
  ['Landing page', 'Screenshots'],
  ['Ship the alpha', 'Docs'],
]) {
  await focus(page, parent);
  await grow(page, child, {parent, refocus: () => focus(page, parent)});
  await layout(page);
}
console.log('graph:', JSON.stringify(await edges(page)));

await fitEveryBox(page);
await layout(page);
await fit(page);
await frameAbove(page);
await park(page);

// Three digressions the page uses inline: the keymenu on its own with a key
// held, and once with the whole window so the canvas answer shows too.
async function keymenuShot(name) {
  await page.locator('app-keymenu').screenshot({path: join(outDir, `${name}.png`)});
  digressions[name] = `${name}.png`;
}

await goTo(page, 'Landing page');
await page.keyboard.down('f');
await settle(page, 620);
await keymenuShot('menu-f');
await shot(page, 'window-f', {wait: 160});
digressions['window-f'] = 'window-f.webp';
await page.keyboard.up('f');
await settle(page, 400);

await page.keyboard.down('a');
await settle(page, 620);
await keymenuShot('menu-a');
await page.keyboard.up('a');
await settle(page, 400);
await keys(page, 'Escape Escape');
await rollBackTo(4, 3);
await layout(page);

/* ---------- a box moves, its own arrows re-route ---------- */

await fit(page);
await frameAbove(page);
await goTo(page, 'Landing page');
const dragging = await under(page);
if (dragging !== 'Landing page') throw new Error(`the drag would move ${dragging}`);
await page.keyboard.down('v');
await settle(page, 420);
follow.push(await shotName('follow-00'));
for (let step = 1; step <= 8; step++) {
  await page.keyboard.press('j');
  await settle(page, 300);
  follow.push(await shotName(`follow-${String(step).padStart(2, '0')}`));
}
await page.keyboard.up('v');
await settle(page, 500);
follow.push(await shotName('follow-09'));
await keys(page, '[b l]');
await settle(page, 900);
await park(page);
follow.push(await shotName('follow-10'));

/* ---------- an arrow routes around a box dragged into its path ---------- */

// A second session rather than clearing the graph in place: a fresh page is
// the one guaranteed way to start from nothing.
allErrors.push(...session.errors);
await session.browser.close();
session = await open({...VIEWPORT, scale: 1});
page = session.page;
shot = shooter(outDir, {type: 'webp', quality: 0.76, scratch: session.scratch});

await seed(page, 'Plan');
await layout(page);
await focus(page, 'Plan');
await grow(page, 'Ship it', {parent: 'Plan', refocus: () => focus(page, 'Plan')});
await fitEveryBox(page);
await layout(page);

// Pull the two apart so the arrow between them has room for an obstacle.
await fit(page);
await goTo(page, 'Ship it');
await page.keyboard.down('v');
await settle(page, 320);
for (let step = 0; step < 3; step++) {
  await page.keyboard.press('l');
  await settle(page, 170);
}
await page.keyboard.up('v');
await settle(page, 420);
await keys(page, 'c');
await fit(page);
await frameAbove(page);
await settle(page, 400);

// A free-standing box below the arrow, in the way of where it is going.
await page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const stage = component.stage;
  const rects = component.drawingLayer.getDANodes()
    .map(node => node.group.getClientRect({relativeTo: stage}));
  const left = Math.min(...rects.map(r => r.x));
  const right = Math.max(...rects.map(r => r.x + r.width));
  const line = rects[0].y + rects[0].height / 2;
  const layer = component.crosshairsLayer;
  component.moveCrosshairsBy((left + right) / 2 - layer.crosshairsX(), line + 150 - layer.crosshairsY());
  component.refreshCrosshairHoverHighlight();
});
await settle(page, 300);
await keys(page, 'a');
await typeLabel(page, 'Review');
await keys(page, 'Escape Escape');
await goTo(page, 'Review');
await keys(page, '[w [f h]]');
await settle(page, 260);
await keys(page, 'c');
await fit(page);
await frameAbove(page);
// A little headroom at the top: the box being dragged is heading downwards.
await keys(page, '[r k]');
await settle(page, 420);
await park(page);
await settle(page, 300);
avoid.push(await shotName('avoid-00'));

// Drag "Ship it" down. The arrow into it is attached to the box being moved,
// so it is re-routed on every press — and Review is in its way.
await goTo(page, 'Ship it');
const moving = await under(page);
if (moving !== 'Ship it') throw new Error(`the drag would move ${moving}`);
await page.keyboard.down('v');
await settle(page, 420);
avoid.push(await shotName('avoid-01'));
// Three presses is where the bend is clearest and everything is still in
// frame; a fourth makes the app pan and Plan slides off the top.
for (let step = 2; step <= 4; step++) {
  await page.keyboard.press('j');
  await settle(page, 300);
  avoid.push(await shotName(`avoid-${String(step).padStart(2, '0')}`));
}
await page.keyboard.up('v');
await settle(page, 500);
await keys(page, 'c');
await park(page);
avoid.push(await shotName('avoid-05'));

writeFileSync(join(outDir, 'demo.json'), JSON.stringify({
  viewport: VIEWPORT, digressions, follow, avoid,
}, null, 1));
console.log(`demo: ${Object.keys(digressions).length} digressions, ${follow.length} follow, ${avoid.length} avoid`);
allErrors.push(...session.errors);
console.log('errors:', allErrors);
await session.browser.close();

async function shotName(name) {
  await shot(page, name, {wait: 140});
  return `${name}.webp`;
}

async function rollBackTo(nodes, edgeCount) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const now = await counts(page);
    if (now.nodes <= nodes && now.edges <= edgeCount) return;
    await undo(page);
    await settle(page, 150);
  }
}
