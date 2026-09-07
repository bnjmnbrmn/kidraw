/**
 * The gestures the film shows, as opposed to the graph it builds.
 *
 * `build.mjs` is about getting a diagram made; this is about making a keypress
 * legible — holding a key long enough to read the menu it opens, walking the
 * crosshairs from one box to the next so the movement is a movement rather
 * than a cut, putting a box down at a spot chosen by hand.
 */
import {keys} from './driver.mjs';
import {goTo, mode, settle, graphShape, nodeCentre, undo} from './build.mjs';

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
export async function typeFilm(page, text, {perChar = 45} = {}) {
  const current = () => page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
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
      await keys(page, 'Escape Escape');
      await settle(page, 220);
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
  let landed = await goTo(page, label);
  for (let attempt = 0; !landed && attempt < 3; attempt++) {
    await keys(page, 'c');
    await settle(page, 150);
    await keys(page, '[r p]');
    await settle(page, 800);
    if (attempt > 0) {
      await keys(page, '[r o]');
      await settle(page, 380);
    }
    landed = await goTo(page, label);
  }
  if (!landed) throw new Error(`cannot reach ${JSON.stringify(label)}`);
  await zoomToLevel(page, target);
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
  // Centre on the crosshairs, inside the same hold.
  await page.keyboard.press('u');
  await settle(page, 460);
  await page.keyboard.up('r');
  await settle(page, 260);
}
