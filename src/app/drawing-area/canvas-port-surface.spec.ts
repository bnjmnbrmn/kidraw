import { CanvasPortHost, CanvasPortSurface } from './canvas-port-surface';

function fakeNode(id: string, x: number, y: number, extra: object = {}) {
  return {
    id, label: {text: () => id.toUpperCase()}, tags: [`kind/${id}`], isSelected: false, pinned: false,
    NODE_WIDTH: 100, NODE_HEIGHT: 50, group: {x: () => x, y: () => y}, agentHighlighted: false,
    setAgentHighlight(on: boolean) { this.agentHighlighted = on; }, ...extra,
  };
}

/** Nodes a (at the origin) and b (far right), one edge a→b labeled "why";
 *  the view is 0..800 × 72..600, at 100%. */
function setUp() {
  const [a, b] = [fakeNode('a', 0, 100), fakeNode('b', 2000, 100)];
  const edge = {id: 'e', srcNode: a, destNode: b, labels: [{label: 'why'}], tags: [], isSelected: false,
    emphasized: false, setEmphasized(on: boolean) { this.emphasized = on; }};
  const batchDraw = jasmine.createSpy('batchDraw');
  const centered: object[] = [];
  const host = {
    drawingLayer: {
      getDANodes: () => [a, b], getDAEdges: () => [edge],
      getSelectedDANodes: () => [a, b].filter(n => n.isSelected), getSelectedDAEdges: () => [],
      scaleX: () => 1, x: () => 0, y: () => 0, diagramType: 'explanation', batchDraw,
    },
    viewport: {minX: 0, maxX: 800, minY: 72, maxY: 600},
    recenterDuration: 0.3,
    nodeUnderCrosshairs: () => b,
    nodeCenter: (node: {id: string}) => ({x: node.id === 'a' ? 50 : 2050, y: 125}),
    finishTweens: () => undefined,
    centerViewOnLayerPoint: (point: object) => centered.push(point),
    viewChangedByUser: jasmine.createSpy('viewChangedByUser'),
  } as unknown as CanvasPortHost;
  return {surface: new CanvasPortSurface(host), a, b, edge, batchDraw, centered};
}

describe('CanvasPortSurface', () => {
  it('reads the graph: nodes with labels and tags, edges with their ends and labels', () => {
    const {surface} = setUp();
    expect(surface.nodes()).toEqual([
      {id: 'a', label: 'A', tags: ['kind/a']}, {id: 'b', label: 'B', tags: ['kind/b']}]);
    expect(surface.edges()).toEqual([{id: 'e', from: 'a', to: 'b', labels: ['why'], tags: []}]);
    expect(surface.diagramTypeId()).toBe('explanation');
  });

  it('reads the selection, the node under the crosshairs, the zoom and what is in view', () => {
    const {surface, a} = setUp();
    a.isSelected = true;
    expect(surface.selection()).toEqual({nodeIds: ['a'], edgeIds: [], underCrosshairsId: 'b'});
    expect(surface.zoomPercent()).toBe(100);
    expect(surface.visibleNodeIds()).toEqual(['a']);
  });

  it('points at a node by panning to it, and says when there is no such node', () => {
    const {surface, centered} = setUp();
    expect(surface.focusNode('b')).toBeTrue();
    expect(centered).toEqual([{x: 2050, y: 125}]);
    expect(surface.focusNode('nope')).toBeFalse();
  });

  it('replaces the highlights: nodes get a halo, edges are emphasized', () => {
    const {surface, a, b, edge} = setUp();
    surface.setHighlights(['a', 'e']);
    expect([a.agentHighlighted, b.agentHighlighted, edge.emphasized]).toEqual([true, false, true]);
    surface.setHighlights(['b']);
    expect([a.agentHighlighted, b.agentHighlighted, edge.emphasized]).toEqual([false, true, false]);
  });
});
