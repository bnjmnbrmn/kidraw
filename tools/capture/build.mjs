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

/**
 * Move the crosshairs somewhere empty, leaving the selection alone.
 *
 * The box a frame is about stays selected — that is what the blue highlight is
 * for — but the crosshairs should not sit on top of its label.
 */
export async function park(page) {
  await page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const stage = component.stage;
    const layer = component.crosshairsLayer;
    const boxes = component.drawingLayer.getDANodes()
      .map(node => node.group.getClientRect({relativeTo: stage}));
    // The keymenu covers the bottom of the stage, so stay above it.
    // Kept well clear of the edges: the view pans to keep the crosshairs on
    // screen, and a park near an edge would slide the frame we just centred.
    const inset = 100;
    const usable = stage.height() - 320;
    const candidates = [];
    for (let x = inset; x <= stage.width() - inset; x += 60) {
      for (let y = inset; y <= Math.max(inset + 20, usable); y += 50) candidates.push({x, y});
    }
    const clearance = point => boxes.reduce((worst, box) => {
      const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
      const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
      return Math.min(worst, Math.hypot(dx, dy));
    }, Infinity);
    const best = candidates.reduce((a, b) => (clearance(b) > clearance(a) ? b : a), candidates[0]);
    component.moveCrosshairsBy(best.x - layer.crosshairsX(), best.y - layer.crosshairsY());
    component.clearCrosshairHoverHighlight(true);
  });
  await settle(page, 220);
}

/** Pan with the camera keys until every box sits above the keymenu. */
export async function frameAbove(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const {top, bottom, height} = await page.evaluate(() => {
      const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
      const stage = component.stage;
      const rects = component.drawingLayer.getDANodes()
        .map(node => node.group.getClientRect({relativeTo: stage}));
      return {
        top: Math.min(...rects.map(r => r.y)),
        bottom: Math.max(...rects.map(r => r.y + r.height)),
        height: stage.height(),
      };
    });
    const floor = height - 300;
    if (top >= 30 && bottom <= floor) return true;
    if (bottom > floor && top > 30) await keys(page, '[r j]');
    else if (top < 30 && bottom < floor) await keys(page, '[r k]');
    else { await keys(page, '[r o]'); await keys(page, '[r p]'); }
    await settle(page, 380);
  }
  return false;
}

/** Zoom percentage as the header reports it. */
export const zoom = page => page.evaluate(() => {
  const match = document.body.innerText.match(/(\d+)%/);
  return match ? Number(match[1]) : 100;
});

/** Recenter view: zooms out until the whole graph fits. */
export async function fit(page) {
  // With something selected, Recenter centres on the selection without changing
  // the zoom; the whole-graph fit only happens with nothing selected.
  await keys(page, 'c');
  await settle(page, 150);
  await keys(page, '[r p]');
  await settle(page, 850);
}

/** Style > Overflow > Fit on the box under the crosshairs: it shrinks to its
 *  text instead of sitting at the default size. */
export async function fitToText(page) {
  await keys(page, '[w [f h]]');
  await settle(page, 380);
}

/**
 * Does this box overlap another one?
 *
 * Boxes are grown into a free slot sized for the default box, but a long label
 * makes a wider one — so "there was room" at placement time is not the same as
 * "there is room now". This is the other half of laying out only when space
 * actually runs out.
 */
export function overlaps(page, label) {
  return page.evaluate(text => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const read = node => {
      const value = node.label;
      return typeof value === 'string' ? value : (value && value.text ? value.text() : '');
    };
    const nodes = component.drawingLayer.getDANodes();
    const subject = nodes.find(node => read(node) === text);
    if (!subject) return false;
    const box = node => node.group.getClientRect({relativeTo: component.drawingLayer});
    const mine = box(subject);
    const pad = 6;
    return nodes.some(other => {
      if (other === subject) return false;
      const theirs = box(other);
      return mine.x < theirs.x + theirs.width + pad &&
        theirs.x < mine.x + mine.width + pad &&
        mine.y < theirs.y + theirs.height + pad &&
        theirs.y < mine.y + mine.height + pad;
    });
  }, label);
}

/** A tap of Select+Drag selects the box under the crosshairs — the blue
 *  highlight that says which box a frame is about. */
