/**
 * Pure geometry for move-by-graph traversal (see dev-status.md "Move by
 * graph… rework" and notes/plan-keymenu-binding-reorg.md).
 *
 * An edge is a sequence of *stops* ordered by arc-length fraction `t` along
 * its rendered polyline: the source node (t=0), interior pseudo-nodes
 * (labels and user waypoints), and the destination node (t=1). The movement
 * tier filters which interior stops exist: coarse = nodes only, normal =
 * + labels, fine = + waypoints.
 *
 * Edge *candidates* at a node are picked by momentum (angular alignment of
 * the edge's flow with the direction of travel) and cycled in fixed
 * clockwise order starting at 12 o'clock, so a wrong momentum guess costs
 * one keystroke and the cycle order is always visible on screen.
 *
 * All functions are pure; the DrawingArea component adapts DA objects into
 * these primitives.
 */

import {Point, projectPointToPath} from './edge-label-anchor';
import type {GridTier} from './command.model';

export type NavStopKind = 'node' | 'label' | 'waypoint';

export interface NavStop extends Point {
  kind: NavStopKind;
  /** Arc-length fraction along the edge path; 0 = src node, 1 = dest node. */
  t: number;
}

export type LinkCardinalDirection = 'north' | 'east' | 'south' | 'west';

export interface LinkQuadrantCandidate {
  id: string;
  /** Unit direction in which the edge leaves the current node. */
  direction: Point | null;
}

export interface LinkQuadrantMove {
  id: string | null;
  /** True when the directional key points along the already-focused edge. */
  traverse: boolean;
}

const CARDINAL_AXIS: Record<LinkCardinalDirection, Point> = {
  north: {x: 0, y: -1},
  east: {x: 1, y: 0},
  south: {x: 0, y: 1},
  west: {x: -1, y: 0},
};

/** NSEW quadrant containing a direction. Diagonal boundary rays belong to
 *  E/W so the result remains deterministic. */
