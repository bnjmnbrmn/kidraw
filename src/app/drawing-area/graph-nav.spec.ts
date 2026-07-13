import {
  buildEdgeStops,
  clockwiseAngleFromNorth,
  clockwiseOrder,
  endpointFlowDirection,
  nearestStopIndex,
  pickEntryCandidate,
} from './graph-nav';

describe('graph-nav', () => {
  // A straight horizontal edge from (0,0) to (100,0).
  const straight = [{x: 0, y: 0}, {x: 100, y: 0}];

  describe('buildEdgeStops', () => {
    const src = {x: 0, y: 0};
    const dest = {x: 100, y: 0};
    const label = {point: {x: 50, y: -10}, t: 0.5};
    const waypoint = {x: 25, y: 0};

    it('coarse tier keeps only the endpoint nodes', () => {
      const stops = buildEdgeStops(straight, src, dest, [label], [waypoint], 'coarse');
      expect(stops.map(s => s.kind)).toEqual(['node', 'node']);
      expect(stops[0].t).toBe(0);
      expect(stops[1].t).toBe(1);
    });

    it('normal tier includes labels but not waypoints', () => {
      const stops = buildEdgeStops(straight, src, dest, [label], [waypoint], 'normal');
      expect(stops.map(s => s.kind)).toEqual(['node', 'label', 'node']);
      expect(stops[1].t).toBe(0.5);
      expect(stops[1].y).toBe(-10); // the label's anchored position, not the path point
    });

    it('fine tier includes waypoints, ordered by arc-length t', () => {
      const stops = buildEdgeStops(straight, src, dest, [label], [waypoint], 'fine');
      expect(stops.map(s => s.kind)).toEqual(['node', 'waypoint', 'label', 'node']);
      expect(stops[1].t).toBeCloseTo(0.25, 6);
    });

    it('drops interior stops that sit exactly on an endpoint', () => {
      const stops = buildEdgeStops(straight, src, dest,
        [{point: {x: 0, y: 0}, t: 0}, {point: {x: 100, y: 0}, t: 1}], [], 'normal');
      expect(stops.map(s => s.kind)).toEqual(['node', 'node']);
    });
  });

  describe('nearestStopIndex', () => {
    const stops = buildEdgeStops(straight, {x: 0, y: 0}, {x: 100, y: 0},
      [{point: {x: 50, y: -10}, t: 0.5}], [], 'normal');

    it('finds the stop within tolerance', () => {
      expect(nearestStopIndex(stops, {x: 51, y: -9}, 5)).toBe(1);
    });

    it('returns -1 when nothing is close enough', () => {
      expect(nearestStopIndex(stops, {x: 30, y: 0}, 5)).toBe(-1);
    });

    it('prefers the nearest of several stops in range', () => {
      expect(nearestStopIndex(stops, {x: 10, y: 0}, 1000)).toBe(0);
    });
  });

  describe('clockwiseAngleFromNorth', () => {
    it('measures screen-up as 0 and proceeds clockwise', () => {
      expect(clockwiseAngleFromNorth({x: 0, y: -1})).toBeCloseTo(0, 6);            // up
      expect(clockwiseAngleFromNorth({x: 1, y: 0})).toBeCloseTo(Math.PI / 2, 6);   // right
      expect(clockwiseAngleFromNorth({x: 0, y: 1})).toBeCloseTo(Math.PI, 6);       // down
      expect(clockwiseAngleFromNorth({x: -1, y: 0})).toBeCloseTo(3 * Math.PI / 2, 6); // left
    });
  });

  describe('endpointFlowDirection', () => {
    it('returns the departure tangent at the source', () => {
      const d = endpointFlowDirection([{x: 0, y: 0}, {x: 0, y: 50}, {x: 100, y: 50}], 'src')!;
      expect(d.x).toBeCloseTo(0, 6);
      expect(d.y).toBeCloseTo(1, 6);
    });

    it('returns the arrival tangent at the destination', () => {
      const d = endpointFlowDirection([{x: 0, y: 0}, {x: 0, y: 50}, {x: 100, y: 50}], 'dest')!;
      expect(d.x).toBeCloseTo(1, 6);
      expect(d.y).toBeCloseTo(0, 6);
    });

    it('skips degenerate leading segments', () => {
      const d = endpointFlowDirection([{x: 0, y: 0}, {x: 0, y: 0}, {x: 100, y: 0}], 'src')!;
      expect(d.x).toBeCloseTo(1, 6);
    });

    it('is null for a fully degenerate path', () => {
      expect(endpointFlowDirection([{x: 5, y: 5}, {x: 5, y: 5}], 'src')).toBeNull();
    });
  });

  describe('clockwiseOrder', () => {
    it('orders candidates clockwise starting at 12 o\'clock', () => {
      const dirs = [
        {x: -1, y: 0},  // west  (index 0)
        {x: 0, y: -1},  // north (index 1)
        {x: 0, y: 1},   // south (index 2)
        {x: 1, y: 0},   // east  (index 3)
      ];
      expect(clockwiseOrder(dirs)).toEqual([1, 3, 2, 0]);
    });

    it('sorts degenerate directions last, stable by input order', () => {
      expect(clockwiseOrder([null, {x: 1, y: 0}, null])).toEqual([1, 0, 2]);
    });
  });

  describe('pickEntryCandidate', () => {
    const dirs = [
      {x: 1, y: 0},   // east
      {x: 0, y: 1},   // south
      {x: -1, y: 0},  // west
    ];

    it('picks the best momentum alignment', () => {
      expect(pickEntryCandidate(dirs, {x: -1, y: 0.1})).toBe(2);
      expect(pickEntryCandidate(dirs, {x: 0.7, y: 0.7})).toBe(0);
    });

    it('cold start picks the first clockwise from 12 o\'clock', () => {
      expect(pickEntryCandidate(dirs, null)).toBe(0); // east is nearest clockwise from north
    });

    it('returns -1 only for an empty candidate list', () => {
      expect(pickEntryCandidate([], {x: 1, y: 0})).toBe(-1);
      expect(pickEntryCandidate([null], null)).toBe(0);
    });
  });
});
