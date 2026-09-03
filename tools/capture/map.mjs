#!/usr/bin/env node
/**
 * Build the whole KiDraw map in the running app and capture a frame per node.
 *
 *   npm start                      # the dev server has to be up
 *   node tools/capture/map.mjs
 *
 * Frames land in site/assets/map/ as WebP, described by map.json.
 */
import {writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open, keys, shooter} from './driver.mjs';
import {seed, grow, layout, focus, fit, counts, undo, settle, typeLabel, labels, mode, edges} from './build.mjs';
import {OUTLINE, flatten} from './outline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'site', 'assets', 'map');
rmSync(outDir, {recursive: true, force: true});
mkdirSync(outDir, {recursive: true});

/** Org markup belongs to the page, not to the node label. */
const plain = text => text.replace(/[=_]([^=_]+)[=_]/g, '$1');

const {browser, page, scratch, errors} = await open({width: 1200, height: 760, scale: 1});
const shot = shooter(outDir, {type: 'webp', quality: 0.78, scratch});

const frames = [];
async function frame(id, kind) {
  const name = `${String(frames.length).padStart(3, '0')}-${id}`;
  await shot(page, name);
  frames.push({file: `${name}.webp`, id, kind});
  return name;
}

const entries = flatten(OUTLINE);
const started = Date.now();
console.log(`building ${entries.length} nodes`);

await frame('empty', 'empty');
for (const [index, {node, parent}] of entries.entries()) {
  const label = plain(node.t);
  if (index === 0) {
    await seed(page, label);
  } else {
    const parentLabel = plain(parent.t);
    await focus(page, parentLabel);
    await grow(page, label, {parent: parentLabel, refocus: () => focus(page, parentLabel)});
  }
  await layout(page);
  await focus(page, label);
  await frame(node.id, 'node');

  const next = entries[index + 1];
  const branchDone = index > 1 && (!next || next.depth === 1);
  if (branchDone) {
    await fit(page);
    await frame(`overview-${node.id}`, 'overview');
  }
  if (index % 8 === 0) {
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    console.log(`  ${index}/${entries.length} ${node.id} (${mins}m)`);
  }
}

await fit(page);
await frame('whole-map', 'overview');

// A short demonstration pass: what the keyboard and the canvas look like while
// Add is held. Each one is rolled back so the map keeps its shape.
for (const id of ['basics', 'advanced', 'plugins']) {
  const entry = entries.find(item => item.node.id === id);
  const label = plain(entry.node.t);
  await focus(page, label);
  const before = await counts(page);
  await frame(`${id}-rest`, 'rest');
  await page.keyboard.down('a');
  await settle(page, 420);
  await frame(`${id}-hold`, 'hold');
  await page.keyboard.press('d');
  await settle(page, 420);
  await frame(`${id}-target`, 'target');
  await page.keyboard.press('j');
  await settle(page, 380);
  await frame(`${id}-placed`, 'placed');
  await page.keyboard.up('a');
  await settle(page, 400);
  await keys(page, 'Escape Escape');
  for (let attempt = 0; attempt < 30; attempt++) {
    const now = await counts(page);
    if (now.nodes <= before.nodes && now.edges <= before.edges) break;
    await undo(page);
    await settle(page, 140);
  }
  await layout(page);
}

writeFileSync(join(outDir, 'map.json'), JSON.stringify({
  viewport: {width: 1200, height: 760},
  nodes: (await labels(page)).length,
  edges: (await edges(page)).length,
  frames,
}, null, 1));
console.log(`captured ${frames.length} frames in ${((Date.now() - started) / 60000).toFixed(1)}m`);
console.log('errors:', errors);
await browser.close();