export async function select(page) {
  const count = () => page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer.getSelectedDANodes().length);
  // A tap toggles, and a freshly grown box may already be selected, so this
  // checks rather than assuming.
  for (let attempt = 0; attempt < 3; attempt++) {
    const selected = await count();
    if (process.env.CAPTURE_DEBUG) console.log(`    select: ${selected} selected`);
    if (selected === 1) return true;
    await keys(page, selected > 1 ? 'c' : 'v');
    await settle(page, 300);
  }
  return (await count()) === 1;
}

/**
 * Pan so a box sits in the middle of the band the reader can actually see —
 * between the bottom of the header and the top of the keymenu, not the middle
 * of the whole frame.
 */
export async function centreInBand(page, label, onStep) {
  await settle(page, 300);
  for (let attempt = 0; attempt < 10; attempt++) {
    const gap = await page.evaluate(text => {
      const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
      // Measuring mid-tween reads a position the frame will not have.
      component.finishTweens();
      const read = node => {
        const value = node.label;
        return typeof value === 'string' ? value : (value && value.text ? value.text() : '');
      };
      const node = component.drawingLayer.getDANodes().find(candidate => read(candidate) === text);
      if (!node) return null;
      const box = node.group.getClientRect({relativeTo: component.stage});
      const header = document.querySelector('app-header')?.getBoundingClientRect();
      const menu = document.querySelector('app-keymenu')?.getBoundingClientRect();
      const top = header ? header.bottom : 60;
      const bottom = menu ? menu.top : component.stage.height() - 300;
      return {
        dy: (box.y + box.height / 2) - (top + bottom) / 2,
        dx: (box.x + box.width / 2) - component.stage.width() / 2,
      };
    }, label);
    if (!gap) return false;
    if (process.env.CAPTURE_DEBUG) console.log(`    centre ${label}: dy=${Math.round(gap.dy)} dx=${Math.round(gap.dx)}`);
    if (Math.abs(gap.dy) <= 30 && Math.abs(gap.dx) <= 40) return true;
    if (Math.abs(gap.dy) > 30) await keys(page, gap.dy > 0 ? '[r j]' : '[r k]');
    else await keys(page, gap.dx > 0 ? '[r l]' : '[r h]');
    // The pan animates; the caller photographs it on the way.
    if (onStep) await onStep();
    await settle(page, 420);
  }
  return false;
}

