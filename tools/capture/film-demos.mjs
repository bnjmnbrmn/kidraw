#!/usr/bin/env node
/**
 * The small demos, filmed.
 *
 *   node tools/capture/film-demos.mjs [name ...]
 *
 * Each one is a graph of its own, three or four boxes called a, b, c, d,
 * because the point of these is the gesture and not the words in the boxes.
 * They are breaks in the build — the org file asks for them — and each is cut
 * into the film after the box it belongs to.
 *
 * Two of them look at the keymenu rather than the canvas: the camera moves in
 * on the home row so the letters on the keys can actually be read, which is the
 * whole content of "press and hold a submenu key".
 */
import {writeFileSync, mkdirSync, rmSync, existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open, keys, overlaysSeen} from './driver.mjs';
import {seed, goTo, growAtCell, grownHalfExtents, park, settle, labels,
        fit, frameAbove} from './build.mjs';
import {typeFilm, aimCamera, pressAndHold, keymenuLens, spawnAt, connect, latticeStep,
        stageBox, visibleBand, inBand, crosshairsOn, stageScale} from './gestures.mjs';
import {startRecorder} from './record.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = process.env.FILM_OUT ?? join(root, '.capture', 'demos');
mkdirSync(outDir, {recursive: true});

const VIEWPORT = {width: 820, height: 700};

/** Grow a child of the box under the crosshairs, on the lattice, and name it. */
async function child(page, parent, label, {aim = 0, preferred = 300} = {}) {
  await aimCamera(page, parent, 100);
  const parentIndex = (await labels(page)).length - 1;
  const shape = await page.evaluate(text => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const read = node => {
      const value = node.label;
      return typeof value === 'string' ? value : (value && value.text ? value.text() : '');
    };
    return component.drawingLayer.getDANodes().findIndex(node => read(node) === text);
  }, parent);
  await growAtCell(page, {
    parentIndex: shape >= 0 ? shape : parentIndex,
    aim, preferred,
    grown: grownHalfExtents(label),
    refocus: () => aimCamera(page, parent, 100),
  });
  await settle(page, 420);
  await typeFilm(page, label);
}

/** A row of boxes joined left to right, made off camera. */
async function chain(page, names, {aim = 0, preferred = 300} = {}) {
  await seed(page, names[0]);
  for (let at = 1; at < names.length; at++) {
    await child(page, names[at - 1], names[at], {aim, preferred});
  }
  await fit(page);
  await frameAbove(page);
  await park(page);
  await settle(page, 400);
}

/** Everything a demo needs: its own browser, its own empty canvas. */
async function stage(name, run) {
  const frames = join(outDir, 'frames', name);
  rmSync(frames, {recursive: true, force: true});
  const session = await open({...VIEWPORT, scale: 1});
  const recorder = await startRecorder(session.page, {dir: frames, viewport: VIEWPORT});
  try {
    const segment = await run(session.page, recorder);
    const overlays = await overlaysSeen(session.page);
    if (overlays) console.log(`  !! ${name}: the dev server threw ${overlays} error overlay(s)`);
    return segment;
  } finally {
    await recorder.close();
    await session.browser.close();
  }
}

