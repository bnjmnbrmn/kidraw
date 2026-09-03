#!/usr/bin/env node
/**
 * The small demo graph: the keymenu at rest and under a held key, and the drag
 * sequence that shows arrows re-routing while a box moves.
 *
 *   node tools/capture/demo.mjs
 */
import {writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open, keys, shooter} from './driver.mjs';
import {seed, grow, layout, focus, fit, edges, settle, counts, undo} from './build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'site', 'assets', 'demo');
rmSync(outDir, {recursive: true, force: true});
mkdirSync(outDir, {recursive: true});

const {browser, page, scratch, errors} = await open({width: 1200, height: 760, scale: 1});

/** Which box the crosshairs are actually over — worth checking before a drag. */
const under = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const node = component.nearestNodeToCrosshairs();
  if (!node) return null;
  const value = node.label;
  return typeof value === 'string' ? value : (value && value.text ? value.text() : null);
});
const shot = shooter(outDir, {type: 'webp', quality: 0.82, scratch});
const frames = [];
async function frame(name, kind) {
  await shot(page, name);
  frames.push({file: `${name}.webp`, name, kind});
}

// Four boxes: small enough that the keyboard is the biggest thing on screen,
// and the box we drag has an arrow coming in and an arrow going out.
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
console.log('edges:', JSON.stringify(await edges(page)));

// Fit first, then land on the box: the camera move would otherwise slide the
// graph out from under the crosshairs.
await fit(page);
await focus(page, 'Landing page', 60);
await settle(page, 400);
console.log('menu frames centred on:', await under(page));
await frame('menu-rest', 'menu');

await page.keyboard.down('a');
await settle(page, 450);
await frame('menu-add-held', 'menu');
await page.keyboard.press('d');
await settle(page, 450);
await frame('menu-add-target', 'menu');
await page.keyboard.press('j');
await settle(page, 300);
await page.keyboard.up('a');
await settle(page, 350);
await keys(page, 'Escape Escape');
const clean = {nodes: 4, edges: 3};
for (let attempt = 0; attempt < 30; attempt++) {
  const now = await counts(page);
  if (now.nodes <= clean.nodes && now.edges <= clean.edges) break;
  await undo(page);
  await settle(page, 140);
}
await layout(page);

// The drag. One frame per press, so the re-routing between frames is the point.
await fit(page);
await focus(page, 'Landing page', 60);
await settle(page, 400);
const dragging = await under(page);
console.log('dragging:', dragging);
if (dragging !== 'Landing page') throw new Error(`the drag would move ${dragging}`);
const drag = [];
async function dragFrame(index) {
  const name = `drag-${String(index).padStart(2, '0')}`;
  await shot(page, name);
  drag.push(`${name}.webp`);
}
await page.keyboard.down('v');
await settle(page, 420);
await dragFrame(0);
for (let step = 1; step <= 8; step++) {
  await page.keyboard.press('j');
  await settle(page, 300);
  await dragFrame(step);
}
await page.keyboard.up('v');
await settle(page, 500);
await dragFrame(9);
await keys(page, '[b l]');
await settle(page, 900);
await dragFrame(10);

writeFileSync(join(outDir, 'demo.json'), JSON.stringify({
  viewport: {width: 1200, height: 760},
  frames,
  drag,
}, null, 1));
console.log(`demo: ${frames.length} frames, ${drag.length} drag frames`);
console.log('errors:', errors);
await browser.close();
