/**
 * The gestures the film shows, as opposed to the graph it builds.
 *
 * `build.mjs` is about getting a diagram made; this is about making a keypress
 * legible — holding a key long enough to read the menu it opens, walking the
 * crosshairs from one box to the next so the movement is a movement rather
 * than a cut, putting a box down at a spot chosen by hand.
 */
import {keys} from './driver.mjs';
import {goTo, mode, settle, graphShape, nodeCentre, undo, edges} from './build.mjs';

/** The keymenu's box on screen, in CSS pixels. */
const keymenuBox = page => page.locator('app-keymenu').boundingBox();

/**
 * The crop that puts the home row where the reader can read it.
 *
 * Trimmed at the sides rather than the top: the keys either end of the row are
 * worth less than the height, and the video's own shape decides the rest.
 */
export async function keymenuLens(page, {easeMs = 420} = {}) {
  const box = await keymenuBox(page);
  return {x: box.x + box.width * 0.07, y: box.y, w: box.width * 0.86, h: box.height, easeMs};
}

/** Press and release, held long enough to read. Twice, because the first time
 *  the reader is still working out what changed. */
export async function pressAndHold(page, recorder, key, {before = 450, held = 1150, after = 500, times = 2} = {}) {
  for (let round = 0; round < times; round++) {
    recorder.hold(before);
    await page.keyboard.down(key);
    await settle(page, 420);
    recorder.hold(held);
    await page.keyboard.up(key);
    await settle(page, 420);
    recorder.hold(after);
  }
}

/** How many stage pixels one drawing-layer unit is worth right now. */
export const stageScale = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  return component.drawingLayer.getAbsoluteScale().x;
});

/** Move the crosshairs to a point on the stage, and let the app work out what
 *  is under them. */
export async function crosshairsOn(page, point) {
  await crosshairsTo(page, point);
  await settle(page, 260);
}

/** Move the crosshairs to a point on the stage. */
const crosshairsTo = (page, point) => page.evaluate(at => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const layer = component.crosshairsLayer;
  component.moveCrosshairsBy(at.x - layer.crosshairsX(), at.y - layer.crosshairsY());
  component.refreshCrosshairHoverHighlight();
}, point);

/** A node's box on the stage. */
export const stageBox = (page, label) => page.evaluate(text => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  component.finishTweens();
  const read = node => {
    const value = node.label;
    if (!value) return '';
    return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
  };
  const node = component.drawingLayer.getDANodes().find(candidate => read(candidate) === text);
  if (!node) return null;
  const box = node.group.getClientRect({relativeTo: component.stage});
  return {x: box.x, y: box.y, w: box.width, h: box.height, cx: box.x + box.width / 2, cy: box.y + box.height / 2};
}, label);

/**
 * A box that belongs to nobody, put down where the script says.
 *
 * The demos need a graph with a known shape — two boxes far enough apart for an
 * arrow to bend around a third, four boxes untidy enough that a tree layout has
 * something to tidy — and the placement lattice is deliberately not that: it
 * refuses the very spots these demos are about.
 */
export async function spawnAt(page, label, point) {
  const band = await visibleBand(page);
  const margin = 50;
  if (point.x < margin || point.x > band.right - margin ||
      point.y < band.top + margin || point.y > band.bottom - margin) {
    throw new Error(`${label} would be put down at ${Math.round(point.x)},${Math.round(point.y)}, ` +
      `outside the band the reader can see (${Math.round(band.top)}..${Math.round(band.bottom)}) — ` +
      'fit the camera before working out where things go');
  }
  await crosshairsTo(page, point);
  await settle(page, 220);
  await keys(page, 'a');
  await settle(page, 340);
  await typeFilm(page, label);
}

/**
 * The strip of canvas the reader can actually see.
 *
 * The header sits over the top of the stage and the keymenu over the bottom
 * three hundred pixels of it, so "on screen" and "in the viewport" are not the
 * same question — a box put down at the middle of the stage is behind the
 * keyboard.
 */
export const visibleBand = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const stage = component.stage;
  const header = document.querySelector('app-header')?.getBoundingClientRect();
  const menu = document.querySelector('app-keymenu')?.getBoundingClientRect();
  return {
    top: header ? header.bottom : 60,
    bottom: menu ? menu.top : stage.height() - 300,
    left: 0,
    right: stage.width(),
  };
});

