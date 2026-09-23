import Konva from 'konva';
import { AreaSelect, AreaSelectHost } from './area-select';
import { Axis } from './axis';

/** A node as area select sees it: a box, a shape, and a selection flag. */
function fakeNode(x: number, y: number, shape = 'box') {
  return {
    group: {x: () => x, y: () => y},
    NODE_WIDTH: 40,
    NODE_HEIGHT: 20,
    nodeShape: shape,
    isSelected: false,
  };
}

/** Identity pan and zoom, so stage and layer coordinates coincide; a
 *  viewport of 0–1000 on both axes. */
function setUp(nodes: ReturnType<typeof fakeNode>[], crosshairs = {x: 100, y: 100}) {
  const crosshairsLayer = Object.assign(new Konva.Layer(), {crosshairs});
  const panned: [Axis, number][] = [];
  const host = {
    drawingLayer: {
      getDANodes: () => nodes,
      getDAEdges: () => [],
      batchDraw: () => undefined,
      scaleX: () => 1,
      x: () => 0,
      y: () => 0,
    },
    crosshairsLayer,
    viewport: {minX: 0, minY: 0, maxX: 1000, maxY: 1000},
    crosshairsInLayerCoords: () => ({x: crosshairs.x, y: crosshairs.y}),
    placeCrosshairs: (at: {x: number; y: number}) => Object.assign(crosshairs, at),
    panLayerAlong: (axis: Axis, delta: number) => { if (delta !== 0) panned.push([axis, delta]); },
    stepDistance: () => 50,
    marqueeColor: () => '#ffffff',
    checkAndEmitEditState: jasmine.createSpy('checkAndEmitEditState'),
  } as unknown as AreaSelectHost;
  const marquee = () => crosshairsLayer.findOne('.area-select-marquee');
  return {areaSelect: new AreaSelect(host), host, crosshairs, panned, marquee};
}

describe('AreaSelect', () => {
  it('selects what the box touches as the corner moves, and shows the marquee', () => {
    const near = fakeNode(120, 120);
    const far = fakeNode(400, 400);
    const {areaSelect, marquee} = setUp([near, far]);

    areaSelect.begin();
    expect(areaSelect.active).toBeTrue();
    areaSelect.step(Axis.X, 1);
    areaSelect.step(Axis.Y, 1);

    expect(near.isSelected).toBeTrue();
    expect(far.isSelected).toBeFalse();
    expect(marquee()?.getAttrs()).toEqual(jasmine.objectContaining({x: 100, y: 100, width: 50, height: 50}));
  });

  it('releases what it caught when the box shrinks, but not a selection made before', () => {
    const caught = fakeNode(120, 120);
    const before = fakeNode(125, 125);
    before.isSelected = true;
    const {areaSelect} = setUp([caught, before]);

    areaSelect.begin();
    areaSelect.step(Axis.X, 1);
    areaSelect.step(Axis.Y, 1);
    areaSelect.step(Axis.X, -1);

    expect(caught.isSelected).toBeFalse();
    expect(before.isSelected).toBeTrue();
  });

  it('never selects an invisible node', () => {
    const invisible = fakeNode(120, 120, 'invisible');
    const {areaSelect} = setUp([invisible]);
    areaSelect.begin();
    areaSelect.step(Axis.X, 1);
    areaSelect.step(Axis.Y, 1);
    expect(invisible.isSelected).toBeFalse();
  });

  it('pans the view instead of taking the corner past the edge margin', () => {
    const {areaSelect, crosshairs, panned} = setUp([], {x: 920, y: 500});
    areaSelect.begin();
    areaSelect.step(Axis.X, 1);
    expect(crosshairs.x).toBe(940);
    expect(panned).toEqual([[Axis.X, -30]]);
  });

  it('keeps the selection when it finishes, and takes the marquee down', () => {
    const node = fakeNode(120, 120);
    const {areaSelect, host, marquee} = setUp([node]);
    areaSelect.begin();
    areaSelect.step(Axis.X, 1);
    areaSelect.step(Axis.Y, 1);
    areaSelect.finish();

    expect(areaSelect.active).toBeFalse();
    expect(node.isSelected).toBeTrue();
    expect(marquee()).toBeFalsy();
    expect(host.checkAndEmitEditState).toHaveBeenCalled();
  });
});
