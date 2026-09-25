import {DrawingAreaComponent} from './drawing-area.component';
import {wireDrawingAreaCollaborators} from './drawing-area.test-fixture';

/** setItemColor used to act only on the selection, silently. Hovering a node
 *  and picking a color then either did nothing or recolored a stale
 *  selection elsewhere — and a thin edge restyled at 50% zoom reads as
 *  "color doesn't work". It now falls back to the crosshairs and always
 *  reports what it touched. */
describe('DrawingAreaComponent setItemColor targeting', () => {
  function build(overrides: {
    selectedNodes?: any[];
    selectedEdges?: any[];
    nodesUnderCrosshairs?: any[];
    edgesUnderCrosshairs?: any[];
  } = {}): any {
    const c = Object.create(DrawingAreaComponent.prototype) as any;
    wireDrawingAreaCollaborators(c);
    c.log = {log: () => {}};
    c.daOut = jasmine.createSpyObj('daOut', ['emit']);
    c.drawingLayer = {
      getSelectedDANodes: () => overrides.selectedNodes ?? [],
      getSelectedDAEdges: () => overrides.selectedEdges ?? [],
      nodeColors: () => ({fill: '#fff', stroke: '#000', text: '#000'}),
      edgeColors: () => ({stroke: '#000', fill: '#000'}),
      batchDraw: jasmine.createSpy('batchDraw'),
    };
    c.getDANodesContainingCrosshairs = () => overrides.nodesUnderCrosshairs ?? [];
    c.getDAEdgesContainingCrosshairs = () => overrides.edgesUnderCrosshairs ?? [];
    return c;
  }
  const node = () => ({zIndex: () => 1, setCustomColors: jasmine.createSpy('setCustomColors')});
  const edge = () => ({setCustomColors: jasmine.createSpy('setCustomColors')});
  const lastMessage = (c: any) =>
    c.daOut.emit.calls.allArgs().map((a: any[]) => a[0])
      .filter((n: any) => n.kind === 'status-message').pop()?.message;

  it('colors the selection when there is one', () => {
    const n = node();
    const c = build({selectedNodes: [n]});
    c.style.setItemColor('red');
    expect(n.setCustomColors).toHaveBeenCalled();
    expect(lastMessage(c)).toBe('Red: 1 node');
  });

  it('falls back to the node under the crosshairs', () => {
    const n = node();
    const c = build({nodesUnderCrosshairs: [n]});
    c.style.setItemColor('blue');
    expect(n.setCustomColors).toHaveBeenCalled();
    expect(lastMessage(c)).toBe('Blue: 1 node');
  });

  it('falls back to the edge under the crosshairs when no node is there', () => {
    const e = edge();
    const c = build({edgesUnderCrosshairs: [e]});
    c.style.setItemColor('green');
    expect(e.setCustomColors).toHaveBeenCalled();
    expect(lastMessage(c)).toBe('Green: 1 link');
  });

  it('prefers a node over an edge under the crosshairs', () => {
    const n = node(), e = edge();
    const c = build({nodesUnderCrosshairs: [n], edgesUnderCrosshairs: [e]});
    c.style.setItemColor('orange');
    expect(n.setCustomColors).toHaveBeenCalled();
    expect(e.setCustomColors).not.toHaveBeenCalled();
  });

  it('reports both counts for a mixed selection', () => {
    const c = build({selectedNodes: [node(), node()], selectedEdges: [edge()]});
    c.style.setItemColor('purple');
    expect(lastMessage(c)).toBe('Purple: 2 nodes + 1 link');
  });

  it('lays the chosen colors over the theme, and default clears them', () => {
    const n = node(), e = edge();
    const c = build({selectedNodes: [n], selectedEdges: [e]});
    c.style.setItemColor('red');
    expect(n.setCustomColors.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({stroke: '#cc0000'}));
    c.style.setItemColor('default');
    expect(n.setCustomColors.calls.mostRecent().args[0]).toBeNull();
    expect(e.setCustomColors.calls.mostRecent().args[0]).toBeNull();
  });

  it('says so when nothing is selected or pointed at', () => {
    const c = build();
    c.style.setItemColor('red');
    expect(lastMessage(c)).toBe('Select or point at a node or edge to change color');
  });
});
