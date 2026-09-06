#!/usr/bin/env node
/**
 * Build the whole KiDraw map in the running app and capture the build as a
 * frame sequence per box.
 *
 *   npm start                      # the dev server has to be up
 *   node tools/capture/map.mjs
 *
 * What a box's run shows, in order: the dashed ghost targets with Add held; a
 * small empty box; the label growing it letter by letter; the box gliding to
 * the place an approximate force layout finds for it; and the camera moving in
 * to frame it, selected, in the band between the header and the keymenu.
 *
 * Nothing is ever laid out globally. Every box that has found its place is
 * pinned, so the Force layout that runs after each one moves that box alone —
 * which is what keeps the diagram from jumping about, and what keeps a new box
 * off the nodes and edges already on the canvas.
 *
 * Anything that moves is photographed while it moves. The frames of a tween are
 * the point of the page, not an artefact of it.
 */
import {writeFileSync, mkdirSync, rmSync, renameSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open, keys, shooter} from './driver.mjs';
import {goTo, goToNewest, growAtCell, typeInto, nodeCentre, fit, focus,
        park, select, centreInBand, frameAbove, zoomTo, settle, labels, edges,
        MS_PER_CHAR} from './build.mjs';
import {OUTLINE, flatten} from './outline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// Two shapes of the same run. The desktop frames sit in the page's window; the
// portrait ones fill the top two thirds of a phone. Both are 820 wide because
// that is the narrowest viewport the on-screen keyboard fits in without being
// clipped.
const PROFILES = {
  desktop: {dir: 'map', viewport: {width: 820, height: 700}},
  mobile: {dir: 'map-m', viewport: {width: 820, height: 1170}},
};
const profile = PROFILES[process.env.CAPTURE_PROFILE ?? 'desktop'];
if (!profile) throw new Error(`unknown CAPTURE_PROFILE ${process.env.CAPTURE_PROFILE}`);
// CAPTURE_OUT lets a trial run write somewhere that is not the live asset set.
const outDir = process.env.CAPTURE_OUT ?? join(here, '..', '..', 'site', 'assets', profile.dir);
rmSync(outDir, {recursive: true, force: true});
mkdirSync(outDir, {recursive: true});

const VIEWPORT = profile.viewport;
// The frames that flash past inside an animation can be leaner than the one the
// reader actually sits on.
const QUALITY = {
  target: .58, blank: .55, typing: .5, typed: .6,
  menu: .6, tween: .5, camera: .5, rest: .82, overview: .82,
};
// The build happens at 100%; each box is then framed at twice that, centred in
// the band between the header and the keymenu, and left selected.
const BUILD_ZOOM = 100;
const FOCUS_ZOOM = 200;
/** A frame taken mid-movement is on screen only as long as the movement. */
const TWEEN_MS = 150;
/** How many frames one glide is worth. A screenshot costs about as long as the
 *  gap a tween wants, so these are taken back to back. */
const TWEEN_SHOTS = 5;
const CAMERA_SHOTS = 4;

const plain = text => text.replace(/[=_]([^=_]+)[=_]/g, '$1');

const {browser, page, scratch, errors} = await open({...VIEWPORT, scale: 1});
const shot = shooter(outDir, {type: 'webp', quality: 0.7, scratch});

let counter = 0;
const steps = [];
const extras = [];

/** How long each kind of frame stays on screen, in milliseconds. Typing frames
 *  carry their own, worked out from how many characters they added. */
const HOLD = {target: 820, blank: 300, typed: 420, menu: 700, tween: TWEEN_MS,
              camera: TWEEN_MS, rest: 0, overview: 0};

/**
 * Pin markers are a side effect of the capture, not of the drawing.
 *
 * The build pins each box once it has found its place, so the next Force layout
 * leaves it alone. The app draws a small square on a pinned node whenever the
 * grid indicators are up — true of every frame here, since each is taken right
 * after a keypress. A reader would be looking at twenty-eight of them.
 */
const hidePins = () => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  component.drawingLayer.getDANodes().forEach(node => node.setPinIndicatorVisible(false));
  component.drawingLayer.batchDraw();
});

async function keep(id, kind, ms) {
  await hidePins();
  const name = `${String(counter++).padStart(3, '0')}-${id}-${kind}`;
  await shot(page, name, {quality: QUALITY[kind] ?? 0.7, wait: kind === 'tween' || kind === 'camera' ? 0 : 120});
  return {file: `${name}.webp`, ms: ms ?? HOLD[kind] ?? 300};
}

/** Frames taken during a grow attempt are provisional: the attempt may be
 *  rolled back. Shoot them under a temporary name and rename on success. */