/** Zoom in or out until the level is near `target`, recentring as we go. */
export async function zoomTo(page, target = 100, onStep) {
  let changed = false;
  for (let step = 0; step < 5; step++) {
    const level = await zoom(page);
    // A tight window, so every box is framed at the same scale: the zoom
    // ladder steps by about a third, and 0.85-1.2 is wide enough to always
    // contain one of its stops while excluding the stop either side of the
    // target (a run where one box was shot at 200% and the next at 266% reads
    // as the camera lurching).
    if (level >= target * 0.85 && level <= target * 1.2) break;
    await keys(page, level < target ? '[r i]' : '[r o]');
    if (onStep) await onStep();
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
  let landed = await goTo(page, label);
  for (let attempt = 0; !landed && attempt < 3; attempt++) {
    await fit(page);
    // Still off screen: pull back another step and try again.
    if (attempt > 0) {
      await keys(page, '[r o]');
      await settle(page, 420);
    }
    landed = await goTo(page, label);
  }
  if (!landed) throw new Error(`cannot reach ${JSON.stringify(label)}`);
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

/**
 * How long a label takes to type, and in what chunks.
 *
 * A quick typist runs at about eight characters a second, so a frame that shows
 * four more characters should sit on screen for about half a second. Chunks are
 * kept small enough that the label looks like it is being typed rather than
 * pasted, and few enough that a long label does not cost a dozen frames.
 */
export const MS_PER_CHAR = 125;
export function typingChunks(text) {
  return text.length ? Array.from(text) : [text];
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
export async function grow(page, text, {parent, refocus, onStage, placements = PLACEMENTS} = {}) {
  const before = await counts(page);
  for (const [attempt, placement] of placements.entries()) {
    // Undoing a failed placement leaves the crosshairs somewhere else, so the
    // parent has to be picked up again before the next try.
    if (attempt > 0 && refocus) await refocus();
    if (onStage) {
      // Same three presses as `[a d <placement>]`, held open long enough to
      // photograph the menu and the dashed targets the reader is being told
      // about.
      await page.keyboard.down('a');
      await settle(page, 320);
      await page.keyboard.press('d');
      await settle(page, 300);
      for (const step of placement.split(' ')) {
        await page.keyboard.press(step);
        await settle(page, 220);
      }
      // Three presses in one frame: hold Add, choose Box, pick a target.
      await onStage('target', {ms: 820});
      await page.keyboard.up('a');
      await settle(page, 260);
    } else {
      await keys(page, `[a d ${placement}]`);
      await settle(page, 150);
    }
    // A new node opens label edit; landing on an existing node just draws an
    // edge and leaves us in normal mode.
    if (/edit/.test(await mode(page))) {
      if (onStage) {
        const chunks = typingChunks(text);
        // Each frame is shown for as long as the next chunk would take to type.
        await onStage('blank', {ms: chunks[0].length * MS_PER_CHAR});
        for (const [index, chunk] of chunks.entries()) {
          await typeLabel(page, chunk);
          const last = index === chunks.length - 1;
          await onStage(last ? 'typed' : 'typing', {
            ms: last ? 420 : chunks[index + 1].length * MS_PER_CHAR,
          });
        }
      } else {
        await typeLabel(page, text);
      }
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

// ---------------------------------------------------------------------------
// Growing a node the way the page shows it: a small empty box that grows as
// the label is typed, then an approximate force layout that lets it find a
// place clear of the nodes and edges already there.
//
// Nothing is laid out globally. Every node that has found its place is pinned,
// and `applyLayout` only moves what is unpinned, so running Force after each
// box moves that box (and, if the caller asks, its siblings) and nothing else.
// ---------------------------------------------------------------------------

/**
 * Put the crosshairs on the node added last, and make sure they landed.
 *
 * Same affordance as `goTo` — the new box has no label to aim at yet — with the
 * same hazard: the crosshairs cannot leave the viewport, so a box the camera
 * has drifted away from cannot be reached, and asking anyway parks them on
 * whatever *is* there. Everything that follows (fit the empty box, open its
 * label, type into it) then happens to the wrong box, which is how a whole
 * label once ended up inside its predecessor. So this checks what it landed on
 * and pulls the camera back before trying again.
 */
export async function goToNewest(page, {dx = 0, dy = 0} = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const landed = await page.evaluate(([dx, dy]) => {
      const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
      // Reading a box mid-tween gives a position it is about to leave, and the
      // crosshairs then land wherever it *was* — often inside a neighbour.
      component.finishTweens();
      const nodes = component.drawingLayer.getDANodes();
      const node = nodes[nodes.length - 1];
      if (!node) return 'missing';
      const stage = component.stage;
      const box = node.group.getClientRect({relativeTo: stage});
      // The aim can be offset within the box: an edge crossing its middle wins
      // the "what is under the crosshairs" contest that decides what an edit
      // opens on, and a different corner of the same box does not.
      const centre = {
        x: box.x + box.width * (0.5 + dx),
        y: box.y + box.height * (0.5 + dy),
      };
      const margin = 40;
      if (centre.x < margin || centre.y < margin ||
          centre.x > stage.width() - margin || centre.y > stage.height() - margin) return 'offscreen';
      const layer = component.crosshairsLayer;
      component.moveCrosshairsBy(centre.x - layer.crosshairsX(), centre.y - layer.crosshairsY());
      component.refreshCrosshairHoverHighlight();
      const under = component.getDANodesContainingCrosshairs
        ? component.getDANodesContainingCrosshairs()
        : [];
      return under.length && !under.includes(node) ? 'missed' : 'ok';
    }, [dx, dy]);
    if (landed === 'missing') throw new Error('there is no new box to go to');
    if (landed === 'ok') {
      await settle(page, 260);
      return true;
    }
    await fit(page);
  }
  throw new Error('cannot put the crosshairs on the new box');
}

/** Labels of the nodes, in creation order — the oracle for "did that press
 *  make a new box, joined to the one I grew it from?" */
export function graphShape(page) {
  return page.evaluate(() => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    const read = node => {
      const value = node.label;
      if (!value) return '';
      return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
    };
    const nodes = component.drawingLayer.getDANodes();
    const index = new Map(nodes.map((node, at) => [node, at]));
    return {
      labels: nodes.map(read),
      edges: component.drawingLayer.getDAEdges()
        .map(edge => [index.get(edge.srcNode) ?? -1, index.get(edge.destNode) ?? -1]),
    };
  });
}

/**
 * Is the box that was just grown clear of the edges already on the canvas?
 *
 * The app refuses a ghost target whose box would land on an existing *node*,
 * but nothing stops one landing on an *edge*. That matters twice over: the page
 * should not show a box sitting on a line, and an edge (or a waypoint) crossing
 * a small box wins the "what is under the crosshairs" contest that decides what
 * `Edit Text` opens, which leaves the label untypable.
 */
export const newBoxIsClear = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  component.finishTweens();
  const layer = component.drawingLayer;
  const nodes = layer.getDANodes();
  const node = nodes[nodes.length - 1];
  if (!node) return false;
  const rect = node.group.getClientRect({relativeTo: layer});
  const pad = 10;
  const inside = point => point.x > rect.x - pad && point.x < rect.x + rect.width + pad &&
    point.y > rect.y - pad && point.y < rect.y + rect.height + pad;
  const toLayer = layer.getAbsoluteTransform().copy().invert();
  for (const edge of layer.getDAEdges()) {
    // Its own arrow reaches the box by definition.
    if (edge.srcNode === node || edge.destNode === node) continue;
    const line = edge._line;
    if (!line) continue;
    const shapeToLayer = point => toLayer.point(line.getAbsoluteTransform().point(point));
    const points = line.points();
    for (let at = 0; at + 3 < points.length; at += 2) {
      const from = shapeToLayer({x: points[at], y: points[at + 1]});
      const to = shapeToLayer({x: points[at + 2], y: points[at + 3]});
      for (let step = 0; step <= 20; step++) {
        const t = step / 20;
        if (inside({x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t})) return false;
      }
    }
    for (const waypoint of edge.waypoints ?? []) {
      if (inside(shapeToLayer({x: waypoint.x, y: waypoint.y}))) return false;
    }
  }
  return true;
});

/** The centre of a node, in drawing-layer coordinates. */
export const nodeCentre = (page, label) => page.evaluate(text => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const read = node => {
    const value = node.label;
    if (!value) return '';
    return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
  };
  const node = component.drawingLayer.getDANodes().find(candidate => read(candidate) === text);
  if (!node) return null;
  const box = node.group.getClientRect({relativeTo: component.drawingLayer});
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}, label);

/** Which spot the held-Add aim is on: a lattice cell, a node, or nothing. */
export const growAim = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  if (component.growTarget) return {kind: 'node'};
  const id = component.growInsertionTarget?.id ?? '';
  const match = /^grow-ghost:grid:(-?\d+):(-?\d+)$/.exec(id);
  return match ? {kind: 'cell', ix: Number(match[1]), iy: Number(match[2])} : {kind: 'none'};
});