/** A point pulled inside that strip. */
export function inBand(point, band, margin = 60) {
  return {
    x: Math.max(margin, Math.min(point.x, band.right - margin)),
    y: Math.max(band.top + margin, Math.min(point.y, band.bottom - margin)),
  };
}


/** What held-Add is pointing at: a node, a cell of the lattice, or nothing. */
export const growPoint = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const read = node => {
    const value = node && node.label;
    if (!value) return '';
    return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
  };
  if (component.growTarget) {
    const box = component.growTarget.group.getClientRect({relativeTo: component.drawingLayer});
    return {kind: 'node', label: read(component.growTarget),
            x: box.x + box.width / 2, y: box.y + box.height / 2};
  }
  const target = component.growInsertionTarget;
  return target ? {kind: 'cell', x: target.x, y: target.y} : {kind: 'none'};
});

/**
 * Draw an edge between two boxes that already exist.
 *
 * Held Add, walked onto a node rather than onto an empty cell: releasing there
 * joins the two instead of making a third. The walk is steered by where the
 * aim actually is after each press rather than by a plan made before it
 * started — a box both west and south of the anchor is not reached by going
 * all the way west first.
 */
export async function connect(page, from, to) {
  const before = await graphShape(page);
  // Reach the box first, and check that the crosshairs got there: `goTo` gives
  // up quietly on a box that is off screen, and held Add then anchors on
  // whatever *is* under them — which is how a graph ended up with an edge
  // drawn from the box that happened to be under the camera.
  await aimCamera(page, from, 100);
  const end = await nodeCentre(page, to);
  if (!end) throw new Error(`cannot connect ${from} to ${to}`);
  await page.keyboard.down('a');
  await settle(page, 320);
  await page.keyboard.press('d');
  await settle(page, 280);
  const anchored = await page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const value = component.growAnchor && component.growAnchor.label;
    if (!value) return null;
    return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
  });
  if (anchored !== from) {
    await keys(page, 'Escape');
    await settle(page, 200);
    await page.keyboard.up('a');
    await settle(page, 250);
    throw new Error(`held Add anchored on ${JSON.stringify(anchored)}, not ${JSON.stringify(from)}`);
  }
  const start = await nodeCentre(page, from);
  let landed = false;
  let last = null;
  for (let press = 0; press < 10 && !landed; press++) {
    const at = await growPoint(page);
    if (at.kind === 'node' && at.label === to) { landed = true; break; }
    // Before the first direction press the aim is on nothing at all, so the
    // anchor is what to steer from; after one, nothing means the walk has run
    // off the end of the lattice.
    if (at.kind === 'none' && press > 0) break;
    const here = at.kind === 'none' ? start : at;
    const dx = end.x - here.x;
    const dy = end.y - here.y;
    const key = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'l' : 'h') : (dy > 0 ? 'j' : 'k');
    const footprint = `${key}:${Math.round(here.x)}:${Math.round(here.y)}`;
    if (footprint === last) break;
    last = footprint;
    await page.keyboard.press(key);
    await settle(page, 240);
    const now = await growPoint(page);
    landed = now.kind === 'node' && now.label === to;
  }
  await page.keyboard.up('a');
  await settle(page, 340);
  const after = await graphShape(page);
  // By label, not by count: a release on the anchor makes a self-loop, which
  // is one more edge and looks like success right up until the diagram comes
  // out as a chain with a box hanging off the side of it.
  const drawn = await edges(page);
  const joined = after.labels.length === before.labels.length &&
    drawn.some(([source, destination]) => source === from && destination === to);
  if (!joined) {
    if (/edit/.test(await mode(page))) await keys(page, 'Escape Escape');
    await settle(page, 200);
    for (let attempt = 0; attempt < 20; attempt++) {
      const now = await graphShape(page);
      if (now.labels.length <= before.labels.length &&
          now.edges.length <= before.edges.length) break;
      await undo(page);
      await settle(page, 140);
    }
    throw new Error(`held Add from ${from} did not join ${to} — ` +
      `edges are ${JSON.stringify(drawn)}`);
  }
  return true;
}

const SHIFTED = {
  '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
};

