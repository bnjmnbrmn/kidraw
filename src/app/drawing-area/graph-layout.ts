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

  // Build adjacency from edges (dedupe parallel edges)
  const children = new Map<DANode, DANode[]>();
  const incomingCount = new Map<DANode, number>();
  for (const n of allNodes) {
    children.set(n, []);
    incomingCount.set(n, 0);
  }
  for (const e of edges) {
    const kids = children.get(e.srcNode)!;
    if (!kids.includes(e.destNode)) {
      kids.push(e.destNode);
      incomingCount.set(e.destNode, (incomingCount.get(e.destNode) ?? 0) + 1);
    }
  }

  // Find roots (no incoming edges)
  const roots = allNodes.filter(n => (incomingCount.get(n) ?? 0) === 0);
  if (roots.length === 0) {
    // Pure cycle: pick an arbitrary entry point
    roots.push(allNodes[0]);
  }

  // Spanning forest via BFS: first discovery wins, so every node gets exactly
  // one tree parent even in a DAG. Layout then places each subtree in its own
  // contiguous breadth interval, which makes tree-edge crossings impossible.
  const treeChildren = new Map<DANode, DANode[]>();
  for (const n of allNodes) treeChildren.set(n, []);
  const visited = new Set<DANode>(roots);
  const queue: DANode[] = [...roots];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const child of children.get(node) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        treeChildren.get(node)!.push(child);
        queue.push(child);
      }
    }
  }

  // Adopt cycle nodes adjacent to the forest (undirected), so cycle members
  // hang off the tree instead of being dumped at level 0.
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of allNodes) {
      if (visited.has(n)) continue;
      for (const e of edges) {
        const nbr = e.srcNode === n && visited.has(e.destNode) ? e.destNode
          : e.destNode === n && visited.has(e.srcNode) ? e.srcNode
          : null;
        if (nbr) {
          visited.add(n);
          treeChildren.get(nbr)!.push(n);
          changed = true;
          break;
        }
      }
    }
  }

  // Anything still unvisited is a disconnected component with no root; treat
  // its first node as an extra root and claim the rest of the component.
  for (const n of allNodes) {
    if (!visited.has(n)) {
      roots.push(n);
      visited.add(n);
      const stack = [n];
      while (stack.length > 0) {
        const m = stack.pop()!;
        for (const c of children.get(m) ?? []) {
          if (!visited.has(c)) {
            visited.add(c);
            treeChildren.get(m)!.push(c);
            stack.push(c);
          }
        }
      }
    }
  }

  // Breadth = the axis siblings spread along (x for tree-down, y for tree-right).
  // Each node claims a slot at least `spacing` wide, more if its box is wider,
  // so long labels don't overlap.
  const slotOf = (n: DANode): number => {
    const rect = n.getClientRect();
    const breadth = direction === 'down' ? rect.width : rect.height;
    return Math.max(spacing, (Number.isFinite(breadth) ? breadth : 0) + spacing / 2);
  };

  // Post-order pass: a subtree's extent is the larger of its own slot and the
  // sum of its children's extents.
  const extent = new Map<DANode, number>();
  const computeExtent = (n: DANode): number => {
    let childSum = 0;
    for (const c of treeChildren.get(n)!) childSum += computeExtent(c);
    const e = Math.max(slotOf(n), childSum);
    extent.set(n, e);
    return e;
  };

  // Pre-order pass: children split the parent's interval left-to-right; the
  // parent is centered on the midpoint of its first and last child.
  const breadthPos = new Map<DANode, number>();
  const depthLevel = new Map<DANode, number>();
  const place = (n: DANode, start: number, lvl: number): void => {
    depthLevel.set(n, lvl);
    const kids = treeChildren.get(n)!;
    if (kids.length === 0) {
      breadthPos.set(n, start + extent.get(n)! / 2);
      return;
    }
    let childSum = 0;
    for (const c of kids) childSum += extent.get(c)!;
    let cursor = start + (extent.get(n)! - childSum) / 2;
    for (const c of kids) {
      place(c, cursor, lvl + 1);
      cursor += extent.get(c)!;
    }
    const first = breadthPos.get(kids[0])!;
    const last = breadthPos.get(kids[kids.length - 1])!;
    breadthPos.set(n, (first + last) / 2);
  };

  for (const r of roots) computeExtent(r);
  const runPlacement = (): void => {
    let treeCursor = 0;
    for (const r of roots) {
      place(r, treeCursor, 0);
      treeCursor += extent.get(r)! + spacing;
    }
  };

  // Crossing reduction: non-tree edges (extra parents, cross-links) cross
  // whatever sits between their endpoints, and sibling order so far is just
  // edge insertion order. Reorder each node's child subtrees — and the roots
  // themselves — by the barycenter of their external connections, so
  // cross-linked subtrees end up adjacent. Extents are order-independent, so
  // only placement needs re-running between sweeps.
  const descendants = new Map<DANode, Set<DANode>>();
  const computeDescendants = (n: DANode): Set<DANode> => {
    const s = new Set<DANode>([n]);
    for (const c of treeChildren.get(n)!) {
      for (const m of computeDescendants(c)) s.add(m);
    }
    descendants.set(n, s);
    return s;
  };
  for (const r of roots) computeDescendants(r);

  const neighbors = new Map<DANode, DANode[]>();
  for (const n of allNodes) neighbors.set(n, []);
  for (const e of edges) {
    if (e.srcNode === e.destNode) continue;
    neighbors.get(e.srcNode)!.push(e.destNode);
    neighbors.get(e.destNode)!.push(e.srcNode);
  }

  // Mean breadth position of everything outside the subtree that connects
  // into it; subtrees with no external links keep their current position.
  const barycenterOf = (subtreeRoot: DANode): number => {
    const inside = descendants.get(subtreeRoot)!;
    let sum = 0, count = 0;
    for (const m of inside) {
      for (const q of neighbors.get(m)!) {
        if (!inside.has(q)) {
          sum += breadthPos.get(q)!;
          count++;
        }
      }
    }
    return count > 0 ? sum / count : breadthPos.get(subtreeRoot)!;
  };

  // Objective: crossings first, total breadth span of edges as tiebreaker.
  // Crossings are counted on straight segments in layout space; span keeps
  // pulling cross-linked subtrees together even when no single swap removes
  // a whole crossing. The 1e9 weight makes one crossing outrank any span.
  const layoutScore = (): number => {
    let span = 0;
    const segs: { a: DANode; b: DANode; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const e of edges) {
      if (e.srcNode === e.destNode) continue;
      span += Math.abs(breadthPos.get(e.srcNode)! - breadthPos.get(e.destNode)!);
      segs.push({
        a: e.srcNode, b: e.destNode,
        x1: breadthPos.get(e.srcNode)!, y1: depthLevel.get(e.srcNode)!,
        x2: breadthPos.get(e.destNode)!, y2: depthLevel.get(e.destNode)!,
      });
    }
    const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
      (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    let crossings = 0;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const s = segs[i], t = segs[j];
        if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;
        const d1 = orient(t.x1, t.y1, t.x2, t.y2, s.x1, s.y1);
        const d2 = orient(t.x1, t.y1, t.x2, t.y2, s.x2, s.y2);
        const d3 = orient(s.x1, s.y1, s.x2, s.y2, t.x1, t.y1);
        const d4 = orient(s.x1, s.y1, s.x2, s.y2, t.x2, t.y2);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) crossings++;
      }
    }
    // An edge running through (or grazing) an unrelated node's slot is as bad
    // as a crossing — and it's also where the crossing count goes degenerate,
    // so without this term the optimizer happily trades crossings for pierces.
    // Depth is in level units, breadth in pixels; scale depth up to compare
    // distances in a roughly isotropic space.
    let pierces = 0;
    const clearance = spacing / 4;
    for (const s of segs) {
      const x1 = s.x1, y1 = s.y1 * spacing, x2 = s.x2, y2 = s.y2 * spacing;
      const len2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
      if (len2 === 0) continue;
      for (const n of allNodes) {
        if (n === s.a || n === s.b) continue;
        const px = breadthPos.get(n)!, py = depthLevel.get(n)! * spacing;
        const t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2;
        if (t <= 0 || t >= 1) continue;
        const ddx = px - (x1 + t * (x2 - x1)), ddy = py - (y1 + t * (y2 - y1));
        if (ddx * ddx + ddy * ddy < clearance * clearance) pierces++;
      }
    }
    return (crossings + pierces) * 1e9 + span;
  };
  const snapshotOrder = () => ({
    roots: [...roots],
    kids: new Map(Array.from(treeChildren, ([k, v]) => [k, [...v]] as const)),
  });
  const restoreOrder = (s: ReturnType<typeof snapshotOrder>): void => {
    roots.length = 0;
    roots.push(...s.roots);
    for (const [k, v] of s.kids) treeChildren.set(k, [...v]);
  };

  // Barycenter sweeps make the big rearrangements but can oscillate when two
  // subtrees attract each other (each sorts to where the other *was*), so
  // keep the best ordering seen rather than trusting the last sweep.
  runPlacement();
  let bestScore = layoutScore();
  let bestOrder = snapshotOrder();
  const sweeps = 3;
  for (let sweep = 0; sweep < sweeps; sweep++) {
    if (roots.length > 1) {
      roots.sort((a, b) => barycenterOf(a) - barycenterOf(b));
    }
    const stack: DANode[] = [...roots];
    while (stack.length > 0) {
      const n = stack.pop()!;
      const kids = treeChildren.get(n)!;
      if (kids.length > 1) kids.sort((a, b) => barycenterOf(a) - barycenterOf(b));
      stack.push(...kids);
    }
    runPlacement();
    const score = layoutScore();
    if (score < bestScore) {
      bestScore = score;
      bestOrder = snapshotOrder();
    }
  }
  restoreOrder(bestOrder);

  // Re-parenting refinement: a multi-parent node's tree slot came from its
  // BFS discoverer, but hanging its subtree under one of its other parents
  // may remove crossings that no sibling reordering can. Scored like the
  // sibling moves below, so it only ever improves the layout.
  const treeParent = new Map<DANode, DANode>();
  for (const [p, kids] of treeChildren) {
    for (const k of kids) treeParent.set(k, p);
  }
  const parentsOf = new Map<DANode, DANode[]>();
  for (const n of allNodes) parentsOf.set(n, []);
  for (const e of edges) {
    if (e.srcNode === e.destNode) continue;
    const ps = parentsOf.get(e.destNode)!;
    if (!ps.includes(e.srcNode)) ps.push(e.srcNode);
  }
  const inSubtree = (root: DANode, target: DANode): boolean => {
    const stack = [root];
    while (stack.length > 0) {
      const m = stack.pop()!;
      if (m === target) return true;
      stack.push(...treeChildren.get(m)!);
    }
    return false;
  };
  const recomputeExtents = (): void => {
    extent.clear();
    for (const r of roots) computeExtent(r);
  };
  // Each refinement trial costs a placement (O(n)) plus a score (O(E²)).
  // Budget the total so dense graphs degrade to fewer trials instead of
  // freezing the UI; small graphs stay effectively exhaustive.
  let trialsLeft = Math.max(200, Math.floor(
    5e7 / (edges.length * edges.length + allNodes.length + 1)));

  const tryReparenting = (): boolean => {
    let anyMove = false;
    for (const n of allNodes) {
      if (trialsLeft <= 0) break;
      const p = treeParent.get(n);
      if (!p || parentsOf.get(n)!.length < 2) continue;
      for (const q of parentsOf.get(n)!) {
        if (q === p || inSubtree(n, q) || trialsLeft-- <= 0) continue;
        const oldIndex = treeChildren.get(p)!.indexOf(n);
        treeChildren.get(p)!.splice(oldIndex, 1);
        treeChildren.get(q)!.push(n);
        recomputeExtents();
        runPlacement();
        const score = layoutScore();
        if (score + 1e-9 < bestScore) {
          bestScore = score;
          treeParent.set(n, q);
          anyMove = true;
          break;
        }
        treeChildren.get(q)!.pop();
        treeChildren.get(p)!.splice(oldIndex, 0, n);
      }
    }
    // Extents may be stale from a reverted trial regardless of anyMove
    recomputeExtents();
    return anyMove;
  };

  // Greedy refinement: try re-inserting each subtree (and each whole root
  // tree) at every other position in its sibling list, keeping a move only if
  // the score improves. Strictly monotone, so it terminates and cannot undo
  // the barycenter gains; unlike adjacent swaps it can hop a subtree across
  // several siblings even when the intermediate states are worse.
  let improved = true;
  for (let round = 0; improved && round < 10 && trialsLeft > 0; round++) {
    improved = tryReparenting();
    const siblingLists: DANode[][] = [roots, ...Array.from(treeChildren.values())]
      .filter(list => list.length > 1);
    for (const list of siblingLists) {
      for (let from = 0; from < list.length && trialsLeft > 0; from++) {
        let bestTo = -1;
        for (let to = 0; to < list.length; to++) {
          if (to === from || trialsLeft-- <= 0) continue;
          const [moved] = list.splice(from, 1);
          list.splice(to, 0, moved);
          runPlacement();
          const score = layoutScore();
          if (score + 1e-9 < bestScore) {
            bestScore = score;
            bestTo = to;
          }
          // revert to try the next position from the same baseline
          const [back] = list.splice(to, 1);
          list.splice(from, 0, back);
        }
        if (bestTo >= 0) {
          const [moved] = list.splice(from, 1);
          list.splice(bestTo, 0, moved);
          improved = true;
        }
      }
    }
  }
  runPlacement();

  // Depth positions: fixed `lvl * spacing` steps leave almost no corridor
  // between levels once boxes get tall (130px boxes at 200px steps leave
  // 70px), which forces edge routers into detours. Space each pair of
  // adjacent levels by the boxes they actually contain plus half a spacing
  // of clear corridor.
  const levelDepthExtent = new Map<number, number>();
  for (const n of allNodes) {
    const rect = n.getClientRect();
    const ext = direction === 'down' ? rect.height : rect.width;
    const lvl = depthLevel.get(n)!;
    levelDepthExtent.set(lvl, Math.max(
      levelDepthExtent.get(lvl) ?? 0, Number.isFinite(ext) ? ext : 0));
  }
  const depthOf = new Map<number, number>();
  {
    const maxLvl = Math.max(...Array.from(depthLevel.values()));
    let off = 0;
    depthOf.set(0, 0);
    for (let l = 1; l <= maxLvl; l++) {
      off += (levelDepthExtent.get(l - 1) ?? 0) / 2
        + spacing / 2
        + (levelDepthExtent.get(l) ?? 0) / 2;
      depthOf.set(l, off);
    }
  }

  // Convert (breadth, depth) to (x, y) and center the result on the current
  // average position so the layout doesn't jump the viewport. breadthPos and
  // the level line are node centers, but konvaGroup position is the box's
  // top-left corner — shift by half the box so boxes of different sizes end
  // up visually centered on their slots and level lines.
  const laid = new Map<DANode, { x: number; y: number }>();
  for (const n of allNodes) {
    const rect = n.getClientRect();
    const halfW = Number.isFinite(rect.width) ? rect.width / 2 : 0;
    const halfH = Number.isFinite(rect.height) ? rect.height / 2 : 0;
    const b = breadthPos.get(n)!;
    const d = depthOf.get(depthLevel.get(n)!)!;
    laid.set(n, direction === 'down'
      ? { x: b - halfW, y: d - halfH }
      : { x: d - halfW, y: b - halfH });
  }

  let cx = 0, cy = 0, lx = 0, ly = 0;
  for (const n of allNodes) {
    cx += n.konvaGroup.x();
    cy += n.konvaGroup.y();
    lx += laid.get(n)!.x;
    ly += laid.get(n)!.y;
  }
  const dx = cx / allNodes.length - lx / allNodes.length;
  const dy = cy / allNodes.length - ly / allNodes.length;

  const positions: NodePos[] = [];
  for (const n of allNodes) {
    if (!movableSet.has(n)) continue;
    const p = laid.get(n)!;
    positions.push({ node: n, x: p.x + dx, y: p.y + dy });
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
