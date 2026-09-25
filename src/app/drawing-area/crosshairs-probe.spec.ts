import {Camera, CameraLayer} from './camera';
import {CrosshairsProbe, ProbeCrosshairs, ProbeLayer} from './crosshairs-probe';
import {DAEdge} from './da-edge';
import {DALabel} from './da-label';
import {DANode} from './da-node';
import {DAWaypoint} from './da-waypoint';

/** A layer at 1:1 with no pan, so layer units and stage pixels agree. */
const camera = (scale = 1) =>
  new Camera(() => ({x: () => 0, y: () => 0, scaleX: () => scale} as CameraLayer));

/** Crosshairs at a point, with a hit box of `size` around it. */
function crosshairsAt(x: number, y: number, size = 4): ProbeCrosshairs {
  return {
    crosshairsX: () => x,
    crosshairsY: () => y,
    crosshairs: {
      hitRadiusX: size, hitRadiusY: size,
      getAbsolutePosition: () => ({x, y}),
      konvaGroup: {getClientRect: () => ({x: x - size, y: y - size, width: size * 2, height: size * 2})},
    },
  };
}

function layer(parts: Partial<ProbeLayer> = {}): ProbeLayer {
  return {
    getDAEdges: () => [],
    getDAWaypoints: () => [],
    getDaNodesContainingPoint: () => [],
    ...parts,
  };
}

describe('CrosshairsProbe', () => {
  it('reports where the crosshairs are, in layer units', () => {
    const probe = new CrosshairsProbe(() => layer(), () => crosshairsAt(120, 80), camera(2));
    expect(probe.position).toEqual({x: 60, y: 40});
  });

  it('reports its hit box and center in layer units', () => {
    const probe = new CrosshairsProbe(() => layer(), () => crosshairsAt(100, 50, 10), camera());
    expect(probe.bounds).toEqual({minX: 90, minY: 40, maxX: 110, maxY: 60, cx: 100, cy: 50});
  });

  it('expresses its reach in layer units, so it grows as you zoom out', () => {
    const at = () => crosshairsAt(0, 0, 8);
    expect(new CrosshairsProbe(() => layer(), at, camera(1)).reach).toBe(8);
    expect(new CrosshairsProbe(() => layer(), at, camera(4)).reach).toBe(2);
    expect(new CrosshairsProbe(() => layer(), at, camera(0.5)).reach).toBe(16);
  });

  it('asks the layer which nodes it stands on', () => {
    const node = new DANode(0, 0, 'n');
    const probe = new CrosshairsProbe(
      () => layer({getDaNodesContainingPoint: () => [node]}), () => crosshairsAt(5, 5), camera());
    expect(probe.nodes()).toEqual([node]);
  });

  it('finds an edge whose path crosses the hit box, and ignores one that misses', () => {
    const near = new DAEdge(new DANode(0, 100, 'a'), new DANode(200, 100, 'b'), '');
    const far = new DAEdge(new DANode(0, 900, 'c'), new DANode(200, 900, 'd'), '');
    // Probe a point the edge actually passes through, rather than assuming
    // where DAEdge chose to route it.
    const on = near.getPathPoints()[0];
    const probe = new CrosshairsProbe(
      () => layer({getDAEdges: () => [near, far]}), () => crosshairsAt(on.x, on.y, 6), camera());
    const found = probe.edges();
    expect(found).toContain(near);
    expect(found).not.toContain(far);
  });

  it('finds a label overlapping the hit box', () => {
    const edge = new DAEdge(new DANode(0, 100, 'a'), new DANode(200, 100, 'b'), '');
    const label = edge.labels[0] as DALabel | undefined;
    if (!label) { pending('sample edge carries no label'); return; }
    const probe = new CrosshairsProbe(
      () => layer({getDAEdges: () => [edge]}),
      () => crosshairsAt(label.x, label.y, 2), camera());
    expect(probe.label()).toBe(label);
  });

  it('returns null when no label is under the crosshairs', () => {
    const edge = new DAEdge(new DANode(0, 100, 'a'), new DANode(200, 100, 'b'), '');
    const probe = new CrosshairsProbe(
      () => layer({getDAEdges: () => [edge]}), () => crosshairsAt(9999, 9999, 2), camera());
    expect(probe.label()).toBeNull();
  });

  it('takes the nearest waypoint within reach, and none beyond it', () => {
    const near = new DAWaypoint(104, 0);
    const nearer = new DAWaypoint(101, 0);
    const beyond = new DAWaypoint(350, 0);
    const probe = new CrosshairsProbe(
      () => layer({getDAWaypoints: () => [near, nearer, beyond]}),
      () => crosshairsAt(100, 0, 4), camera());
    expect(probe.waypoint()).toBe(nearer);
  });

  it('returns undefined when every waypoint is out of reach', () => {
    const probe = new CrosshairsProbe(
      () => layer({getDAWaypoints: () => [new DAWaypoint(380, 0)]}),
      () => crosshairsAt(0, 0, 2), camera());
    expect(probe.waypoint()).toBeUndefined();
  });

  it('answers about waypoints without reading the crosshairs when there are none', () => {
    // The hover refresh runs this constantly on graphs that have no
    // waypoints at all; it must not depend on the crosshairs being wired.
    const noCrosshairs = (() => { throw new Error('crosshairs read'); }) as never;
    const probe = new CrosshairsProbe(() => layer(), noCrosshairs, camera());
    expect(probe.waypoint()).toBeUndefined();
  });

  it('has nothing to report over empty canvas', () => {
    const probe = new CrosshairsProbe(() => layer(), () => crosshairsAt(0, 0), camera());
    expect(probe.nodes()).toEqual([]);
    expect(probe.edges()).toEqual([]);
    expect(probe.label()).toBeNull();
    expect(probe.waypoint()).toBeUndefined();
  });
});
