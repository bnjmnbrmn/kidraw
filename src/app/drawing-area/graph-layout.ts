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

  // Directed BFS to assign levels, recording BFS-spanning-tree parents
  const level = new Map<DANode, number>();
  const bfsParent = new Map<DANode, DANode | null>();
  const queue: DANode[] = [...roots];
  roots.forEach(r => { level.set(r, 0); bfsParent.set(r, null); });
  while (queue.length > 0) {
    const node = queue.shift()!;
    const lvl = level.get(node)!;
    for (const child of children.get(node) ?? []) {
      if (!level.has(child)) {
        level.set(child, lvl + 1);
        bfsParent.set(child, node);
        queue.push(child);
      }
    }
  }

  // Second pass: undirected BFS from already-assigned nodes — reaches cycle nodes
  // that are adjacent to the main tree.
  let undirectedChanged = true;
  while (undirectedChanged) {
    undirectedChanged = false;
    for (const n of allNodes) {
      if (level.has(n)) continue;
      for (const e of edges) {
        if (e.srcNode === n && level.has(e.destNode)) {
          level.set(n, level.get(e.destNode)! + 1);
          bfsParent.set(n, e.destNode);
          undirectedChanged = true;
          break;
        }
        if (e.destNode === n && level.has(e.srcNode)) {
          level.set(n, level.get(e.srcNode)! + 1);
          bfsParent.set(n, e.srcNode);
          undirectedChanged = true;
          break;
        }
      }
    }
  }

  // Final fallback: isolated cycle components get placed beyond the tree's outermost ring
  // rather than at level 0 (which would mix them with true roots and cause cross-edges).
  const maxTreeLevel = level.size > 0 ? Math.max(...Array.from(level.values())) : 0;
  for (const n of allNodes) {
    if (!level.has(n)) {
      level.set(n, maxTreeLevel + 1);
      bfsParent.set(n, null);
    }
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

  // Only use the centre point when there's a single root; otherwise shift every
  // level out by one ring so multiple level-0 nodes don't stack at (cx, cy).
  const hasUniqueCenter = (levels.get(0)?.length ?? 0) === 1;

  // Assign angles to level-0 nodes evenly; then for each subsequent level sort
  // nodes by their parent's angle so children land near their parents rather than
  // potentially on the opposite side of the circle (which causes long cross-edges).
  const nodeAngle = new Map<DANode, number>();
  const level0Nodes = levels.get(0) ?? [];
  level0Nodes.forEach((node, i) => {
    nodeAngle.set(node, level0Nodes.length === 1
      ? -Math.PI / 2
      : (2 * Math.PI * i) / level0Nodes.length - Math.PI / 2);
  });

  const maxLevel = Math.max(...Array.from(levels.keys()));
  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    const nodesAtLevel = [...(levels.get(lvl) ?? [])];
    nodesAtLevel.sort((a, b) => {
      const pa = bfsParent.get(a), pb = bfsParent.get(b);
      const aa = pa && nodeAngle.has(pa) ? nodeAngle.get(pa)! : Infinity;
      const ab = pb && nodeAngle.has(pb) ? nodeAngle.get(pb)! : Infinity;
      return aa - ab;
    });
    levels.set(lvl, nodesAtLevel); // write sorted order back
    nodesAtLevel.forEach((node, i) => {
      nodeAngle.set(node, nodesAtLevel.length === 1
        ? -Math.PI / 2
        : (2 * Math.PI * i) / nodesAtLevel.length - Math.PI / 2);
    });
  }

  const positions: NodePos[] = [];
  for (const [lvl, nodesAtLevel] of levels) {
    const ring = hasUniqueCenter ? lvl : lvl + 1;
    const radius = ring === 0 ? 0 : ring * spacing;
    nodesAtLevel.forEach(node => {
      const angle = nodeAngle.get(node)!;
      positions.push({ node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });
  }
  return positions;
}
