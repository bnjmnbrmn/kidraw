import { CrosshairsHover, CrosshairsHoverHost } from './crosshairs-hover';

/** What the crosshairs are on, item by item; no stage, so no landing ghost
 *  unless a case asks for one. Real traces are left to overlay-freshness and
 *  the drawing-area unit spec, which draw them. */
function setUp(on: {label?: object; waypoint?: object; node?: object; edge?: object}) {
  const host = {
    drawingLayer: {scaleX: () => 1, batchDraw: () => undefined},
    palette: () => ({crosshairsStroke: '#123456', drawingStageBackground: '#000000'}),
    labelUnderCrosshairs: () => on.label ?? null,
    waypointUnderCrosshairs: () => on.waypoint,
    nodeUnderCrosshairs: () => on.node ?? null,
    edgeUnderCrosshairs: () => on.edge ?? null,
    movementDuration: 0.1,
  } as unknown as CrosshairsHoverHost;
  return new CrosshairsHover(host);
}

const label = {id: 'l', x: 50, y: 50, width: 40, height: 20};
const waypoint = {id: 'w', x: 50, y: 50, RADIUS: 4};
const node = {id: 'n', nodeShape: 'box', NODE_WIDTH: 100, NODE_HEIGHT: 50, group: {x: () => 0, y: () => 0}};
const edge = {id: 'e', getRenderedPathPoints: () => [{x: 0, y: 0}, {x: 100, y: 0}]};

describe('CrosshairsHover', () => {
  it('traces what the select key would take, in its order: label, waypoint, node, edge', () => {
    const cases: [object, string | null][] = [
      [{label, waypoint, node, edge}, 'l'],
      [{waypoint, node, edge}, 'w'],
      [{node, edge}, 'n'],
      [{edge}, 'e'],
      [{}, null],
    ];
    for (const [on, id] of cases) {
      const target = setUp(on).target();
      expect(target?.id ?? null).withContext(JSON.stringify(Object.keys(on))).toBe(id);
      if (target) expect(target.trace).not.toBeNull();
    }
  });

  it('traces a circle node with an ellipse, so the outline has the node\'s shape', () => {
    const target = setUp({node: {...node, nodeShape: 'circle'}}).target();
    expect(target?.trace?.getClassName()).toBe('Ellipse');
  });

  it('leaves the trace to the landing ghost for a node that earns one', () => {
    const hover = setUp({node});
    spyOn(hover, 'ghostReasons').and.returnValue(['offscreen']);
    const target = hover.target();
    expect(target?.trace).toBeNull();
    expect(target?.ghostReasons).toEqual(['offscreen']);
  });

  it('waits for the crosshairs to settle before refreshing, and dispose cancels the wait', () => {
    jasmine.clock().install();
    try {
      const hover = setUp({});
      const refresh = spyOn(hover, 'refresh');
      spyOn(hover, 'clear');
      hover.scheduleRefresh();
      jasmine.clock().tick(129);
      expect(refresh).not.toHaveBeenCalled();
      jasmine.clock().tick(1);
      expect(refresh).toHaveBeenCalledTimes(1);

      hover.scheduleRefresh(20);
      hover.dispose();
      jasmine.clock().tick(100);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
