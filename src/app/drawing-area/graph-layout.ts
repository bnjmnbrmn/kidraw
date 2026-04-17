import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { DAWaypoint } from './da-waypoint';
import { LayoutType } from './command.model';
import { lineSegmentIntersectsRect } from './utils';

interface NodePos {
  node: DANode;
  x: number;
  y: number;
}

export function applyLayout(
  layout: LayoutType,
  nodes: DANode[],
  edges: DAEdge[],
  spacing = 200,
): void {
  const movable = nodes.filter(n => !n.pinned);
  if (movable.length === 0) return;

  let positions: NodePos[];
  switch (layout) {
    case 'force-directed':
      positions = forceDirectedLayout(nodes, edges, movable, spacing);
      break;
    case 'tree-down':
      positions = treeLayout(nodes, edges, movable, spacing, 'down');
      break;
    case 'tree-right':
      positions = treeLayout(nodes, edges, movable, spacing, 'right');
      break;
    case 'grid':
      positions = gridLayout(movable, spacing);
      break;
    case 'circular':
      positions = circularLayout(nodes, edges, movable, spacing);
      break;
    case 'radial':
      positions = radialLayout(nodes, edges, movable, spacing);
      break;
  }

  for (const p of positions) {
    p.node.konvaGroup.x(p.x);
    p.node.konvaGroup.y(p.y);
  }
}

function forceDirectedLayout(
  allNodes: DANode[],
  edges: DAEdge[],
  movable: DANode[],
  spacing: number,
): NodePos[] {
  const movableSet = new Set(movable);

  // Initialize positions from current positions
  const pos = new Map<DANode, { x: number; y: number }>();
  for (const n of allNodes) {
    pos.set(n, { x: n.konvaGroup.x(), y: n.konvaGroup.y() });
  }

  const iterations = 100;
  const repulsion = spacing * spacing * 2;
  const attraction = 0.01;
  const damping = 0.9;

  const vel = new Map<DANode, { vx: number; vy: number }>();
  for (const n of movable) {
    vel.set(n, { vx: 0, vy: 0 });
  }

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations;

    // Repulsion between all node pairs
    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const a = allNodes[i];
        const b = allNodes[j];
        const pa = pos.get(a)!;
        const pb = pos.get(b)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.max(Math.sqrt(distSq), 1);
        const force = repulsion / distSq;
        const fx = (dx / dist) * force * temperature;
        const fy = (dy / dist) * force * temperature;

        if (movableSet.has(a)) {
          const va = vel.get(a)!;
          va.vx += fx;
          va.vy += fy;
        }
        if (movableSet.has(b)) {
          const vb = vel.get(b)!;
          vb.vx -= fx;
          vb.vy -= fy;
        }
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const pa = pos.get(edge.srcNode)!;
      const pb = pos.get(edge.destNode)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = attraction * dist * temperature;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (movableSet.has(edge.srcNode)) {
        const va = vel.get(edge.srcNode)!;
        va.vx += fx;
        va.vy += fy;
      }
      if (movableSet.has(edge.destNode)) {
        const vb = vel.get(edge.destNode)!;
        vb.vx -= fx;
        vb.vy -= fy;
      }
    }

    // Apply velocities
    for (const n of movable) {
      const v = vel.get(n)!;
      const p = pos.get(n)!;
      v.vx *= damping;
      v.vy *= damping;
      p.x += v.vx;
      p.y += v.vy;
    }
  }

  return movable.map(n => ({ node: n, x: pos.get(n)!.x, y: pos.get(n)!.y }));
}

