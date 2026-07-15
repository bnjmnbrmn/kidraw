import { DAEdge } from './da-edge';
import { DANode } from './da-node';
import {
  applyIncrementalDesiderataV3RouteEdges,
  DEFAULT_OPTIONS,
} from './incremental-desiderata-v3-route-edges';
import { sampleSmoothPath } from './routing-curve';
import { bboxOf, segmentIntersectsBox } from './routing-geometry';

describe('incremental-desiderata-v3 long obstacle bypass', () => {
  it('routes around a spaced column containing more nodes than the waypoint budget', () => {
    const src = new DANode(0, 0, 'source', 'src');
    const dest = new DANode(0, 1600, 'destination', 'dest');
    const obstacles = Array.from({length: DEFAULT_OPTIONS.maxWaypoints + 2}, (_, i) =>
      new DANode(0, 220 + i * 200, `obstacle ${i}`, `obs-${i}`));
    const edge = new DAEdge(src, dest, '', 'long-column');

    const stats = applyIncrementalDesiderataV3RouteEdges(
      [src, dest, ...obstacles], [edge]);

    expect(stats.uncleanEdges).toEqual([]);
    expect(edge.controlPoints.length).toBeGreaterThan(0);
    const curve = sampleSmoothPath(
      edge.getPathPoints(), DEFAULT_OPTIONS.tension, DEFAULT_OPTIONS.stepsPerSegment * 2);
    for (const obstacle of obstacles) {
      const box = bboxOf(obstacle);
      expect(curve.slice(0, -1).some((p, i) =>
        segmentIntersectsBox(p, curve[i + 1], box))).toBeFalse();
    }
  });
});
