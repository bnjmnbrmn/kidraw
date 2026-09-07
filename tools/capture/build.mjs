/**
 * Build a graph in the running KiDraw app with real keystrokes.
 *
 * Every label is typed the way a person types it (Shift held for capitals and
 * shifted punctuation, which is what the label-edit keymenu expects), and every
 * node is grown from its parent onto a chosen cell of the held-Add lattice.
 * Nothing is laid out along the way: where a box goes is decided here, by
 * `rankGrowCells`, and the diagram never rearranges itself under a reader.
 *
 * The gestures a film wants — a key held long enough to read, the crosshairs
 * walked along an arrow — are in `gestures.mjs`.
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
    // The band the reader can see, as the app itself measures it.
    const top = component.viewMinY ? component.viewMinY() : 60;
    const bottom = component.viewMaxY ? component.viewMaxY() : stage.height() - 300;
    // Kept well clear of the band's own edges: the view pans to keep the
    // crosshairs off them, and parking in a far corner — which is where the
    // emptiest point on the canvas is once you are at 400% — moved the box
    // that had just been framed.
    const inset = 90;
    const left = inset;
    const right = Math.max(left + 20, stage.width() - inset);
    const up = top + inset;
    const down = Math.max(up + 20, bottom - inset);
    const middle = {x: (left + right) / 2, y: (up + down) / 2};
    const candidates = [];
    for (let x = left; x <= right; x += 40) {
      for (let y = up; y <= down; y += 36) candidates.push({x, y});
    }
    // Off the arrows as well as off the boxes: whatever the crosshairs come to
    // rest on gets a hover trace, and an edge's is a fat white line drawn the
    // length of it — which, in an overview shot, is a streak across the
    // diagram that nothing explains.
    const wires = [];
    for (const edge of component.drawingLayer.getDAEdges()) {
      const line = edge._line;
      if (!line) continue;
      const points = line.points();
      const at = index => {
        const local = line.getAbsoluteTransform().point({x: points[index], y: points[index + 1]});
        return {x: local.x, y: local.y};
      };
      for (let index = 0; index + 3 < points.length; index += 2) {
        const from = at(index);
        const to = at(index + 2);
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 14));
        for (let step = 0; step <= steps; step++) {
          wires.push({
            x: from.x + ((to.x - from.x) * step) / steps,
            y: from.y + ((to.y - from.y) * step) / steps,
          });
        }
      }
    }
    const clearance = point => {
      let worst = boxes.reduce((least, box) => {
        const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
        const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
        return Math.min(least, Math.hypot(dx, dy));
      }, Infinity);
      for (const wire of wires) {
        worst = Math.min(worst, Math.hypot(wire.x - point.x, wire.y - point.y));
        if (worst < 25) return worst;
      }
      return worst;
    };
    const away = point => Math.hypot(point.x - middle.x, point.y - middle.y);
    // What the crosshairs *hit* is a box of hit radii around them, up to 42 to
    // a side, so its corner reaches sixty-odd pixels — a point forty-five away
    // from an arrow still lights it up. Ask for real room first and settle for
    // less only when the diagram leaves none.
    let pool = candidates;
    for (const floor of [80, 60, 45, 25]) {
      const clear = candidates.filter(point => clearance(point) >= floor);
      if (clear.length) { pool = clear; break; }
    }
    // Nearest to the middle first, and then ask the app rather than trusting
    // the arithmetic: what the crosshairs hit is its own geometry, and the
    // only way to be sure they are on nothing is to put them there and look.
    const ordered = pool.slice().sort((first, second) => away(first) - away(second));
    const hits = () =>
      (component.getDANodesContainingCrosshairs?.() ?? []).length +
      (component.getDAEdgesContainingCrosshairs?.() ?? []).length;
    let best = ordered[0];
    for (const point of ordered.slice(0, 24)) {
      component.moveCrosshairsBy(point.x - layer.crosshairsX(), point.y - layer.crosshairsY());
      best = point;
      if (!hits()) break;
    }
    component.moveCrosshairsBy(best.x - layer.crosshairsX(), best.y - layer.crosshairsY());
    component.clearCrosshairHoverHighlight(true);
  });
  await settle(page, 220);
}

/**
 * Pan with the camera keys until every box sits in the band the reader sees.
 *
 * Measured against the app's own idea of that band, not against the keymenu's
 * element box: the element carries transparent padding above the card it
 * draws, so treating its top as the floor left this nudging the view after
 * every Recenter View — which fits to exactly this band and was therefore
 * already right.
 */