function treeLayout(
  allNodes: DANode[],
  edges: DAEdge[],
  movable: DANode[],
  spacing: number,
  direction: 'down' | 'right',
): NodePos[] {
  const movableSet = new Set(movable);

  // Build adjacency from edges
  const children = new Map<DANode, DANode[]>();
  const incomingCount = new Map<DANode, number>();
  for (const n of allNodes) {
    children.set(n, []);
    incomingCount.set(n, 0);
  }
  for (const e of edges) {
    children.get(e.srcNode)!.push(e.destNode);
    incomingCount.set(e.destNode, (incomingCount.get(e.destNode) ?? 0) + 1);
  }

  // Find roots (no incoming edges)
  const roots = allNodes.filter(n => (incomingCount.get(n) ?? 0) === 0);
  if (roots.length === 0) {
    // Fallback: use all nodes as roots
    roots.push(allNodes[0]);
  }

  // BFS to assign levels
  const level = new Map<DANode, number>();
  const queue: DANode[] = [...roots];
  roots.forEach(r => level.set(r, 0));
  while (queue.length > 0) {
    const node = queue.shift()!;
    const lvl = level.get(node)!;
    for (const child of children.get(node) ?? []) {
      if (!level.has(child)) {
        level.set(child, lvl + 1);
        queue.push(child);
      }
    }
  }

  // Assign unvisited nodes to level 0
  for (const n of allNodes) {
    if (!level.has(n)) level.set(n, 0);
  }

  // Group by level
  const levels = new Map<number, DANode[]>();
  for (const n of allNodes) {
    const lvl = level.get(n)!;
    if (!levels.has(lvl)) levels.set(lvl, []);
    levels.get(lvl)!.push(n);
  }

  // Compute center of all nodes as reference
  let cx = 0, cy = 0;
  for (const n of allNodes) {
    cx += n.konvaGroup.x();
    cy += n.konvaGroup.y();
  }
  cx /= allNodes.length;
  cy /= allNodes.length;

  const positions: NodePos[] = [];
  const maxLevel = Math.max(...Array.from(levels.keys()));

  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const nodesAtLevel = levels.get(lvl) ?? [];
    const count = nodesAtLevel.length;
    for (let i = 0; i < count; i++) {
      const node = nodesAtLevel[i];
      if (!movableSet.has(node)) continue;
      const offset = (i - (count - 1) / 2) * spacing;
      if (direction === 'down') {
        positions.push({ node, x: cx + offset, y: cy - ((maxLevel / 2) - lvl) * spacing });
      } else {
        positions.push({ node, x: cx - ((maxLevel / 2) - lvl) * spacing, y: cy + offset });
      }
    }
  }

  return positions;
}

function gridLayout(movable: DANode[], spacing: number): NodePos[] {
  const cols = Math.ceil(Math.sqrt(movable.length));
  // Center around current average position
  let cx = 0, cy = 0;
  for (const n of movable) {
    cx += n.konvaGroup.x();
    cy += n.konvaGroup.y();
  }
  cx /= movable.length;
  cy /= movable.length;

  const totalW = (cols - 1) * spacing;
  const rows = Math.ceil(movable.length / cols);
  const totalH = (rows - 1) * spacing;

  return movable.map((node, i) => ({
    node,
    x: cx - totalW / 2 + (i % cols) * spacing,
    y: cy - totalH / 2 + Math.floor(i / cols) * spacing,
  }));
}