/**
 * Type a label at the speed the page is selling.
 *
 * The flip-book typed a character every 200ms because every character was a
 * screenshot. Nothing is being photographed now, so this runs at something like
 * a real hand — which is the point being made, and is also what keeps a
 * fifty-character heading from costing eight seconds of video.
 */
export async function typeFilm(page, text, {perChar = 45, leaveOpen = false} = {}) {
  const current = () => page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    // An edge label is being edited when there is one selected — and it is not
    // a node, so asking the nodes what was typed reads whichever box happened
    // to be selected instead.
    const edgeLabel = (component.getSelectedLabels?.() ?? [])[0];
    if (edgeLabel) return edgeLabel.label ?? '';
    const selected = component.drawingLayer.getSelectedDANodes();
    const node = selected[0] ?? component.drawingLayer.getDANodes().at(-1);
    const value = node && node.label;
    if (!value) return '';
    return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
  });
  if (!/edit/.test(await mode(page))) throw new Error(`the label editor is not open (${await mode(page)})`);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      for (let press = 0; press < text.length * 2 + 8; press++) {
        if (!(await current()).length) break;
        await page.keyboard.press('Backspace');
        await settle(page, 35);
      }
    }
    let shift = false;
    for (const character of text) {
      const upper = /[A-Z]/.test(character);
      const shifted = character in SHIFTED;
      if ((upper || shifted) !== shift) {
        shift = upper || shifted;
        await page.keyboard[shift ? 'down' : 'up']('Shift');
        await settle(page, 60);
      }
      await page.keyboard.press(upper ? character.toLowerCase() : shifted ? SHIFTED[character] : character);
      await settle(page, perChar);
    }
    if (shift) await page.keyboard.up('Shift');
    await settle(page, 160);
    if (await current() === text) {
      if (!leaveOpen) {
        await keys(page, 'Escape Escape');
        await settle(page, 220);
      }
      return true;
    }
    console.log(`    ! typed ${JSON.stringify(await current())}, typing it again`);
  }
  await keys(page, 'Escape Escape');
  throw new Error(`could not type ${JSON.stringify(text)}`);
}

/**
 * Walk the crosshairs from one box to another along the arrows joining them.
 *
 * Move by Link held, the direction pressed, the view riding along: the reader
 * sees the crosshairs travel rather than appear somewhere else.
 */
export async function walkLinks(page, chain) {
  for (const [from, to] of chain) {
    await goTo(page, from);
    const a = await nodeCentre(page, from);
    const b = await nodeCentre(page, to);
    if (!a || !b) return false;
    const key = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
      ? (b.x > a.x ? 'l' : 'h')
      : (b.y > a.y ? 'j' : 'k');
    await page.keyboard.down('f');
    await settle(page, 420);
    await page.keyboard.press(key);
    await settle(page, 520);
    await page.keyboard.up('f');
    await settle(page, 420);
  }
  return true;
}

/**
 * Put the camera on a box at a chosen zoom, in as few moves as it takes.
 *
 * `focus` in build.mjs recentres before it zooms and again afterwards, which is
 * right when the next thing to happen is a measurement. Here the next thing is
 * a reader watching, and two recentres either side of a zoom read as a wobble —
 * so this zooms, then centres, once.
 */
export async function aimCamera(page, label, target = 100) {
  // Pull back first, then go. Reaching for the box before zooming out could not
  // work — at 400% its parent is a screen and a half away, so `goTo` failed,
  // the camera fitted the whole diagram to find it, and then climbed all the
  // way back in to 100%. Every box in the film paid for two big camera moves
  // that were not about the box being made, which is the panning that had no
  // reason to be there.
  await zoomToLevel(page, target);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await goTo(page, label)) {
      await keys(page, '[r u]');
      await settle(page, 460);
      return;
    }
    // Still out of reach: one more step back, which is a smaller move than
    // fitting the whole diagram and climbing out of it again.
    await keys(page, '[r o]');
    await settle(page, 400);
  }
  throw new Error(`cannot reach ${JSON.stringify(label)}`);
}

/** Zoom percentage as the header reports it. */
const zoomLevel = page => page.evaluate(() => {
  const match = document.body.innerText.match(/(\d+)%/);
  return match ? Number(match[1]) : 100;
});

/**
 * Climb the zoom ladder with Pan/Zoom held once, not once per step.
 *
 * Four steps of `[r o]` is four submenu open-and-closes: three quarters of the
 * time went on the menu sliding in and out, and the reader watched it happen
 * four times over. Held down, the steps run together as one movement of the
 * camera, which is what it is.
 */