/**
 * Rank the spots on offer for where this box should go.
 *
 * The build places every box itself now — there is no layout pass to tidy up
 * after it — so this is where the shape of the diagram is decided. A spot is
 * judged on three things: whether it carries on the way the branch is already
 * heading (`aim`, in radians), whether it sits a comfortable distance out, and
 * how much clear space it leaves against the boxes and the arrows already
 * drawn. The lattice has already refused anything that would land on a node.
 */
export const rankGrowCells = (page, aim, preferred = 300) => page.evaluate(([aim, preferred]) => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const layer = component.drawingLayer;
  const anchor = component.growAnchor;
  if (!anchor) return [];
  const centreOf = node => {
    const box = node.group.getClientRect({relativeTo: layer});
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
  };
  const from = centreOf(anchor);
  const others = layer.getDANodes().filter(node => node !== anchor);
  const boxes = others.map(node => node.group.getClientRect({relativeTo: layer}));
  const toLayer = layer.getAbsoluteTransform().copy().invert();
  const edgePoints = [];
  for (const edge of layer.getDAEdges()) {
    const line = edge._line;
    if (!line) continue;
    const points = line.points();
    for (let at = 0; at + 1 < points.length; at += 2) {
      edgePoints.push(toLayer.point(
        line.getAbsoluteTransform().point({x: points[at], y: points[at + 1]})));
    }
  }
  const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const half = {w: anchor.NODE_WIDTH / 2, h: anchor.NODE_HEIGHT / 2};
  return component.growGhostTargets
    .map(target => {
      const match = /^grow-ghost:grid:(-?\d+):(-?\d+)$/.exec(target.id);
      if (!match) return null;
      const dx = target.x - from.x;
      const dy = target.y - from.y;
      const heading = turn(Math.atan2(dy, dx), aim);
      const distance = Math.hypot(dx, dy);
      // Room around the spot: the gap to the nearest box, and to the nearest
      // point on an arrow. Both are capped — past a screenful they stop being
      // a reason to prefer one spot over another.
      const gapToBox = boxes.reduce((worst, box) => Math.min(worst,
        Math.max(box.x - (target.x + half.w), target.x - half.w - (box.x + box.width),
                 box.y - (target.y + half.h), target.y - half.h - (box.y + box.height))),
        Infinity);
      const gapToEdge = edgePoints.reduce((worst, point) => Math.min(worst,
        Math.max(Math.abs(point.x - target.x) - half.w, Math.abs(point.y - target.y) - half.h)),
        Infinity);
      // Getting there matters as much as being there: the aim walks the
      // lattice cell by cell, and a box sitting on one of those cells takes
      // the aim (that is the connect-two-nodes gesture). A spot behind a
      // neighbour is a spot the walk will not reach.
      const ix = Number(match[1]);
      const iy = Number(match[2]);
      const stepX = ix === 0 ? 0 : (target.x - from.x) / ix;
      const stepY = iy === 0 ? 0 : (target.y - from.y) / iy;
      let blocked = 0;
      for (let step = 1; step <= Math.abs(ix) + Math.abs(iy); step++) {
        const cx = from.x + Math.min(step, Math.abs(ix)) * Math.sign(ix) * Math.abs(stepX || 0);
        const cy = from.y + Math.max(0, step - Math.abs(ix)) * Math.sign(iy) * Math.abs(stepY || 0);
        if (boxes.some(box => cx > box.x - half.w && cx < box.x + box.width + half.w &&
                              cy > box.y - half.h && cy < box.y + box.height + half.h)) blocked++;
      }
      const cost = heading * 2.2
        + Math.abs(distance - preferred) / preferred
        + (gapToBox < 90 ? (90 - Math.max(gapToBox, 0)) / 90 * 2.5 : 0)
        + (gapToEdge < 50 ? (50 - Math.max(gapToEdge, 0)) / 50 * 2 : 0)
        + blocked * 1.5;
      return {ix, iy, cost};
    })
    .filter(Boolean)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 8);
}, [aim, preferred]);

