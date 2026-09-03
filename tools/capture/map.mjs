#!/usr/bin/env node
/**
 * Build the whole KiDraw map in the running app and capture the build as a
 * short frame sequence per box: the held keys, the empty box, the label going
 * in, the layout tween, and the settled graph with the crosshairs parked off to
 * one side so nothing is covered or lit up.
 *
 *   npm start                      # the dev server has to be up
 *   node tools/capture/map.mjs
 */
import {writeFileSync, mkdirSync, rmSync, renameSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open, keys, shooter} from './driver.mjs';
import {seed, grow, layout, focus, fit, park, counts, undo, settle, typeLabel, labels, mode, edges} from './build.mjs';
import {OUTLINE, flatten} from './outline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// Two shapes of the same run. The desktop frames sit beside the prose; the
// portrait ones fill the top two thirds of a phone. Both are 820 wide because
// that is the narrowest viewport the on-screen keyboard fits in without being
// clipped.
const PROFILES = {
  desktop: {dir: 'map', viewport: {width: 820, height: 700}},
  mobile: {dir: 'map-m', viewport: {width: 820, height: 1170}},
};
const profile = PROFILES[process.env.CAPTURE_PROFILE ?? 'desktop'];
if (!profile) throw new Error(`unknown CAPTURE_PROFILE ${process.env.CAPTURE_PROFILE}`);
const outDir = join(here, '..', '..', 'site', 'assets', profile.dir);
rmSync(outDir, {recursive: true, force: true});
mkdirSync(outDir, {recursive: true});

const VIEWPORT = profile.viewport;
// The frames that flash past inside an animation can be leaner than the one the
// reader actually sits on.
const QUALITY = {target: .58, blank: .55, typing: .55, typed: .62, tween: .56, rest: .8};

const plain = text => text.replace(/[=_]([^=_]+)[=_]/g, '$1');

const {browser, page, scratch, errors} = await open({...VIEWPORT, scale: 1});
const shot = shooter(outDir, {type: 'webp', quality: 0.7, scratch});

let counter = 0;
const steps = [];
const extras = [];

async function keep(id, kind) {
  const name = `${String(counter++).padStart(3, '0')}-${id}-${kind}`;
  await shot(page, name, {quality: QUALITY[kind] ?? 0.7, wait: 120});
  return `${name}.webp`;
}

/** Frames taken during a grow attempt are provisional: the attempt may be
 *  rolled back. Shoot them under a temporary name and rename on success. */
let pending = [];
async function provisional(kind) {
  if (kind === 'target') pending = [];
  const file = await shot(page, `tmp-${kind}`, {quality: QUALITY[kind] ?? 0.7, wait: 120});
  pending.push({kind, file});
}
function commit(id) {
  return pending.map(({kind, file}) => {
    const name = `${String(counter++).padStart(3, '0')}-${id}-${kind}.webp`;
    renameSync(file, join(outDir, name));
    return name;
  });
}

/** Layout animates; catch it mid-flight, then let it settle. */
async function layoutWithTween(id, frames) {
  await keys(page, '[b l]');
  frames.push(await keep(id, 'tween'));
  await settle(page, 700);
}

const entries = flatten(OUTLINE);
const started = Date.now();
console.log(`building ${entries.length} boxes at ${VIEWPORT.width}x${VIEWPORT.height} into ${profile.dir}`);

const opening = [];
opening.push(await keep('kidraw', 'target'));
await keys(page, 'a');
opening.push(await keep('kidraw', 'blank'));
await typeLabel(page, plain(entries[0].node.t));
opening.push(await keep('kidraw', 'typed'));
await keys(page, 'Escape Escape');
await layoutWithTween('kidraw', opening);
await focus(page, plain(entries[0].node.t));
await park(page);
opening.push(await keep('kidraw', 'rest'));
steps.push({id: 'kidraw', frames: opening});

const limit = Number(process.env.CAPTURE_LIMIT ?? entries.length);
for (const [index, {node, parent}] of entries.entries()) {
  if (index === 0) continue;
  if (index >= limit) break;
  const label = plain(node.t);
  const parentLabel = plain(parent.t);
  await focus(page, parentLabel);
  await grow(page, label, {
    parent: parentLabel,
    refocus: () => focus(page, parentLabel),
    onStage: provisional,
  });
  const frames = commit(node.id);
  await layoutWithTween(node.id, frames);
  await focus(page, label);
  await park(page);
  frames.push(await keep(node.id, 'rest'));
  steps.push({id: node.id, frames});
  if (index % 8 === 0) {
    console.log(`  ${index}/${entries.length} ${node.id} (${((Date.now() - started) / 60000).toFixed(1)}m)`);
  }
}

// Two overviews, taken where the whole branch still reads at a distance.
for (const id of ['wip', 'vim-curve']) {
  const entry = entries.find(item => item.node.id === id);
  if (!steps.some(step => step.id === id)) continue;
  await fit(page);
  await park(page);
  extras.push({id: `overview-${id}`, file: await keep(`overview-${id}`, 'rest')});
  await focus(page, plain(entry.node.t));
}

writeFileSync(join(outDir, 'map.json'), JSON.stringify({
  viewport: VIEWPORT,
  nodes: (await labels(page)).length,
  edges: (await edges(page)).length,
  steps,
  extras,
  frames: counter,
}, null, 1));
console.log(`captured ${counter} frames in ${((Date.now() - started) / 60000).toFixed(1)}m`);
console.log('errors:', errors);
await browser.close();