export async function frameAbove(page) {
  let steppedBack = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const view = await page.evaluate(() => {
      const component = window.ng.getComponent(document.querySelector('app-drawing-area'));
      component.finishTweens();
      const stage = component.stage;
      const rects = component.drawingLayer.getDANodes()
        .map(node => node.group.getClientRect({relativeTo: stage}));
      if (!rects.length) return null;
      return {
        top: Math.min(...rects.map(r => r.y)),
        bottom: Math.max(...rects.map(r => r.y + r.height)),
        ceiling: component.viewMinY ? component.viewMinY() : 60,
        floor: component.viewMaxY ? component.viewMaxY() : stage.height() - 300,
      };
    });
    if (!view) return true;
    if (process.env.CAPTURE_DEBUG) {
      console.log(`    frameAbove ${attempt}: top=${Math.round(view.top)} ` +
        `bottom=${Math.round(view.bottom)} band=${Math.round(view.ceiling)}..${Math.round(view.floor)}`);
    }
    // A few pixels either way is not worth a pan the reader can see.
    const slack = 14;
    const band = view.floor - view.ceiling;
    const high = view.top < view.ceiling - slack;
    const low = view.bottom > view.floor + slack;
    if (!high && !low) return true;
    // A pan is a fixed step, so a diagram that nearly fills the band overshoots
    // one edge trying to clear the other — which is how the branch shot ended
    // up with the top box under the header one week and the root behind the
    // keyboard the next. A step back first makes room for the pan to land in.
    // Room for a pan to land in: a press moves a fixed distance, so a diagram
    // within a slack of filling the band cannot clear one edge without
    // breaching the other. Only then is a step back worth the smaller picture.
    const tight = view.bottom - view.top > band - slack * 2;
    if ((high && low) || (tight && steppedBack < 4)) {
      steppedBack++;
      await keys(page, '[r o]');
    } else if (low) {
      await keys(page, '[r j]');
    } else {
      await keys(page, '[r k]');
    }
    await settle(page, 380);
  }
  return false;
}

/** Recenter view: zooms out until the whole graph fits. */
export async function fit(page) {
  // With something selected, Recenter centres on the selection without changing
  // the zoom; the whole-graph fit only happens with nothing selected.
  await keys(page, 'c');
  await settle(page, 150);
  await keys(page, '[r p]');
  await settle(page, 850);
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
 * Half the box a label will end up in, once it is typed and fitted.
 *
 * Mirrors `fit` in da-node: the base width is a maximum a long label wraps at,
 * and the box grows downward from there. Rough is fine — it is used to keep
 * clear of arrows, not to lay anything out.
 */
export function grownHalfExtents(text) {
  const CHAR = 8.5;
  const PADDING = 16;
  const LINE = 19;
  const MAX = 120;
  const natural = text.length * CHAR + PADDING;
  const width = Math.min(MAX, Math.max(50, natural));
  const lines = Math.max(1, Math.ceil(natural / (MAX - PADDING)));
  const height = Math.max(50, lines * LINE + PADDING);
  return {w: width / 2, h: height / 2};
}

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
export const rankGrowCells = (page, aim, preferred = 280, grown = null, outward = null) =>
  page.evaluate(([aim, preferred, grown, outward]) => {
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
  const edgeSegments = [];
  for (const edge of layer.getDAEdges()) {
    const line = edge._line;
    if (!line) continue;
    const points = line.points();
    const path = [];
    for (let at = 0; at + 1 < points.length; at += 2) {
      path.push(toLayer.point(
        line.getAbsoluteTransform().point({x: points[at], y: points[at + 1]})));
    }
    for (let at = 0; at + 1 < path.length; at++) {
      edgeSegments.push([path[at], path[at + 1], edge.srcNode, edge.destNode]);
    }
  }
  // Would the new arrow cross one that is already drawn? Segments sharing an
  // endpoint node do not count: those meet at a box, they do not cross.
  const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const crosses = to => edgeSegments.some(([p, q, src, dest]) => {
    if (src === anchor || dest === anchor) return false;
    return side(from, to, p) !== side(from, to, q) && side(p, q, from) !== side(p, q, to);
  });
  const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // Judge the spot by the box that will *end up* there, not by the empty one
  // that lands: a box is 50px when it is placed and grows with every character
  // typed into it, which is how one came to sit across an arrow it cleared at
  // the moment it was put down.
  const half = grown ?? {w: anchor.NODE_WIDTH / 2, h: anchor.NODE_HEIGHT / 2};
  // How far the anchor already is from the point the branch grew out of. A
  // child belongs further out than its parent: "currently Chrome only" once
  // landed beside the root, four cells back the way it had come, with a long
  // detour of an arrow reaching up to the box it belongs to. Scoring alone
  // could not stop that — a crowded arc costs more than a wrong direction —
  // so this is a refusal, not a preference.
  const away = outward ? Math.hypot(from.x - outward.x, from.y - outward.y) : 0;
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
      // Along the arrows, not just at their corners: a straight arrow's only
      // vertices are at the two boxes it joins, so measuring to those said a
      // box sitting halfway along it was in the clear.
      let gapToEdge = Infinity;
      for (const [p, q] of edgeSegments) {
        const steps = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 12));
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          const x = p.x + (q.x - p.x) * t;
          const y = p.y + (q.y - p.y) * t;
          gapToEdge = Math.min(gapToEdge,
            Math.max(Math.abs(x - target.x) - half.w, Math.abs(y - target.y) - half.h));
        }
      }
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
      const backwards = outward &&
        Math.hypot(target.x - outward.x, target.y - outward.y) < away + 30;
      const cost = heading * 2.2
        + Math.abs(distance - preferred) / preferred
        + (gapToBox < 90 ? (90 - Math.max(gapToBox, 0)) / 90 * 2.5 : 0)
        // Near a line is a preference; *on* one is disqualifying. A spot whose
        // box would cover an arrow (or another box) is taken only if the
        // lattice offers nothing else at all.
        + (gapToEdge < 90 ? (90 - Math.max(gapToEdge, 0)) / 90 * 4 : 0)
        + (gapToEdge < 0 ? 50 : 0)
        + (gapToBox < 0 ? 50 : 0)
        + (crosses({x: target.x, y: target.y}) ? 6 : 0)
        + (backwards ? 40 : 0)
        + blocked * 1.5;
      return {ix, iy, cost};
    })
    .filter(Boolean)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 8);
}, [aim, preferred, grown, outward]);

