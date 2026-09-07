#!/usr/bin/env node
/**
 * Build the whole KiDraw map in the running app, filmed.
 *
 *   npm start                          # the dev server has to be up
 *   node tools/capture/film-map.mjs
 *
 * What one box's run shows, in order: the crosshairs riding the arrows from the
 * box just finished up to the one this grows from; the camera pulling back; the
 * placement lattice with Add held, and the aim walking to the spot chosen for
 * it; the release, and the camera flying in to the new box; the label typed
 * into it.
 *
 * Nothing is laid out along the way. Every box is put where the script decides,
 * on the lattice, and the one automatic layout in the film runs at the very end
 * — after the box that says the app can do it.
 */
import {writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open, keys} from './driver.mjs';
import {goTo, growAtCell, nodeCentre, grownHalfExtents, park, select,
        frameAbove, settle, labels, edges} from './build.mjs';
import {typeFilm, walkLinks, aimCamera} from './gestures.mjs';
import {startRecorder} from './record.mjs';
import {OUTLINE, flatten, plain, trailTo} from './outline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = process.env.FILM_OUT ?? join(root, '.capture', 'map');
rmSync(outDir, {recursive: true, force: true});
mkdirSync(outDir, {recursive: true});

const VIEWPORT = {width: 820, height: 700};
/**
 * The build happens at 100%. Editing a label takes the camera to 400% and
 * centres it there — that is the app's own behaviour, not something the film
 * arranges — so the box just made is looked at from there, and the zoom back
 * out to 100% for the next one doubles as the shot that puts it in context.
 */
const BUILD_ZOOM = 100;

const {browser, page, errors} = await open({...VIEWPORT, scale: 1});
const rec = await startRecorder(page, {dir: join(outDir, 'frames'), viewport: VIEWPORT});

/** Pin markers are a side effect of the capture, not of the drawing. Nothing
 *  pins anything any more, but the indicator is cheap insurance. */
const hidePins = () => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  component.drawingLayer.getDANodes().forEach(node => node.setPinIndicatorVisible(false));
  component.drawingLayer.batchDraw();
});

const entries = flatten(OUTLINE);
const limit = Number(process.env.CAPTURE_LIMIT ?? entries.length);
const segments = [];
const started = Date.now();
console.log(`filming ${Math.min(limit, entries.length)} boxes at ${VIEWPORT.width}x${VIEWPORT.height}`);

/** Which way this box should go from its parent, in radians. The four questions
 *  take a quarter of the canvas each; everything below fans around the way its
 *  own branch is already heading. */
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

/** The boxes between one and another, up the tree: [[from, to], ...]. */
function climbChain(fromEntry, toNode) {
  const hops = [];
  let at = fromEntry;
  while (at && at.node !== toNode) {
    if (!at.parent) return [];
    hops.push([plain(at.node.t), plain(at.parent.t)]);
    at = entries.find(entry => entry.node === at.parent);
  }
  return hops;
}

/** Sit on the box just made: selected, with the crosshairs off its label. */
async function settleOn(label) {
  await goTo(page, label);
  await select(page);
  await park(page);
  await hidePins();
  rec.hold(850);
}

/** Fit the whole diagram on screen, as keypresses a reader can follow. */
async function showRecenter() {
  await page.keyboard.down('r');
  await settle(page, 380);
  await page.keyboard.press('p');
  await settle(page, 1000);
  await page.keyboard.up('r');
  await settle(page, 400);
  await frameAbove(page);
  rec.hold(1100);
}

/**
 * Force layout, once, at the end.
 *
 * Every box in the film was placed by hand on the lattice; the one time the
 * reader watches a layout run is after the diagram has finished saying the app
 * can run one. Force pulls everything in on itself, so the view that fitted a
 * moment ago now frames a stamp — the fit afterwards is part of the move.
 */
