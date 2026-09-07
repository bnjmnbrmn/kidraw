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
import {open, keys, overlaysSeen} from './driver.mjs';
import {goTo, growAtCell, findGrowCell, nodeCentre, grownHalfExtents, park, select,
        frameAbove, settle, labels, edges} from './build.mjs';
import {typeFilm, walkLinks, aimCamera, pullBackTo, vimEdit} from './gestures.mjs';
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
  rec.hold(1100);
}

/** Fit the whole diagram on screen, as keypresses a reader can follow. */
async function showRecenter() {
  // Nothing selected first. Recenter View centres on the *selection* when
  // there is one and only fits the whole diagram when there is not — and the
  // box just made is still selected, so this was centring on it at 400% and
  // leaving the branch shot to be salvaged by panning that could not reach.
  await keys(page, 'c');
  await settle(page, 200);
  await page.keyboard.down('r');
  await settle(page, 380);
  await page.keyboard.press('p');
  await settle(page, 1000);
  await page.keyboard.up('r');
  await settle(page, 400);
  await frameAbove(page);
  // Off whatever the zoom-out left them on before the reader is asked to look
  // at the branch: the crosshairs came to rest on the arrow into the last box
  // and drew a trace the length of it, so the shot that should show a branch
  // ended up being about one link.
  await park(page);
  rec.hold(1300);
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
  // Back to the building zoom *before* riding the arrows: at 400% a hop is
  // half a screen of empty canvas and the walk reads as wandering, and the
  // boxes at either end of the arrow are too big to see at once.
  await pullBackTo(page, BUILD_ZOOM);
  lap('zoomout');
  await walkLinks(page, climbChain(previous, parent));
  lap('link');
  await aimCamera(page, parentLabel, BUILD_ZOOM);
  lap('aim');
  const aim = await aimFor(node, parent, grandparent);
  const preferred = 260 + 25 * Math.max(0, parent.c.length - 3);
  const grown = grownHalfExtents(label);
  const outward = await nodeCentre(page, plain((grandparent ?? parent).t));
  // Find a reachable spot with the camera off, so the walk that is filmed can
  // go straight there.
  await rec.off();
  const preferCell = await findGrowCell(page, {aim, preferred, grown, outward});
  await aimCamera(page, parentLabel, BUILD_ZOOM);
  rec.on();
  const {index: mine} = await growAtCell(page, {
    parentIndex: index.get(parent.id),
    preferCell,
    aim,
    // A wide family needs a longer arc to sit on; the box is judged as what it
    // will be once the label is in it; and a child has to end up further from
    // the point its branch grew out of than its parent is.
    preferred, grown, outward,
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
  await typeFilm(page, node.editFrom ? plain(node.editFrom) : label);
  lap('type');
  if (node.editFrom) {
    // The box that claims vi-style editing gets edited, in vi style.
    await goTo(page, plain(node.editFrom));
    await select(page);
    await settle(page, 300);
    rec.hold(600);
    await vimEdit(page, label);
    rec.hold(700);
    lap('vim');
  }
  await settleOn(label);
  lap('frame');
  previous = entries.find(entry => entry.node === node);

  // A look at the whole branch when it is done.
  const next = entries[at + 1];
  if (depth >= 1 && (!next || next.depth === 1)) {
    await showRecenter();
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
const overlays = await overlaysSeen(page);
if (overlays) console.log(`!! the dev server threw ${overlays} error overlay(s) during the run`);
console.log('errors:', errors);
await browser.close();
