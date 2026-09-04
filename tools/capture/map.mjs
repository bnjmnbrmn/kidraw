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
import {seed, grow, goTo, focus, fit, fitToText, overlaps, select, centreInBand, frameAbove, park, zoomTo, settle, typeLabel, labels, edges, MS_PER_CHAR} from './build.mjs';
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
const QUALITY = {
  target: .58, blank: .55, typing: .5, typed: .6, fit: .6,
  menu: .6, tween: .56, rest: .82, overview: .82,
};
// The build happens at 100%; each box is then framed at twice that, centred in
// the band between the header and the keymenu, and left selected.
const BUILD_ZOOM = 100;
const FOCUS_ZOOM = 200;

const plain = text => text.replace(/[=_]([^=_]+)[=_]/g, '$1');

const {browser, page, scratch, errors} = await open({...VIEWPORT, scale: 1});
const shot = shooter(outDir, {type: 'webp', quality: 0.7, scratch});

let counter = 0;
const steps = [];
const extras = [];

/** How long each kind of frame stays on screen, in milliseconds. Typing frames
 *  carry their own, worked out from how many characters they added. */
const HOLD = {target: 820, blank: 260, typed: 420, fit: 320, menu: 700, tween: 500, rest: 0, overview: 0};

async function keep(id, kind, ms) {
  const name = `${String(counter++).padStart(3, '0')}-${id}-${kind}`;
  await shot(page, name, {quality: QUALITY[kind] ?? 0.7, wait: 120});
  return {file: `${name}.webp`, ms: ms ?? HOLD[kind] ?? 300};
}

/** Frames taken during a grow attempt are provisional: the attempt may be
 *  rolled back. Shoot them under a temporary name and rename on success. */
let pending = [];
async function provisional(kind, meta = {}) {
  if (kind === 'target') pending = [];
  // A label is typed in several chunks, so the name has to be unique within the
  // attempt as well as by kind.
  const file = await shot(page, `tmp-${pending.length}-${kind}`, {quality: QUALITY[kind] ?? 0.7, wait: 120});
  pending.push({kind, file, ms: meta.ms ?? HOLD[kind] ?? 300});
}
function commit(id) {
  return pending.map(({kind, file, ms}) => {
    const name = `${String(counter++).padStart(3, '0')}-${id}-${kind}.webp`;
    renameSync(file, join(outDir, name));
    return {file: name, ms};
  });
}

/** Layout animates; catch it mid-flight, then let it settle. */
const chars = text => text.length * MS_PER_CHAR;

/** Frame the box a step is about: zoomed in, centred in the visible band, still
 *  selected, with the crosshairs moved off its label. */
async function frameBox(label) {
  // Fitting the box to its text moves its edges, so the crosshairs have to be
  // put back on it before Select will find anything.
  await goTo(page, label);
  await select(page);
  await zoomTo(page, FOCUS_ZOOM);
  // Park before centring: moving the crosshairs can pan the view, and the
  // centring has to be the last thing that touches the camera.
  await park(page);
  await centreInBand(page, label);
}

/** Lay the diagram out, as a visible pair of keypresses. */
async function showLayout(id, frames) {
  await zoomTo(page, BUILD_ZOOM);
  await keys(page, 'c');
  await settle(page, 200);
  await page.keyboard.down('b');
  await settle(page, 480);
  frames.push(await keep(id, 'menu'));
  await page.keyboard.press('j');
  await page.keyboard.up('b');
  await settle(page, 260);
  frames.push(await keep(id, 'tween'));
  await settle(page, 800);
}

/** Fit the whole diagram on screen, also as visible keypresses. */
async function showRecenter(page_, id, frames) {
  await page.keyboard.down('r');
  await settle(page, 480);
  frames.push(await keep(id, 'menu'));
  await page.keyboard.press('p');
  await page.keyboard.up('r');
  await settle(page, 1100);
  await frameAbove(page);
}

const entries = flatten(OUTLINE);
const started = Date.now();
console.log(`building ${entries.length} boxes at ${VIEWPORT.width}x${VIEWPORT.height} into ${profile.dir}`);

const opening = [];
const rootLabel = plain(entries[0].node.t);
opening.push(await keep('kidraw', 'target', 600));
await keys(page, 'a');
opening.push(await keep('kidraw', 'blank', MS_PER_CHAR));
for (const [index, character] of Array.from(rootLabel).entries()) {
  await typeLabel(page, character);
  const last = index === rootLabel.length - 1;
  opening.push(await keep('kidraw', last ? 'typed' : 'typing', last ? HOLD.typed : MS_PER_CHAR));
}
await keys(page, 'Escape Escape');
await goTo(page, rootLabel);
await fitToText(page);
opening.push(await keep('kidraw', 'fit'));
await frameBox(rootLabel);
opening.push(await keep('kidraw', 'rest'));
steps.push({id: 'kidraw', frames: opening});

const limit = Number(process.env.CAPTURE_LIMIT ?? entries.length);
for (const [index, {node, parent, depth}] of entries.entries()) {
  if (index === 0) continue;
  if (index >= limit) break;
  const label = plain(node.t);
  const parentLabel = plain(parent.t);
  await fit(page);
  await focus(page, parentLabel, BUILD_ZOOM);
  const growArgs = {
    parent: parentLabel,
    refocus: () => focus(page, parentLabel, BUILD_ZOOM),
    onStage: provisional,
  };
  let frames;
  try {
    await grow(page, label, growArgs);
    frames = commit(node.id);
  } catch (crowded) {
    // No free spot around the parent — which is the one time the diagram gets
    // laid out mid-branch, and it is shown rather than done quietly.
    console.log(`  ! ${node.id}: no room, laying out first`);
    const relaid = [];
    await showLayout(node.id, relaid);
    await fit(page);
    await focus(page, parentLabel, BUILD_ZOOM);
    await grow(page, label, growArgs);
    frames = [...relaid, ...commit(node.id)];
  }
  // The crosshairs come to rest where the new box was placed, which is close
  // enough to its incoming arrow that Style and Select would act on the arrow.
  await goTo(page, label);
  await fitToText(page);
  frames.push(await keep(node.id, 'fit'));
  // A long label can make a box that no longer fits the slot it was grown into.
  // That is the other case where the diagram gets laid out mid-branch.
  if (await overlaps(page, label)) {
    console.log(`  ! ${node.id}: overlapping, laying out`);
    await showLayout(node.id, frames);
    await fit(page);
  }
  await frameBox(label);
  frames.push(await keep(node.id, 'rest'));

  // Layout and recenter when a branch is done — shown, not quietly applied.
  const next = entries[index + 1];
  if (depth >= 1 && (!next || next.depth === 1)) {
    await showLayout(node.id, frames);
    await showRecenter(page, node.id, frames);
    await park(page);
    extras.push({id: `overview-${node.id}`, ...(await keep(`overview-${node.id}`, 'overview'))});
  }

  steps.push({id: node.id, frames});
  if (index % 5 === 0) {
    console.log(`  ${index}/${entries.length} ${node.id} (${((Date.now() - started) / 60000).toFixed(1)}m)`);
  }
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