function circularLayout(
  allNodes: DANode[],
  edges: DAEdge[],
  movable: DANode[],
  spacing: number,
): NodePos[] {
  // Order nodes by graph traversal (BFS from roots) so connected nodes sit near each other
  const children = new Map<DANode, DANode[]>();
  const incomingCount = new Map<DANode, number>();
  for (const n of allNodes) {
    children.set(n, []);
    incomingCount.set(n, 0);
  }
  for (const e of edges) {
    children.get(e.srcNode)!.push(e.destNode);
    incomingCount.set(e.destNode, (incomingCount.get(e.destNode) ?? 0) + 1);
  }

  const roots = allNodes.filter(n => (incomingCount.get(n) ?? 0) === 0);
  const startNodes = roots.length > 0 ? roots : [allNodes[0]];

  const order: DANode[] = [];
  const visited = new Set<DANode>();
  const queue: DANode[] = [...startNodes];
  for (const r of startNodes) visited.add(r);
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const child of children.get(node) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }
  for (const n of allNodes) {
    if (!visited.has(n)) order.push(n);
  }

  const movableSet = new Set(movable);
  const movableOrdered = order.filter(n => movableSet.has(n));

  // Center around average of all nodes
  let cx = 0, cy = 0;
  for (const n of allNodes) {
    cx += n.konvaGroup.x();
    cy += n.konvaGroup.y();
  }
  cx /= allNodes.length;
  cy /= allNodes.length;

  const radius = (spacing * movableOrdered.length) / (2 * Math.PI);
  return movableOrdered.map((node, i) => {
    const angle = (2 * Math.PI * i) / movableOrdered.length - Math.PI / 2;
    return { node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function radialLayout(
  allNodes: DANode[],
  edges: DAEdge[],
  movable: DANode[],
  spacing: number,
): NodePos[] {
  // Build adjacency
  const children = new Map<DANode, DANode[]>();
  const incomingCount = new Map<DANode, number>();
  for (const n of allNodes) {
    children.set(n, []);
    incomingCount.set(n, 0);
  }
  for (const e of edges) {
    children.get(e.srcNode)!.push(e.destNode);
    incomingCount.set(e.destNode, (incomingCount.get(e.destNode) ?? 0) + 1);
  }

  const roots = allNodes.filter(n => (incomingCount.get(n) ?? 0) === 0);
  if (roots.length === 0) roots.push(allNodes[0]);

  // BFS to assign levels
  const level = new Map<DANode, number>();
  const queue: DANode[] = [...roots];
  roots.forEach(r => level.set(r, 0));
  while (queue.length > 0) {
    const node = queue.shift()!;
    const lvl = level.get(node)!;
    for (const child of children.get(node) ?? []) {
      if (!level.has(child)) {
        level.set(child, lvl + 1);
        queue.push(child);
      }
    }
  }
  for (const n of allNodes) {
    if (!level.has(n)) level.set(n, 0);
  }

  // Group movable nodes by level
  const movableSet = new Set(movable);
  const levels = new Map<number, DANode[]>();
  for (const n of movable) {
    const lvl = level.get(n)!;
    if (!levels.has(lvl)) levels.set(lvl, []);
    levels.get(lvl)!.push(n);
  }

  // Center around average of all nodes
  let cx = 0, cy = 0;
  for (const n of allNodes) {
    cx += n.konvaGroup.x();
    cy += n.konvaGroup.y();
  }
  cx /= allNodes.length;
  cy /= allNodes.length;

  const positions: NodePos[] = [];
  for (const [lvl, nodesAtLevel] of levels) {
    const radius = lvl === 0 ? 0 : lvl * spacing;
    const count = nodesAtLevel.length;
    nodesAtLevel.forEach((node, i) => {
      const angle = count === 1 ? -Math.PI / 2 : (2 * Math.PI * i) / count - Math.PI / 2;
      positions.push({ node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Edge routing — adds waypoints so edges avoid intermediate nodes
// ---------------------------------------------------------------------------

interface RoutePoint { x: number; y: number; }

/** After layout, reroute edges around any nodes they pass through.
 *  Clears existing waypoints on each edge and adds bypass waypoints.
 *  Returns the newly created waypoints so the caller can apply colors/visibility. */
export function routeEdgesAroundNodes(
  edges: DAEdge[],
  allNodes: DANode[],
  margin = 20,
): DAWaypoint[] {
  const created: DAWaypoint[] = [];

  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) continue;

    // Clear existing waypoints
    for (const wp of [...edge.waypoints]) {
      edge.removeWaypoint(wp);
    }

    const src = edge.srcNode;
    const dest = edge.destNode;
    const obstacles = allNodes.filter(n => n !== src && n !== dest);
    const p0 = routeNodeCenter(src);
    const p1 = routeNodeCenter(dest);
    const path = routedPath(p0, p1, obstacles, margin);

    for (let i = 1; i < path.length - 1; i++) {
      const wp = new DAWaypoint(path[i].x, path[i].y);
      edge.addWaypoint(wp);
      created.push(wp);
    }
  }

  return created;
}

function routeNodeCenter(node: DANode): RoutePoint {
  return {
    x: node.konvaGroup.x() + node.NODE_WIDTH / 2,
    y: node.konvaGroup.y() + node.NODE_HEIGHT / 2,
  };
}

/** Iteratively inserts bypass points until no segment passes through any obstacle. */
function routedPath(
  p0: RoutePoint, p1: RoutePoint, obstacles: DANode[], margin: number,
): RoutePoint[] {
  let path: RoutePoint[] = [p0, p1];

  for (let iter = 0; iter < 8; iter++) {
    let changed = false;
    const next: RoutePoint[] = [path[0]];

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const blocker = firstBlocker(a, b, obstacles, margin);
      if (blocker) {
        changed = true;
        next.push(bypassPoint(a, b, blocker, obstacles, margin));
      }
      next.push(b);
    }

    path = next;
    if (!changed) break;
  }

  return path;
}

/** Returns the first node (by t-value) whose expanded bounds the segment a→b enters. */
function firstBlocker(
  a: RoutePoint, b: RoutePoint, obstacles: DANode[], margin: number,
): DANode | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let best: DANode | null = null;
  let bestT = Infinity;

  for (const n of obstacles) {
    const minX = n.konvaGroup.x() - margin;
    const minY = n.konvaGroup.y() - margin;
    const maxX = n.konvaGroup.x() + n.NODE_WIDTH + margin;
    const maxY = n.konvaGroup.y() + n.NODE_HEIGHT + margin;
    if (!lineSegmentIntersectsRect(a.x, a.y, b.x, b.y, minX, minY, maxX, maxY)) continue;

    const c = routeNodeCenter(n);
    const t = lenSq > 0 ? ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq : 0;
    if (t < bestT) { bestT = t; best = n; }
  }

  return best;
}

/** Computes a single waypoint that routes segment a→b around the blocker. */
function bypassPoint(
  a: RoutePoint, b: RoutePoint, blocker: DANode, obstacles: DANode[], margin: number,
): RoutePoint {
  const c = routeNodeCenter(blocker);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  // Left-perpendicular unit vector of a→b
  const px = -dy / len, py = dx / len;

  // Signed perpendicular distance from line a→b to blocker center
  const d = (c.x - a.x) * px + (c.y - a.y) * py;

  // Projection of blocker center onto segment (clamped away from endpoints)
  const t = Math.max(0.15, Math.min(0.85, ((c.x - a.x) * dx + (c.y - a.y) * dy) / (len * len)));
  const projX = a.x + t * dx, projY = a.y + t * dy;

  // Clearance: bounding-circle radius of the blocker + margin
  const hd = Math.sqrt((blocker.NODE_WIDTH / 2) ** 2 + (blocker.NODE_HEIGHT / 2) ** 2);
  const offset = Math.abs(d) + hd + margin;

  // Two candidate bypass points — same side as blocker center, and opposite side
  const side = d >= 0 ? 1 : -1;
  const bp1: RoutePoint = { x: projX + side * offset * px, y: projY + side * offset * py };
  const bp2: RoutePoint = { x: projX - side * offset * px, y: projY - side * offset * py };

  const inAny = (pt: RoutePoint) => obstacles.some(n =>
    pt.x >= n.konvaGroup.x() - margin && pt.x <= n.konvaGroup.x() + n.NODE_WIDTH + margin &&
    pt.y >= n.konvaGroup.y() - margin && pt.y <= n.konvaGroup.y() + n.NODE_HEIGHT + margin,
  );

  if (inAny(bp1) && !inAny(bp2)) return bp2;
  if (!inAny(bp1) && inAny(bp2)) return bp1;

  // Both clear (or both blocked): pick shorter total detour
  const pathLen = (pt: RoutePoint) =>
    Math.hypot(pt.x - a.x, pt.y - a.y) + Math.hypot(pt.x - b.x, pt.y - b.y);
  return pathLen(bp1) <= pathLen(bp2) ? bp1 : bp2;
}