/**
 * Grow a child onto a chosen cell of the placement lattice.
 *
 * Add is held once and the aim walked to the best-scoring spot. Walking is the
 * fiddly part: a node standing in the way takes the aim, because that is the
 * connect-two-nodes gesture, so the walk steps back off it and tries the next
 * spot rather than drawing an edge nobody asked for.
 */
export async function growAtCell(page, {parentIndex, aim = 0, refocus, onStage} = {}) {
  const before = await graphShape(page);
  for (let round = 0; round < 3; round++) {
    if (round > 0 && refocus) await refocus();
    await page.keyboard.down('a');
    await settle(page, 300);
    await page.keyboard.press('d');
    await settle(page, 300);
    const ranked = await rankGrowCells(page, aim);
    let landed = null;
    for (const [attempt, want] of ranked.slice(0, 6).entries()) {
      // The axis order alternates: if a box blocked the way along one, the
      // other way round often walks around it.
      if (await walkToCell(page, want, attempt % 2 === 1)) {
        landed = want;
        break;
      }
      if (process.env.CAPTURE_DEBUG) console.log(`    ~ ${want.ix}:${want.iy} unreachable`);
    }
    // Nothing planned worked out: any spot beats abandoning the box.
    if (!landed) {
      let at = await growAim(page);
      for (const key of ['h', 'j', 'k', 'l']) {
        if (at.kind === 'cell') break;
        await page.keyboard.press(key);
        await settle(page, 220);
        at = await growAim(page);
      }
      if (at.kind === 'cell') landed = at;
    }
    if (landed) {
      if (onStage) await onStage('target', {ms: 820});
      await page.keyboard.up('a');
      await settle(page, 260);
      if (/edit/.test(await mode(page))) {
        const now = await graphShape(page);
        const grown = now.labels.length - 1;
        const joined = now.edges.some(([from, to]) =>
          (from === parentIndex && to === grown) || (to === parentIndex && from === grown));
        if (now.labels.length === before.labels.length + 1 && joined) {
          return {index: grown, cell: landed};
        }
        await keys(page, 'Escape Escape');
        await settle(page, 200);
      }
    } else {
      // Back out without committing: a release on a node draws an edge, and a
      // release on the anchor makes a self-loop.
      await keys(page, 'Escape');
      await settle(page, 200);
      await page.keyboard.up('a');
      await settle(page, 250);
      await keys(page, 'Escape Escape');
    }
    await rollBackTo(page, before);
    console.log(`    ! nothing reachable, round ${round + 1} — offered ` +
      `${ranked.map(spot => `${spot.ix}:${spot.iy}`).join(' ') || 'nothing'}`);
  }
  throw new Error(`could not grow a child of node ${parentIndex}`);
}

