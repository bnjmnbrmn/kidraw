import { ClipboardController, ClipboardHost } from './clipboard-controller';
import { DACommandType } from './command.model';

function fakeNode(id: string, text = id) {
  return {id, label: {text: () => text}};
}

type FakeNode = ReturnType<typeof fakeNode>;

/** A graph whose selection and crosshairs are as given. The layer's copy
 *  keeps the nodes asked for and the edges among them; its paste returns
 *  one fresh node per copied one. Real subgraphs, and what a paste looks
 *  like, are left to the browser tests (tools/qa/keys/clipboard-yank-paste.js). */
function setUp(state: {
  selected?: FakeNode[]; underCrosshairs?: FakeNode; edges?: [string, string][];
  selectedEdges?: object[]; selectedWaypoints?: object[]; selectedLabels?: object[]; waypointUnderCrosshairs?: object; labelUnderCrosshairs?: object;
} = {}) {
  const calls: string[] = [];
  const statuses: string[] = [];
  const pasteSubgraph = jasmine.createSpy('pasteSubgraph').and.callFake(
    (sub: {nodes: {id: string}[]}) => sub.nodes.map(node => fakeNode(`${node.id}-copy`)));
  const host = {
    drawingLayer: {
      getSelectedDANodes: () => state.selected ?? [],
      getSelectedDAEdges: () => state.selectedEdges ?? [],
      getSelectedDAWaypoints: () => state.selectedWaypoints ?? [],
      copySubgraphOf: (nodes: FakeNode[]) => {
        if (nodes.length === 0) return null;
        const ids = nodes.map(node => node.id);
        const edges = (state.edges ?? []).filter(([src, dest]) => ids.includes(src) && ids.includes(dest));
        return {nodes: nodes.map(node => ({id: node.id, text: node.label.text()})), edges};
      },
      pasteSubgraph,
      batchDraw: () => calls.push('draw'),
    },
    getSelectedLabels: () => state.selectedLabels ?? [],
    labelUnderCrosshairs: () => state.labelUnderCrosshairs as never,
    waypointUnderCrosshairs: () => state.waypointUnderCrosshairs,
    nodeUnderCrosshairs: () => state.underCrosshairs ?? null,
    crosshairsInLayerCoords: () => ({x: 100, y: 40}),
    deleteSelected: () => calls.push('delete'),
    finishTweens: () => calls.push('finish tweens'),
    updateEdgesForResizedNodes: (nodes: FakeNode[]) => calls.push(`update edges of ${nodes.map(node => node.id)}`),
    checkAndEmitEditState: () => calls.push('edit state'),
    emitStatus: (message: string) => { calls.push('status'); statuses.push(message); },
  } as unknown as ClipboardHost;
  return {clipboard: new ClipboardController(host), calls, statuses, pasteSubgraph};
}

describe('ClipboardController', () => {
  beforeEach(() => spyOn(navigator.clipboard, 'writeText').and.resolveTo());

  it('copies the selection and the edges inside it, and says how much', () => {
    const [a, b] = [fakeNode('a', 'Alpha'), fakeNode('b', 'Beta')];
    const {clipboard, statuses} = setUp({selected: [a, b], edges: [['a', 'b'], ['b', 'elsewhere']]});
    clipboard.copy();
    expect(clipboard.held?.nodes.map(node => node.id)).toEqual(['a', 'b']);
    expect(clipboard.held?.edges.length).toBe(1);
    expect(statuses).toEqual(['Copied 2 nodes and 1 edge.']);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Alpha\n\nBeta');
  });

  it('copies the node under the crosshairs when nothing is selected, the way vim yanks the line you are on', () => {
    const {clipboard, statuses} = setUp({underCrosshairs: fakeNode('a')});
    clipboard.copy();
    expect(clipboard.held?.nodes.map(node => node.id)).toEqual(['a']);
    expect(statuses).toEqual(['Copied 1 node.']);
  });

  it('takes nothing when Delete would act on a waypoint, an edge or a label instead', () => {
    const node = fakeNode('a');
    const cases = [
      {selected: [node], selectedWaypoints: [{}]},
      {underCrosshairs: node, selectedEdges: [{}]},
      {underCrosshairs: node, selectedLabels: [{}]},
      {underCrosshairs: node, waypointUnderCrosshairs: {}},
      {underCrosshairs: node, labelUnderCrosshairs: {}},
    ];
    for (const state of cases) {
      const {clipboard, statuses} = setUp(state);
      clipboard.copy();
      expect(clipboard.held).withContext(JSON.stringify(state)).toBeNull();
      expect(statuses).toEqual(['Nothing to copy.']);
    }
  });

  it('keeps what it held when a copy finds nothing', () => {
    const state: Parameters<typeof setUp>[0] = {selected: [fakeNode('a')]};
    const {clipboard} = setUp(state);
    clipboard.copy();
    state.selected = [];
    clipboard.copy();
    expect(clipboard.held?.nodes.map(node => node.id)).toEqual(['a']);
  });

  it('cuts: copies what Delete is about to remove, deletes, then reports the edit state', () => {
    const {clipboard, calls, statuses} = setUp({selected: [fakeNode('a')]});
    clipboard.cut();
    expect(clipboard.held?.nodes.map(node => node.id)).toEqual(['a']);
    expect(calls).toEqual(['delete', 'status', 'edit state']);
    expect(statuses).toEqual(['Cut 1 node.']);
  });

  it('still deletes a selected edge on cut, holding on to what it had', () => {
    const state: Parameters<typeof setUp>[0] = {selected: [fakeNode('a')]};
    const {clipboard, calls, statuses} = setUp(state);
    clipboard.copy();
    Object.assign(state, {selected: [], selectedEdges: [{}]});
    calls.length = statuses.length = 0;
    clipboard.cut();
    expect(calls).toEqual(['delete', 'status', 'edit state']);
    expect(statuses).toEqual(['Deleted.']);
    expect(clipboard.held?.nodes.map(node => node.id)).toEqual(['a']);
  });

  it('pastes at the crosshairs, fixes the pasted nodes\' edges, and says how many', () => {
    const {clipboard, calls, statuses, pasteSubgraph} = setUp({selected: [fakeNode('a'), fakeNode('b')]});
    clipboard.copy();
    calls.length = statuses.length = 0;
    clipboard.paste();
    expect(pasteSubgraph).toHaveBeenCalledOnceWith(clipboard.held, 100, 40);
    expect(calls).toEqual(['finish tweens', 'update edges of a-copy,b-copy', 'draw', 'edit state', 'status']);
    expect(statuses).toEqual(['Pasted 2 nodes.']);
  });

  it('takes Copy, Cut and Paste from the command table', () => {
    const {clipboard} = setUp();
    const spies = [spyOn(clipboard, 'copy'), spyOn(clipboard, 'cut'), spyOn(clipboard, 'paste')];
    const commands = clipboard.commands();
    commands[DACommandType.COPY_SELECTION]();
    commands[DACommandType.CUT_SELECTION]();
    commands[DACommandType.PASTE_CLIPBOARD]();
    expect(spies.map(spy => spy.calls.count())).toEqual([1, 1, 1]);
  });

  it('says so when there is nothing to paste', () => {
    const {clipboard, statuses, pasteSubgraph} = setUp();
    clipboard.paste();
    expect(pasteSubgraph).not.toHaveBeenCalled();
    expect(statuses).toEqual(['Clipboard is empty.']);
  });
});