export function linkQuadrant(direction: Point | null): LinkCardinalDirection | null {
  if (!direction || Math.hypot(direction.x, direction.y) < 1e-9) return null;
  if (Math.abs(direction.x) >= Math.abs(direction.y)) {
    return direction.x >= 0 ? 'east' : 'west';
  }
  return direction.y >= 0 ? 'south' : 'north';
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

/** Pick the link closest to a quadrant's center ray. */
function axisMost(
  candidates: readonly LinkQuadrantCandidate[],
  quadrant: LinkCardinalDirection,
): LinkQuadrantCandidate | null {
  const axis = CARDINAL_AXIS[quadrant];
  return [...candidates]
    .filter(c => linkQuadrant(c.direction) === quadrant)
    .sort((a, b) => dot(b.direction!, axis) - dot(a.direction!, axis))[0] ?? null;
}

/** Quadrant navigation for incident links.
 *
 * With no directional focus, a key chooses the most central edge in that
 * quadrant. With a focus, a perpendicular key walks edge-by-edge in that
 * screen direction inside the current quadrant, then crosses into the
 * requested quadrant at the corner nearest the old one. Pressing the key
 * matching the focused quadrant traverses that edge. */
export function moveLinkQuadrant(
  candidates: readonly LinkQuadrantCandidate[],
  focusedId: string | null,
  requested: LinkCardinalDirection,
): LinkQuadrantMove {
  const focused = focusedId === null ? null : candidates.find(c => c.id === focusedId) ?? null;
  const current = linkQuadrant(focused?.direction ?? null);
  if (!focused || !current) {
    return {id: axisMost(candidates, requested)?.id ?? null, traverse: false};
  }
  if (current === requested) return {id: focused.id, traverse: true};

  const currentAxis = CARDINAL_AXIS[current];
  const requestedAxis = CARDINAL_AXIS[requested];
  const perpendicular = Math.abs(dot(currentAxis, requestedAxis)) < 1e-9;
  if (perpendicular) {
    const focusedProgress = dot(focused.direction!, requestedAxis);
    const next = [...candidates]
      .filter(c => c.id !== focused.id && linkQuadrant(c.direction) === current)
      .map(c => ({candidate: c, delta: dot(c.direction!, requestedAxis) - focusedProgress}))
      .filter(c => c.delta > 1e-9)
      .sort((a, b) => a.delta - b.delta)[0]?.candidate;
    if (next) return {id: next.id, traverse: false};

    // Crossing a corner: W→S chooses the leftmost S link, E→N the
    // rightmost N link, and so on.
    const corner = [...candidates]
      .filter(c => linkQuadrant(c.direction) === requested)
      .sort((a, b) => dot(b.direction!, currentAxis) - dot(a.direction!, currentAxis))[0];
    return {id: corner?.id ?? focused.id, traverse: false};
  }

  return {id: axisMost(candidates, requested)?.id ?? focused.id, traverse: false};
}

const T_EPS = 1e-6;

/** Assemble the tier-filtered stop list for one edge, ordered src → dest.
 *  Label stops carry their own anchored `t`; waypoints are projected onto
 *  the path. Interior stops that project exactly onto an endpoint are
 *  dropped rather than duplicating the node stop. */
export function buildEdgeStops(
  pathPoints: readonly Point[],
  srcCenter: Point,
  destCenter: Point,
  labelStops: ReadonlyArray<{point: Point; t: number}>,
  waypointPoints: readonly Point[],
  tier: GridTier,
): NavStop[] {
  const interior: NavStop[] = [];
  if (tier !== 'coarse') {
    for (const l of labelStops) {
      interior.push({kind: 'label', x: l.point.x, y: l.point.y, t: Math.min(Math.max(l.t, 0), 1)});
    }
  }
  if (tier === 'fine') {
    for (const w of waypointPoints) {
      const proj = projectPointToPath(pathPoints, w);
      if (proj) interior.push({kind: 'waypoint', x: w.x, y: w.y, t: proj.t});
    }
  }
  interior.sort((a, b) => a.t - b.t);
  return [
    {kind: 'node', x: srcCenter.x, y: srcCenter.y, t: 0},
    ...interior.filter(s => s.t > T_EPS && s.t < 1 - T_EPS),
    {kind: 'node', x: destCenter.x, y: destCenter.y, t: 1},
  ];
}

/** Index of the stop within `tolerance` of `pos` (nearest wins), or -1. */
export function nearestStopIndex(stops: readonly NavStop[], pos: Point, tolerance: number): number {
  let best = -1;
  let bestDist = tolerance;
  stops.forEach((s, i) => {
    const d = Math.hypot(s.x - pos.x, s.y - pos.y);
    if (d <= bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** Angle of `dir` measured clockwise from 12 o'clock in screen coordinates
 *  (y grows downward): up = 0, right = π/2, down = π, left = 3π/2.
 *  Range [0, 2π). */
export function clockwiseAngleFromNorth(dir: Point): number {
  const a = Math.atan2(dir.x, -dir.y);
  return a < 0 ? a + 2 * Math.PI : a;
}

/** Unit tangent of the path's flow at one end: leaving the source
 *  (`end: 'src'`) or arriving at the destination (`end: 'dest'`). Skips
 *  degenerate segments; null if the whole path is degenerate.
 *
 *  This is the Q1 "direction metric" — deliberately one small swappable
 *  function (departure tangent today; bearing-to-far-endpoint is the
 *  recorded alternative if gathering/collapse wants it later). */
export function endpointFlowDirection(pathPoints: readonly Point[], end: 'src' | 'dest'): Point | null {
  const n = pathPoints.length;
  if (n < 2) return null;
  if (end === 'src') {
    for (let i = 0; i + 1 < n; i++) {
      const d = unit(pathPoints[i], pathPoints[i + 1]);
      if (d) return d;
    }
  } else {
    for (let i = n - 1; i > 0; i--) {
      const d = unit(pathPoints[i - 1], pathPoints[i]);
      if (d) return d;
    }
  }
  return null;
}

function unit(from: Point, to: Point): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return {x: dx / len, y: dy / len};
}

/** Candidate indices in fixed cycle order: clockwise starting at 12 o'clock.
 *  Degenerate (null) directions sort last, in input order. */
export function clockwiseOrder(dirs: ReadonlyArray<Point | null>): number[] {
  return dirs
    .map((d, i) => ({i, a: d ? clockwiseAngleFromNorth(d) : Number.POSITIVE_INFINITY}))
    .sort((p, q) => p.a - q.a || p.i - q.i)
    .map(p => p.i);
}

/** The entry pick among candidates: best momentum alignment (max dot with
 *  the flow direction), or the first in clockwise order on a cold start
 *  (null momentum). Returns -1 only for an empty candidate list. */
export function pickEntryCandidate(dirs: ReadonlyArray<Point | null>, momentum: Point | null): number {
  if (dirs.length === 0) return -1;
  if (momentum) {
    let best = -1;
    let bestScore = -Infinity;
    dirs.forEach((d, i) => {
      if (!d) return;
      const score = d.x * momentum.x + d.y * momentum.y;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) return best;
  }
  return clockwiseOrder(dirs)[0] ?? -1;
}