/**
 * Step the aim to a cell, one press at a time.
 *
 * A node on the way takes the aim — that is the connect-two-nodes gesture — but
 * the walk carries on through it: the app keeps counting cells from the one the
 * node stands on, so this keeps its own count and presses on. It gives up when
 * a press changes nothing, and the caller tries the next-best spot.
 */
async function walkToCell(page, want, verticalFirst = false) {
  const delta = {l: [1, 0], h: [-1, 0], j: [0, 1], k: [0, -1]};
  let cur = {ix: 0, iy: 0};
  let stalled = 0;
  for (let press = 0; press < 20; press++) {
    const at = await growAim(page);
    if (at.kind === 'cell') {
      if (at.ix === cur.ix && at.iy === cur.iy && press > 0) stalled++;
      else stalled = 0;
      cur = {ix: at.ix, iy: at.iy};
      if (cur.ix === want.ix && cur.iy === want.iy) return true;
    } else if (at.kind === 'none' && press > 0) {
      return false;
    }
    if (stalled > 1) return false;
    const dx = want.ix - cur.ix;
    const dy = want.iy - cur.iy;
    if (!dx && !dy) return at.kind === 'cell';
    const horizontal = verticalFirst
      ? dy === 0
      : (Math.abs(dx) >= Math.abs(dy) ? dx !== 0 : dy === 0);
    const key = horizontal ? (dx > 0 ? 'l' : 'h') : (dy > 0 ? 'j' : 'k');
    await page.keyboard.press(key);
    await settle(page, 220);
    // The app counts from wherever it landed, including from a box it stopped
    // on, so the count carries on either way.
    cur = {ix: cur.ix + delta[key][0], iy: cur.iy + delta[key][1]};
  }
  return false;
}

/** Undo until the graph is the size it was. Edges count as well as nodes: a
 *  placement that landed on an existing box draws an edge without adding a
 *  node, and stopping at the node count would leave that edge behind. */
async function rollBackTo(page, before) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const now = await graphShape(page);
    if (now.labels.length <= before.labels.length && now.edges.length <= before.edges.length) return;
    await undo(page);
    await settle(page, 120);
  }
  throw new Error('could not undo a failed placement');
}

/** Is the box that was just grown the one the editor is on? Typing appends to
 *  the *selection*, so this is the question that matters. */
const editingTheNewBox = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const nodes = component.drawingLayer.getDANodes();
  const selected = component.drawingLayer.getSelectedDANodes();
  return selected.length === 1 && selected[0] === nodes[nodes.length - 1];
});