let pending = [];
async function provisional(kind, meta = {}) {
  if (kind === 'target') pending = [];
  await hidePins();
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

/** Photograph something while it moves. */
async function during(id, frames, count, kind = 'tween') {
  for (let index = 0; index < count; index++) frames.push(await keep(id, kind, TWEEN_MS));
}

/** Type the label into the small empty box, a frame per character. */
async function typeLabelFrames(id, frames, label) {
  await typeInto(page, label, async index => {
    if (index === null) frames.push(await keep(id, 'blank', MS_PER_CHAR));
    else {
      const last = index === label.length - 1;
      frames.push(await keep(id, last ? 'typed' : 'typing', last ? HOLD.typed : MS_PER_CHAR));
    }
  });
}

/**
 * Force layout, once, where the diagram says what it is for.
 *
 * The build places every box itself, on the lattice, and never lays the
 * diagram out along the way — that is what used to make it jump. The one time
 * the reader sees a layout run is the box that introduces the idea, and there
 * it is the whole diagram that moves, zoomed out far enough to watch it
 * happen.
 */
async function showForceLayout(id, frames) {
  await keys(page, 'c');
  await settle(page, 220);
  await showRecenter(id, frames);
  await park(page);
  await page.keyboard.down('b');
  await settle(page, 420);
  frames.push(await keep(id, 'menu'));
  await page.keyboard.press('k');
  await during(id, frames, TWEEN_SHOTS * 2);
  await page.keyboard.up('b');
  await settle(page, 900);
  await frameAbove(page);
  await park(page);
  frames.push(await keep(id, 'overview'));
}

/**
 * Which way this box should go from its parent, in radians.
 *
 * The four questions take a quarter of the canvas each; everything below fans
 * around the direction its own branch is already heading, so a subtree keeps
 * to its own part of the page.
 */
const QUARTERS = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
const FAN = Math.PI * 0.8;
async function aimFor(node, parent, grandparent) {
  const kin = parent.c;
  const index = kin.indexOf(node);
  const fan = FAN * (index - (kin.length - 1) / 2) / Math.max(kin.length, 2);
  if (!grandparent) return QUARTERS[index % QUARTERS.length];
  const from = await nodeCentre(page, plain(grandparent.t));
  const to = await nodeCentre(page, plain(parent.t));
  if (!from || !to) return fan;
  return Math.atan2(to.y - from.y, to.x - from.x) + fan;
}

/** Frame the box a step is about: zoomed in, centred in the visible band, still
 *  selected, with the crosshairs moved off its label. The camera is shown
 *  moving rather than cut to. */
async function frameBox(id, frames, label) {
  await goTo(page, label);
  await select(page);
  let taken = 0;
  const onStep = async () => {
    if (taken++ < CAMERA_SHOTS) frames.push(await keep(id, 'camera'));
  };
  await zoomTo(page, FOCUS_ZOOM, onStep);
  await park(page);
  await centreInBand(page, label, onStep);
  // A fixed number of camera frames, however many presses the move took: the
  // portrait run is captured separately, and the page can only pair the two
  // sets frame for frame if a box's run is the same length in both.
  while (taken++ < CAMERA_SHOTS) frames.push(await keep(id, 'camera'));
}

/** Fit the whole diagram on screen, as visible keypresses. */
async function showRecenter(id, frames) {
  await page.keyboard.down('r');
  await settle(page, 420);
  frames.push(await keep(id, 'menu'));
  await page.keyboard.press('p');
  await during(id, frames, TWEEN_SHOTS);
  await page.keyboard.up('r');
  await settle(page, 900);
  await frameAbove(page);
}

const entries = flatten(OUTLINE);
const started = Date.now();
console.log(`building ${entries.length} boxes at ${VIEWPORT.width}x${VIEWPORT.height} into ${profile.dir}`);

const index = new Map();
const rootLabel = plain(entries[0].node.t);
const opening = [];
opening.push(await keep('kidraw', 'target', 600));
await keys(page, 'a');
// A new box is born fitted to its text — that is the app's default overflow —
// so it starts at its minimum and the label grows it.
await settle(page, 500);
await typeLabelFrames('kidraw', opening, rootLabel);
index.set(entries[0].node.id, 0);
await frameBox('kidraw', opening, rootLabel);
opening.push(await keep('kidraw', 'rest'));
steps.push({id: 'kidraw', frames: opening});

const limit = Number(process.env.CAPTURE_LIMIT ?? entries.length);
for (const [at, {node, parent, depth}] of entries.entries()) {
  if (at === 0) continue;
  if (at >= limit) break;
  const label = plain(node.t);
  const parentLabel = plain(parent.t);
  await fit(page);
  await focus(page, parentLabel, BUILD_ZOOM);
  const grandparent = entries.find(entry => entry.node === parent)?.parent ?? null;
  const {index: mine} = await growAtCell(page, {
    parentIndex: index.get(parent.id),
    aim: await aimFor(node, parent, grandparent),
    refocus: () => focus(page, parentLabel, BUILD_ZOOM),
    onStage: provisional,
  });
  index.set(node.id, mine);
  const frames = commit(node.id);
  await settle(page, 500);
  await typeLabelFrames(node.id, frames, label);
  await frameBox(node.id, frames, label);
  frames.push(await keep(node.id, 'rest'));
  // The one place a layout runs: the box that introduces the idea.
  if (node.id === 'layout') await showForceLayout(node.id, frames);

  // A look at the whole diagram when a branch is done — camera only.
  const next = entries[at + 1];
  if (depth >= 1 && (!next || next.depth === 1)) {
    await showRecenter(node.id, frames);
    await park(page);
    extras.push({id: `overview-${node.id}`, ...(await keep(`overview-${node.id}`, 'overview'))});
  }

  steps.push({id: node.id, frames});
  console.log(`  ${at}/${entries.length} ${node.id} — ${frames.length} frames (${((Date.now() - started) / 60000).toFixed(1)}m)`);
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
