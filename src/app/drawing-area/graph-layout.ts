import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { LayoutType } from './command.model';

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
