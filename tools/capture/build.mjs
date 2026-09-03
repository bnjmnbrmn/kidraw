/**
 * Build a graph in the running KiDraw app with real keystrokes.
 *
 * Every label is typed the way a person types it (Shift held for capitals and
 * shifted punctuation, which is what the label-edit keymenu expects), and every
 * node is grown from its parent with Add held. Tree-right layout runs after each
 * node so the parent of the node under the crosshairs is always directly left,
 * which is what makes following an edge left a reliable "climb to parent".
 */
import {keys} from './driver.mjs';

const SHIFTED = {
  '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
};

export async function typeLabel(page, text) {
  let shift = false;
  const setShift = async on => {
    if (on === shift) return;
    await page.keyboard[on ? 'down' : 'up']('Shift');
    shift = on;
    await page.waitForTimeout(70);
  };
  for (const ch of text) {
    const upper = /[A-Z]/.test(ch);
    const shifted = ch in SHIFTED;
    await setShift(upper || shifted);
    await page.keyboard.press(upper ? ch.toLowerCase() : shifted ? SHIFTED[ch] : ch);
    await page.waitForTimeout(16);
  }
  await setShift(false);
}

/** Node labels currently drawn on the canvas. The oracle for every step. */
export function labels(page) {
  return page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const found = [];
    const walk = group => {
      if (!group || !group.children) return;
      for (const child of group.children) {
        const text = child.attrs && child.attrs.text;
        if (typeof text === 'string' && text.trim() && text !== '■') found.push(text);
        walk(child);
      }
    };
    walk(component.drawingLayer);
    return found;
  });
}

/** The mode chip is the cheapest reliable read of what the app is doing. */
export const mode = page => page.evaluate(() => document.querySelector('.mode-chip')?.textContent?.trim() ?? '');

/** Layout and the camera commands both animate; the app must be still before
 *  the next keystroke reads positions or a frame is taken. */
export const settle = (page, ms = 700) => page.waitForTimeout(ms);

export async function layout(page) {
  await keys(page, '[b l]');
  await settle(page, 800);
}

/** Edges as [source label, destination label] — the oracle for the build. */
export function edges(page) {
  return page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const text = node => {
      if (!node) return '?';
      const label = node.label;
      if (!label) return '?';
      return typeof label === 'string' ? label : (label.text ? label.text() : label.attrs && label.attrs.text) ?? '?';
    };
    return component.drawingLayer.getDAEdges().map(edge => [text(edge.srcNode), text(edge.destNode)]);
  });
}

/** Climb to the parent by following the incoming edge — semantic, not spatial,
 *  so it stays right however the layout arranges things. */
export async function climb(page) {
  await keys(page, '[f h]');
  await settle(page, 350);
}

export const undo = page => keys(page, 'u');

/** Zoom percentage as the header reports it. */
export const zoom = page => page.evaluate(() => {
  const match = document.body.innerText.match(/(\d+)%/);
  return match ? Number(match[1]) : 100;
});

/** Recenter view: zooms out until the whole graph fits. */
export async function fit(page) {
  await keys(page, '[r p]');
  await settle(page, 850);
}

/** Zoom in or out until the level is near `target`, recentring as we go. */
export async function zoomTo(page, target = 100) {
  let changed = false;
  for (let step = 0; step < 5; step++) {
    const level = await zoom(page);
    if (level >= target * 0.7 && level <= target * 1.45) break;
    await keys(page, level < target ? '[r i]' : '[r o]');
    await settle(page, 300);
    changed = true;
  }
  if (changed) {
    await keys(page, '[r u]');
    await settle(page, 550);
  }
}

/**
 * Put the crosshairs on a node and frame it.
 *
 * Fitting the graph first matters: the crosshairs cannot be moved outside the
 * viewport, so a node that has scrolled off screen is unreachable until the
 * camera pulls back far enough to show it.
 */
export async function focus(page, label, target = 100) {
  if (!(await goTo(page, label))) {
    await fit(page);
    if (!(await goTo(page, label))) throw new Error(`cannot reach ${JSON.stringify(label)}`);
  }
  await keys(page, '[r u]');
  await settle(page, 520);
  await zoomTo(page, target);
}