const DEMOS = {
  /* ---- press and hold a submenu key, read off the home row ---- */
  async hold(page, rec) {
    await chain(page, ['a', 'b', 'c']);
    rec.on();
    // Pan/Zoom: a submenu whose keys are all on the home row, so holding it is
    // the whole idea in one picture.
    await pressAndHold(page, rec, 'r', {times: 2});
    await rec.off();
    return rec.take({name: 'hold', lens: await keymenuLens(page)});
  },

  /* ---- the same keys, meaning different things ---- */
  async navkeys(page, rec) {
    await chain(page, ['a', 'b', 'c']);
    await goTo(page, 'b');
    rec.on();
    for (const key of ['r', 'f', 'g']) {
      await pressAndHold(page, rec, key, {times: 1, before: 400, held: 1500, after: 350});
    }
    await rec.off();
    return rec.take({name: 'navkeys', lens: await keymenuLens(page)});
  },

  /* ---- the action happens when the key comes back up ---- */
  async release(page, rec) {
    await chain(page, ['a', 'b']);
    rec.on();
    for (const [round, label] of ['c', 'd'].entries()) {
      await goTo(page, round === 0 ? 'b' : 'c');
      rec.hold(450);
      await page.keyboard.down('a');
      await settle(page, 420);
      rec.hold(700);
      await page.keyboard.press('d');
      await settle(page, 380);
      rec.hold(500);
      await page.keyboard.press(round === 0 ? 'j' : 'l');
      await settle(page, 320);
      // Held: dashed spots, nothing made yet.
      rec.hold(1100);
      await page.keyboard.up('a');
      await settle(page, 500);
      // Released: a box, and the editor open on it.
      rec.hold(700);
      await typeFilm(page, label);
      await park(page);
      rec.hold(800);
      await aimCamera(page, label, 100);
    }
    await rec.off();
    return rec.take({name: 'release'});
  },

  /* ---- an arrow bends around a box that gets in its way ---- */
  async routing(page, rec) {
    await seed(page, 'a');
    await child(page, 'a', 'b', {aim: 0, preferred: 420});
    await keys(page, 'c');
    await fit(page);
    await frameAbove(page);
    // A third box below the line between them. It is b that moves: chasing the
    // line with the box lands it on one side or the other, where the arrow is
    // straight again, whereas swinging the line down across a box that is
    // standing still sweeps it through the obstacle and holds it there.
    const band = await visibleBand(page);
    const from = await stageBox(page, 'a');
    const to = await stageBox(page, 'b');
    await spawnAt(page, 'c', inBand({
      x: (from.cx + to.cx) / 2,
      y: (from.cy + to.cy) / 2 + 110,
    }, band));
    await keys(page, 'c');
    await fit(page);
    // A step back, for room below the swing: the drag moves the box a fixed
    // number of drawing units, so pulling the camera out is what turns that
    // into a distance the visible band can hold.
    await keys(page, '[r o]');
    await settle(page, 500);
    await frameAbove(page);
    await goTo(page, 'b');
    await settle(page, 450);

    rec.on();
    rec.hold(1000);
    await keys(page, 'v');
    await settle(page, 340);
    rec.hold(700);
    await page.keyboard.down('v');
    await settle(page, 440);
    // Down until the arrow has swung onto c. How far one press moves a box
    // depends on the zoom and on the coarse/fine setting, so where to stop is
    // measured rather than assumed.
    const floor = (await visibleBand(page)).bottom - 60;
    for (let press = 0; press < 8; press++) {
      const [a, b, c] = await Promise.all(
        ['a', 'b', 'c'].map(label => stageBox(page, label)));
      if (!a || !b || !c) break;
      if ((a.cy + b.cy) / 2 >= c.cy - 8) break;
      if (b.cy > floor) break;
      await page.keyboard.press('j');
      await settle(page, 460);
    }
    rec.hold(1200);
    await page.keyboard.up('v');
    await settle(page, 520);
    await keys(page, 'c');
    await fit(page);
    await frameAbove(page);
    await park(page);
    rec.hold(1800);
    await rec.off();
    return rec.take({name: 'routing'});
  },

  /* ---- a waypoint, added and moved ---- */
  async waypoints(page, rec) {
    await seed(page, 'a');
    await child(page, 'a', 'b', {aim: 0, preferred: 420});
    await keys(page, 'c');
    await fit(page);
    await frameAbove(page);
    const band = await visibleBand(page);
    const from = await stageBox(page, 'a');
    const to = await stageBox(page, 'b');
    await spawnAt(page, 'c', inBand({
      x: (from.cx + to.cx) / 2,
      y: (from.cy + to.cy) / 2 + 120,
    }, band));
    await keys(page, 'c');
    await fit(page);
    await frameAbove(page);
    await settle(page, 400);

    rec.on();
    rec.hold(900);
    // On the arrow, and a waypoint put down on it.
    const a = await stageBox(page, 'a');
    const b = await stageBox(page, 'b');
    await crosshairsOn(page, {x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2});
    await settle(page, 500);
    rec.hold(700);
    await keys(page, '[a w]');
    await settle(page, 700);
    rec.hold(1000);
    // And dragged, so the arrow bends where it is told to rather than where
    // the router would have put it.
    await keys(page, 'v');
    await settle(page, 380);
    await page.keyboard.down('v');
    await settle(page, 420);
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('j');
      await settle(page, 440);
    }
    rec.hold(900);
    await page.keyboard.up('v');
    await settle(page, 460);
    await keys(page, 'c');
    await park(page);
    rec.hold(1500);
    await rec.off();
    return rec.take({name: 'waypoints'});
  },

  /* ---- three layouts on a graph with somewhere to put things ---- */
  async layouts(page, rec) {
    // a->b, b->c, a->c, d->b, d->c: two ways to reach c and a box that feeds
    // both, so a tree layout has a choice to make and Force has something to
    // open out. A chain only ever comes back as a line.
    //
    // Every box is put down on a multiple of the *same* lattice step, because
    // the held-Add aim can only walk from one box to another along it — a
    // graph laid out by eye leaves half these edges unreachable, and a release
    // that reaches nothing makes a self-loop rather than failing.
    await seed(page, 'a');
    // One step back before anything is measured: a lattice cell is most of the
    // visible band at 100%, so the row below `a` would be behind the keyboard.
    const home = async () => {
      await aimCamera(page, 'a', 100);
      await keys(page, '[r o]');
      await settle(page, 460);
    };
    await home();
    const step = await latticeStep(page, 'a');
    for (const [label, across, down] of [['b', 1, 0], ['c', 1, 1], ['d', 2, 0]]) {
      await home();
      const scale = await stageScale(page);
      const anchor = await stageBox(page, 'a');
      await spawnAt(page, label, {
        x: anchor.cx + across * step.x * scale,
        y: anchor.cy + down * step.y * scale,
      });
    }
    for (const [from, to] of [['a', 'b'], ['b', 'c'], ['a', 'c'], ['d', 'b'], ['d', 'c']]) {
      await connect(page, from, to);
    }
    await keys(page, 'c');
    await fit(page);
    await frameAbove(page);
    await park(page);
    await settle(page, 500);

    rec.on();
    rec.hold(1200);
    for (const key of ['l', 'j', 'k']) {
      await page.keyboard.down('b');
      await settle(page, 420);
      rec.hold(650);
      await page.keyboard.press(key);
      await settle(page, 1200);
      await page.keyboard.up('b');
      await settle(page, 500);
      await keys(page, 'c');
      await keys(page, '[r p]');
      await settle(page, 900);
      await frameAbove(page);
      await park(page);
      rec.hold(1300);
    }
    await rec.off();
    return rec.take({name: 'layouts'});
  },

  /* ---- the same key, two sizes of step ---- */
  async coarsefine(page, rec) {
    await chain(page, ['a', 'b', 'c'], {preferred: 300});
    await goTo(page, 'a');
    await settle(page, 450);

    rec.on();
    rec.hold(900);
    for (const [held, presses] of [['s', 4], ['d', 6]]) {
      await page.keyboard.down(held);
      await settle(page, 460);
      rec.hold(700);
      for (let step = 0; step < presses; step++) {
        await page.keyboard.press('l');
        await settle(page, 420);
      }
      rec.hold(700);
      await page.keyboard.up(held);
      await settle(page, 460);
    }
    rec.hold(1100);
    await rec.off();
    return rec.take({name: 'coarsefine'});
  },

  /* ---- colour, shape, and a dashed arrow ---- */
  async styling(page, rec) {
    await chain(page, ['a', 'b', 'c'], {preferred: 320});
    await goTo(page, 'a');
    await settle(page, 450);

    rec.on();
    rec.hold(900);
    await keys(page, 'v');
    await settle(page, 400);
    rec.hold(600);
    await keys(page, '[w [r j]]');
    await settle(page, 650);
    rec.hold(900);
    await keys(page, '[w [g j]]');
    await settle(page, 700);
    rec.hold(1000);
    await keys(page, 'c');
    await settle(page, 300);
    // Now the arrow between b and c: the same submenu, a different thing
    // under the crosshairs.
    const b = await stageBox(page, 'b');
    const c = await stageBox(page, 'c');
    await crosshairsOn(page, {x: (b.cx + c.cx) / 2, y: (b.cy + c.cy) / 2});
    await settle(page, 420);
    await keys(page, 'v');
    await settle(page, 420);
    rec.hold(700);
    await keys(page, '[w [q j]]');
    await settle(page, 650);
    rec.hold(800);
    await keys(page, '[w [r l]]');
    await settle(page, 650);
    await keys(page, 'c');
    await park(page);
    rec.hold(1400);
    await rec.off();
    return rec.take({name: 'styling'});
  },

  /* ---- a word on the arrow itself ---- */
  async edgelabels(page, rec) {
    await chain(page, ['a', 'b', 'c'], {preferred: 340});
    await settle(page, 400);

    rec.on();
    rec.hold(900);
    const a = await stageBox(page, 'a');
    const b = await stageBox(page, 'b');
    await crosshairsOn(page, {x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2});
    await settle(page, 500);
    rec.hold(700);
    await keys(page, '[a f]');
    await settle(page, 700);
    await typeFilm(page, 'then');
    await settle(page, 400);
    await keys(page, 'c');
    await park(page);
    rec.hold(1500);
    await rec.off();
    return rec.take({name: 'edgelabels'});
  },

  /* ---- hopping from box to box, joined or not ---- */
  async hop(page, rec) {
    await chain(page, ['a', 'b', 'c'], {preferred: 300});
    await keys(page, 'c');
    await fit(page);
    await frameAbove(page);
    // One box joined to nothing: hopping does not care about the arrows.
    const band = await visibleBand(page);
    const home = await stageBox(page, 'b');
    await spawnAt(page, 'd', inBand({x: home.cx, y: home.cy + 220}, band));
    await keys(page, 'c');
    await fit(page);
    await frameAbove(page);
    await goTo(page, 'a');
    await park(page);
    await goTo(page, 'a');
    await settle(page, 500);

    rec.on();
    rec.hold(800);
    await page.keyboard.down('g');
    await settle(page, 480);
    rec.hold(700);
    // Along the row, then down to the box nothing joins — and back up.
    for (const key of ['l', 'l', 'j', 'k', 'h']) {
      await page.keyboard.press(key);
      await settle(page, 620);
      rec.hold(320);
    }
    await page.keyboard.up('g');
    await settle(page, 420);
    rec.hold(1100);
    await rec.off();
    return rec.take({name: 'hop'});
  },

  /* ---- following the arrows ---- */
  async links(page, rec) {
    await seed(page, 'a');
    await child(page, 'a', 'b', {aim: 0, preferred: 300});
    await child(page, 'b', 'c', {aim: 0, preferred: 300});
    await child(page, 'a', 'd', {aim: Math.PI / 2, preferred: 300});
    await keys(page, 'c');
    await fit(page);
    await frameAbove(page);
    await goTo(page, 'a');
    await settle(page, 500);

    rec.on();
    rec.hold(800);
    await page.keyboard.down('f');
    await settle(page, 480);
    rec.hold(700);
    for (const key of ['l', 'l', 'h', 'h', 'j']) {
      await page.keyboard.press(key);
      await settle(page, 640);
      rec.hold(340);
    }
    await page.keyboard.up('f');
    await settle(page, 420);
    rec.hold(1100);
    await rec.off();
    return rec.take({name: 'links'});
  },
};

const wanted = process.argv.slice(2).filter(name => name in DEMOS);
const names = wanted.length ? wanted : Object.keys(DEMOS);
const manifestPath = join(outDir, 'demos.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : {viewport: VIEWPORT, segments: {}};

const started = Date.now();
for (const name of names) {
  const at = Date.now();
  const segment = await stage(name, (page, rec) => DEMOS[name](page, rec));
  manifest.segments[name] = segment;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log(`  ${name} — ${segment.beats.length} frames, ${(segment.ms / 1000).toFixed(1)}s ` +
    `(${((Date.now() - at) / 1000).toFixed(0)}s to shoot)`);
}
console.log(`${names.length} demos in ${((Date.now() - started) / 60000).toFixed(1)}m`);