export async function pullBackTo(page, target) {
  await zoomToLevel(page, target);
}

async function zoomToLevel(page, target) {
  await page.keyboard.down('r');
  await settle(page, 320);
  for (let step = 0; step < 6; step++) {
    const level = await zoomLevel(page);
    // A tight window, so every box is filmed at the same scale: the ladder
    // steps by about a third, and 0.85-1.2 always contains one of its stops.
    if (level >= target * 0.85 && level <= target * 1.2) break;
    await page.keyboard.press(level < target ? 'i' : 'o');
    await settle(page, 280);
  }
  await page.keyboard.up('r');
  await settle(page, 240);
}

/**
 * Edit a label the way the box says you can: vi modes, on the box that claims
 * them. Visual mode to take the old text out, insert to put the new in, word
 * motions across it, and `r` to fix the one character left deliberately wrong.
 */
export async function vimEdit(page, target) {
  const label = () => page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const node = component.drawingLayer.getSelectedDANodes()[0] ??
      component.drawingLayer.getDANodes().at(-1);
    const value = node && node.label;
    if (!value) return '';
    return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
  });
  // Edit Text opens the editor in vi *normal*, which is the mode the whole
  // demonstration is about.
  await keys(page, 'i');
  await settle(page, 460);
  // To the end of the line, then visual mode extended back over all of it,
  // and cut. The caret starts wherever it was left, so `$` first: without it
  // the selection covers only the tail.
  await keys(page, '[Shift 4]');
  await settle(page, 380);
  await keys(page, 'v');
  await settle(page, 420);
  await keys(page, '0');
  await settle(page, 420);
  await keys(page, 'x');
  await settle(page, 460);
  // Insert, and type it back in — with the last letter deliberately wrong, so
  // there is something for `r` to put right.
  const wrong = target.slice(0, -1) + (target.at(-1) === 'z' ? 'x' : 'z');
  await keys(page, 'i');
  await settle(page, 320);
  await typeFilm(page, wrong, {perChar: 45, leaveOpen: true});
  await settle(page, 300);
  await keys(page, 'Escape');
  await settle(page, 380);
  // Word motions across what was typed, and then the fix: `r` and the letter
  // it should have been.
  await keys(page, '0');
  await settle(page, 320);
  await keys(page, 'w');
  await settle(page, 300);
  await keys(page, 'w');
  await settle(page, 380);
  await keys(page, '[Shift 4]');
  await settle(page, 380);
  await keys(page, 'r');
  await settle(page, 400);
  await keys(page, target.at(-1));
  await settle(page, 460);
  await keys(page, 'Escape Escape');
  await settle(page, 320);
  const got = await label();
  if (got !== target) throw new Error(`vim edit left ${JSON.stringify(got)}, wanted ${JSON.stringify(target)}`);
  return true;
}

/**
 * How far one press of the held-Add aim moves, in drawing-layer units.
 *
 * The lattice hangs off the anchor and its step comes from the anchor's own
 * box, so two boxes only share a lattice if they were put down on multiples of
 * it. Measuring it is what lets a demo graph be laid out so that every edge it
 * needs is a walk the aim can actually make.
 */
export async function latticeStep(page, label) {
  await goTo(page, label);
  await page.keyboard.down('a');
  await settle(page, 320);
  await page.keyboard.press('d');
  await settle(page, 300);
  const step = await page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const anchor = component.growAnchor;
    if (!anchor) return null;
    const box = anchor.group.getClientRect({relativeTo: component.drawingLayer});
    const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    let x = Infinity;
    let y = Infinity;
    for (const target of component.growGhostTargets ?? []) {
      const dx = Math.abs(target.x - from.x);
      const dy = Math.abs(target.y - from.y);
      if (dy < 1 && dx > 1) x = Math.min(x, dx);
      if (dx < 1 && dy > 1) y = Math.min(y, dy);
    }
    return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
  });
  await keys(page, 'Escape');
  await settle(page, 200);
  await page.keyboard.up('a');
  await settle(page, 250);
  await keys(page, 'Escape Escape');
  await settle(page, 220);
  if (!step) throw new Error(`no lattice around ${label}`);
  return step;
}