/**
 * Put the crosshairs on a node by label.
 *
 * This is the one piece of the build that is not a key press: it calls the same
 * `moveCrosshairsBy` the movement keys call, with the delta worked out for you.
 * A person would press hjkl until they got there; a capture run of a hundred
 * nodes cannot afford to guess. Everything that shows up in a frame — adding,
 * typing, laying out, moving the camera — is still driven by real keys.
 */
export async function goTo(page, text) {
  const result = await page.evaluate(label => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const read = node => {
      const value = node.label;
      if (!value) return '';
      return typeof value === 'string' ? value : (value.text ? value.text() : value.attrs && value.attrs.text) ?? '';
    };
    const node = component.drawingLayer.getDANodes().find(candidate => read(candidate) === label);
    if (!node) return {found: false};
    const layer = component.crosshairsLayer;
    const box = node.group.getClientRect({relativeTo: component.stage});
    const centre = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    const stage = component.stage;
    // The crosshairs cannot leave the viewport, so an off-screen node needs the
    // camera pulled back before this can work at all.
    const margin = 40;
    const onScreen = centre.x > margin && centre.y > margin &&
      centre.x < stage.width() - margin && centre.y < stage.height() - margin;
    if (!onScreen) return {found: true, onScreen: false};
    component.moveCrosshairsBy(centre.x - layer.crosshairsX(), centre.y - layer.crosshairsY());
    component.refreshCrosshairHoverHighlight();
    return {found: true, onScreen: true};
  }, text);
  if (!result.found) throw new Error(`no node labelled ${JSON.stringify(text)}`);
  if (!result.onScreen) return false;
  await settle(page, 220);
  return true;
}

export async function seed(page, text) {
  await keys(page, 'a');
  await typeLabel(page, text);
  await keys(page, 'Escape Escape');
}

/** Ghost placements to try, in order. Which one is free depends on what the
 *  layout has already put around the parent, so the caller just takes the
 *  first that yields a new node joined to it. */
const PLACEMENTS = ['j', 'k', 'l', 'o j', 'o k', 'o l', 'j j', 'k k', 'o o j', 'o o k'];

/** How many nodes and edges the graph holds — the rollback oracle. */
export function counts(page) {
  return page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    return {
      nodes: component.drawingLayer.getDANodes().length,
      edges: component.drawingLayer.getDAEdges().length,
    };
  });
}

/**
 * Grow a child from the node under the crosshairs.
 *
 * Which ghost the new box lands on does not matter — the layout pass decides
 * that. What matters is that the press produced a *new node connected to the
 * parent*, so each placement is checked and rolled back if it drew an edge to
 * something that already existed, or left a box floating on its own.
 */
export async function grow(page, text, {parent, refocus, placements = PLACEMENTS} = {}) {
  const before = await counts(page);
  for (const [attempt, placement] of placements.entries()) {
    // Undoing a failed placement leaves the crosshairs somewhere else, so the
    // parent has to be picked up again before the next try.
    if (attempt > 0 && refocus) await refocus();
    await keys(page, `[a d ${placement}]`);
    await settle(page, 150);
    // A new node opens label edit; landing on an existing node just draws an
    // edge and leaves us in normal mode.
    if (/edit/.test(await mode(page))) {
      await typeLabel(page, text);
      await keys(page, 'Escape Escape');
      await settle(page, 150);
      const drawn = await edges(page);
      if (!parent || drawn.some(([from, to]) => from === parent && to === text)) return placement;
      if (process.env.CAPTURE_DEBUG) console.log(`  ! ${text} via ${placement}: ${JSON.stringify(drawn)}`);
    }
    await rollBack(page, before);
  }
  throw new Error(`could not grow ${JSON.stringify(text)} from ${JSON.stringify(parent)}`);
}

/** Undo until the graph is the size it was, so a failed placement leaves no
 *  debris — a half-undone label still counts as a node. */
async function rollBack(page, before) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const now = await counts(page);
    if (now.nodes <= before.nodes && now.edges <= before.edges) return;
    await undo(page);
    await settle(page, 120);
  }
  throw new Error('could not undo a failed placement');
}
