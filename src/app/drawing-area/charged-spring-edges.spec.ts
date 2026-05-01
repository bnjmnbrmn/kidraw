import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { applyChargedSpringEdges, DEFAULT_OPTIONS } from './charged-spring-edges';

describe('chargedSpringEdges', () => {
  it('leaves an unobstructed edge approximately straight', () => {
    const a = new DANode(0, 0, 'A');
    const b = new DANode(600, 0, 'B');
    const edge = new DAEdge(a, b, '');

    applyChargedSpringEdges([a, b], [edge]);

    const path = edge.getPathPoints();
    expect(path.length).toBeGreaterThanOrEqual(2);
    const midlineY = a.DEFAULT_NODE_HEIGHT / 2;
    // No obstacles → every point on the path stays close to the y midline.
    path.forEach(p => {
      expect(Math.abs(p.y - midlineY)).toBeLessThan(5);
    });
  });

  it('bends an edge around a node directly between its endpoints', () => {
    // a --(obstacle in the middle)--> b
    const a = new DANode(0, 0, 'A');
    const b = new DANode(800, 0, 'B');
    // Obstacle straddles the straight line at y midline = 60 (for 120px tall nodes)
    const obstacle = new DANode(360, 0, 'X');
    const edge = new DAEdge(a, b, '');

    applyChargedSpringEdges([a, b, obstacle], [edge]);

    const path = edge.getPathPoints();

    // Some point on the path must deviate from the straight line enough to
    // clear the obstacle. The obstacle box is y∈[0,120]; with 16px clearance
    // applied during the sim, the path should leave that band somewhere.
    const cleared = path.some(p => p.y < -8 || p.y > 128);
    expect(cleared).withContext(`path: ${JSON.stringify(path)}`).toBe(true);

    // Sanity: the start endpoint sits on node A's perimeter (x ∈ [0, 120]),
    // the end endpoint on B's perimeter (x ∈ [800, 920]).
    expect(path[0].x).toBeGreaterThanOrEqual(0);
    expect(path[0].x).toBeLessThanOrEqual(120);
    expect(path[path.length - 1].x).toBeGreaterThanOrEqual(800);
    expect(path[path.length - 1].x).toBeLessThanOrEqual(920);

    // No bead should sit inside the obstacle's bounding box.
    edge.controlPoints.forEach(p => {
      const inside = p.x > 355 && p.x < 485 && p.y > -5 && p.y < 125;
      expect(inside).withContext(`bead inside obstacle: ${JSON.stringify(p)}`).toBe(false);
    });
  });

  it('does not modify self-loop edges', () => {
    const a = new DANode(0, 0, 'A');
    const edge = new DAEdge(a, a, '');

    applyChargedSpringEdges([a], [edge]);

    expect(edge.controlPoints.length).toBe(0);
  });

  it('ignores src and dest as obstacles for an edge', () => {
    // If the algorithm treated src as an obstacle, beads would be pushed away
    // from src and the edge would bend inappropriately.
    const a = new DANode(0, 0, 'A');
    const b = new DANode(600, 0, 'B');
    const edge = new DAEdge(a, b, '');

    applyChargedSpringEdges([a, b], [edge]);

    const path = edge.getPathPoints();
    expect(path.length).toBeGreaterThanOrEqual(2);
    const midlineY = a.DEFAULT_NODE_HEIGHT / 2;
    path.forEach(p => {
      expect(Math.abs(p.y - midlineY)).toBeLessThan(5);
    });
  });

  it('respects beadsPerEdge option as the seed count', () => {
    const a = new DANode(0, 0, 'A');
    const b = new DANode(600, 0, 'B');
    const obstacle = new DANode(280, -200, 'X');
    const edge = new DAEdge(a, b, '');

    applyChargedSpringEdges([a, b, obstacle], [edge], {...DEFAULT_OPTIONS, beadsPerEdge: 4, iterations: 50});

    // After pruning the count can only be ≤ seed count.
    expect(edge.controlPoints.length).toBeLessThanOrEqual(4);
  });
});