export async function typeInto(page, text, onChar) {
  // The grow left the label editor open on the new box, in insert mode, with
  // the box selected — which is what typing appends to. Check all three rather
  // than assume: every one of them has been wrong at some point.
  if (await mode(page) !== 'edit') throw new Error(`the label editor is not open (${await mode(page)})`);
  if (!await editingTheNewBox(page)) throw new Error('the label editor is open on something else');
  if (onChar) await onChar(null);
  for (const [index, character] of Array.from(text).entries()) {
    await typeLabel(page, character);
    await settle(page, 60);
    if (onChar) await onChar(index);
  }
  await keys(page, 'Escape Escape');
  await settle(page, 200);
  const {labels: written} = await graphShape(page);
  if (written[written.length - 1] !== text) {
    throw new Error(`typed ${JSON.stringify(text)} but the new box reads ` +
      `${JSON.stringify(written[written.length - 1])} — ${JSON.stringify(await aim(page))}`);
  }
  return true;
}

/** What the app thinks it is pointing at — for the message when it is not what
 *  the build thought. */
export const aim = page => page.evaluate(() => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const read = node => {
    const value = node && node.label;
    if (!value) return '';
    return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
  };
  const containing = component.getDANodesContainingCrosshairs
    ? component.getDANodesContainingCrosshairs().map(read) : ['?'];
  return {
    selected: component.drawingLayer.getSelectedDANodes().map(read),
    under: containing,
    nearest: read(component.nearestNodeToCrosshairs && component.nearestNodeToCrosshairs()),
    newest: read(component.drawingLayer.getDANodes().at(-1)),
  };
});

/** Pin every node, or all but the ones named — what `applyLayout` may move. */
export function pinAll(page, looseIndices = []) {
  return page.evaluate(loose => {
    const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
    component.drawingLayer.getDANodes().forEach((node, index) => {
      node.pinned = !loose.includes(index);
    });
  }, looseIndices);
}

/**
 * Let the new box find its place.
 *
 * Force layout with everything else pinned: the box glides from the slot it was
 * grown into to somewhere clear of the nodes *and* the edges — the "clear"
 * variant adds node-to-edge repulsion — and nothing else on the canvas moves.
 * `onTween` is called while it is moving.
 */
export async function relax(page, {loose, onTween} = {}) {
  await pinAll(page, loose);
  // Layout runs on the selection when there is one, and on the whole diagram
  // when there is not. A selected box would be laid out on its own, with none
  // of the edges or neighbours that decide where it belongs — so clear first.
  await keys(page, 'c');
  await settle(page, 200);
  await keys(page, '[b k]');
  if (onTween) await onTween();
  await settle(page, 900);
}

/** Fit every box to its text. The map's boxes are all sized to their labels
 *  now, and the small demo graphs should not be the odd ones out. */
export async function fitEveryBox(page) {
  for (const name of await labels(page)) {
    if (!name || name === '\u25A0') continue;
    if (!await goTo(page, name)) continue;
    await keys(page, '[w [f h]]');
    await settle(page, 240);
  }
}

/** Whether the box with this label is pinned. */
export const isPinned = (page, label) => page.evaluate(text => {
  const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
  const read = node => {
    const value = node.label;
    if (!value) return '';
    return typeof value === 'string' ? value : (value.text ? value.text() : '') ?? '';
  };
  const node = component.drawingLayer.getDANodes().find(candidate => read(candidate) === text);
  return !!node && !!node.pinned;
}, label);

/**
 * Pin the box that has just found its place, with the key a person would use.
 *
 * By label, not by "the newest node": the layout has just moved the box, which
 * can leave it off screen, and `focus` is the part of the build that knows how
 * to pull the camera back until a named box can be reached. Toggle Pin acts on
 * the selection and toggles, so this checks rather than assumes — a box left
 * unpinned would be moved again by the next box's layout, and the whole point
 * is that one thing moves at a time.
 */
export async function pinBox(page, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isPinned(page, label)) return true;
    // `goTo` leaves the camera alone and says whether it could reach the box;
    // only when the layout has carried it off screen is a camera move needed,
    // and that one is worth making because nothing else can reach it.
    if (!await goTo(page, label)) await focus(page, label, 100);
    await select(page);
    await keys(page, '[v p]');
    await settle(page, 300);
  }
  return isPinned(page, label);
}