/**
 * Grow a child onto a chosen cell of the placement lattice.
 *
 * Add is held once and the aim walked to the best-scoring spot. Walking is the
 * fiddly part: a node standing in the way takes the aim, because that is the
 * connect-two-nodes gesture, so the walk steps back off it and tries the next
 * spot rather than drawing an edge nobody asked for.
 */
export async function growAtCell(page, {parentIndex, aim = 0, preferred, grown, outward, refocus,
                                        preferCell, onStage, onAim, onSpoiled, onResume} = {}) {
  const before = await graphShape(page);
  for (let round = 0; round < 3; round++) {
    if (round > 0 && refocus) await refocus();
    await page.keyboard.down('a');
    await settle(page, 300);
    await page.keyboard.press('d');
    await settle(page, 300);
    // A cell found by a rehearsal is walked to directly. Ranking again here
    // would repeat the search on camera, and the search is a walk that tries
    // one spot, finds a neighbour in the way, and backs out to try another —
    // which is not how anyone would say they got there.
    const ranked = round === 0 && preferCell
      ? [preferCell]
      : await rankGrowCells(page, aim, preferred, grown, outward);
    let landed = null;
    if (onAim) await onAim();
    for (const [attempt, want] of ranked.slice(0, 6).entries()) {
      // The axis order alternates: if a box blocked the way along one, the
      // other way round often walks around it.
      if (await walkToCell(page, want, attempt % 2 === 1, onAim)) {
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
        if (onAim) await onAim();
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
        // Undoing a spoilt attempt is not part of the story: a recorder is
        // told to look away until the canvas is back where it started.
        if (onSpoiled) await onSpoiled();
        await keys(page, 'Escape Escape');
        await settle(page, 200);
      }
    } else {
      if (onSpoiled) await onSpoiled();
      // Back out without committing: a release on a node draws an edge, and a
      // release on the anchor makes a self-loop.
      await keys(page, 'Escape');
      await settle(page, 200);
      await page.keyboard.up('a');
      await settle(page, 250);
      await keys(page, 'Escape Escape');
    }
    await rollBackTo(page, before);
    if (onResume) await onResume();
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
async function walkToCell(page, want, verticalFirst = false, onAim) {
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
    if (onAim) await onAim();
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

/**
 * Walk the aim to a spot without putting anything down.
 *
 * The search for a reachable cell is a search: it tries the best-scoring spot,
 * finds a node in the way, backs out and tries the next. Worth doing, not
 * worth filming — so it is done first with the camera off, and the walk that
 * is filmed goes straight there.
 */
export async function findGrowCell(page, {aim = 0, preferred, grown, outward} = {}) {
  await page.keyboard.down('a');
  await settle(page, 300);
  await page.keyboard.press('d');
  await settle(page, 300);
  const ranked = await rankGrowCells(page, aim, preferred, grown, outward);
  let landed = null;
  for (const [attempt, want] of ranked.slice(0, 6).entries()) {
    if (await walkToCell(page, want, attempt % 2 === 1)) {
      landed = want;
      break;
    }
  }
  // Out without committing: a release on a node draws an edge, and a release
  // on the anchor makes a self-loop.
  await keys(page, 'Escape');
  await settle(page, 200);
  await page.keyboard.up('a');
  await settle(page, 250);
  await keys(page, 'Escape Escape');
  await settle(page, 220);
  return landed;
}