async function showForceLayout() {
  await keys(page, 'c');
  await settle(page, 240);
  await park(page);
  rec.hold(700);
  await page.keyboard.down('b');
  await settle(page, 420);
  rec.hold(700);
  await page.keyboard.press('k');
  await settle(page, 1400);
  await page.keyboard.up('b');
  await settle(page, 700);
  await page.keyboard.down('r');
  await settle(page, 380);
  await page.keyboard.press('p');
  await settle(page, 1100);
  await page.keyboard.up('r');
  await settle(page, 500);
  await frameAbove(page);
  rec.hold(2200);
}

// ---------------------------------------------------------------------------

rec.on();
const rootLabel = plain(entries[0].node.t);
rec.crumb(trailTo(entries[0].node, entries));
rec.hold(700);
await keys(page, 'a');
await settle(page, 420);
await typeFilm(page, rootLabel);
await settleOn(rootLabel);
segments.push(await rec.take({name: `node:${entries[0].node.id}`}));

const index = new Map([[entries[0].node.id, 0]]);
let previous = entries[0];

for (const [at, {node, parent, depth}] of entries.entries()) {
  if (at === 0) continue;
  if (at >= limit) break;
  const label = plain(node.t);
  const parentLabel = plain(parent.t);
  const grandparent = entries.find(entry => entry.node === parent)?.parent ?? null;

  rec.crumb(trailTo(node, entries));
  const clock = {};
  let mark = Date.now();
  const lap = name => { clock[name] = Date.now() - mark; mark = Date.now(); };
  await walkLinks(page, climbChain(previous, parent));
  lap('link');
  await aimCamera(page, parentLabel, BUILD_ZOOM);
  lap('zoomout');
  const {index: mine} = await growAtCell(page, {
    parentIndex: index.get(parent.id),
    aim: await aimFor(node, parent, grandparent),
    // A wide family needs a longer arc to sit on, or the last children have
    // nowhere left to go.
    preferred: 260 + 25 * Math.max(0, parent.c.length - 3),
    // What the box will be once the label is in it, so the spot is judged on
    // the box that ends up there rather than the empty one that lands.
    grown: grownHalfExtents(label),
    refocus: () => aimCamera(page, parentLabel, BUILD_ZOOM),
    // The dashed lattice, held long enough to see what is being chosen from.
    onStage: () => rec.hold(480),
    onSpoiled: () => rec.off(),
    onResume: () => rec.on(),
  });
  index.set(node.id, mine);
  lap('grow');
  // The release opens the label editor, and the camera flies in to 400%.
  await settle(page, 460);
  await typeFilm(page, label);
  lap('type');
  await settleOn(label);
  lap('frame');
  previous = entries.find(entry => entry.node === node);

  // A look at the whole branch when it is done.
  const next = entries[at + 1];
  if (depth >= 1 && (!next || next.depth === 1)) {
    await showRecenter();
    if (!next) await showForceLayout();
    await park(page);
  }

  const segment = await rec.take({name: `node:${node.id}`});
  segments.push(segment);
  console.log(`  ${at}/${entries.length} ${node.id} — ${segment.beats.length} frames, ` +
    `${(segment.ms / 1000).toFixed(1)}s (${((Date.now() - started) / 60000).toFixed(1)}m elapsed) ` +
    Object.entries(clock).map(([name, ms]) => `${name} ${(ms / 1000).toFixed(1)}`).join(' '));
}

await rec.off();
await rec.close();

const total = segments.reduce((sum, segment) => sum + segment.ms, 0);
writeFileSync(join(outDir, 'map.json'), JSON.stringify({
  viewport: VIEWPORT,
  nodes: (await labels(page)).length,
  edges: (await edges(page)).length,
  segments,
}, null, 1));
console.log(`filmed ${segments.length} boxes, ${(total / 1000).toFixed(0)}s of video, ` +
  `in ${((Date.now() - started) / 60000).toFixed(1)}m`);
console.log('errors:', errors);
await browser.close();
