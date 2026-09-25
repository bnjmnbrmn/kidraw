import { DACommandType } from './command.model';
import { GraphSearch, GraphSearchHost } from './graph-search';

function fakeNode(text: string, x = 0) {
  return {label: {text: () => text}, isSelected: false, center: {x, y: 0}};
}

function fakeLabel(label: string, x = 0, y = 0) {
  return {label, x, y, isSelected: false};
}

/** A graph of `nodes`, plus one edge carrying `labels`; the prompt answers
 *  with `answer`. */
function setUp(nodes: ReturnType<typeof fakeNode>[], labels: ReturnType<typeof fakeLabel>[] = [], answer: string | null = 'a') {
  const statuses: string[] = [];
  const centered: {x: number; y: number}[] = [];
  const host = {
    drawingLayer: {
      getDANodes: () => nodes,
      getDAEdges: () => [{labels}],
      unselectAll: () => nodes.forEach(node => node.isSelected = false),
      batchDraw: () => undefined,
    },
    prompt: jasmine.createSpy('prompt').and.callFake(() => answer),
    finishTweens: () => undefined,
    unselectAllLabels: () => labels.forEach(label => label.isSelected = false),
    nodeCenter: (node: ReturnType<typeof fakeNode>) => node.center,
    centerViewOnLayerPoint: (point: {x: number; y: number}) => centered.push(point),
    checkAndEmitEditState: () => undefined,
    emitStatus: (message: string) => statuses.push(message),
  } as unknown as GraphSearchHost;
  return {search: new GraphSearch(host), host, statuses, centered};
}

describe('GraphSearch', () => {
  it('goes to the first match, ignoring case, and says where it is', () => {
    const [alpha, beta] = [fakeNode('Alpha', 10), fakeNode('beta', 20)];
    const {search, statuses, centered} = setUp([alpha, beta], [], ' A ');
    search.open();
    expect(alpha.isSelected).toBeTrue();
    expect(centered).toEqual([{x: 10, y: 0}]);
    expect(statuses).toEqual(['Match 1/2: "Alpha"']);
  });

  it('does nothing when the prompt is canceled or left blank', () => {
    const node = fakeNode('alpha');
    for (const answer of [null, '   ']) {
      const {search, statuses} = setUp([node], [], answer);
      search.open();
      expect(node.isSelected).toBeFalse();
      expect(statuses).toEqual([]);
    }
  });

  it('steps through nodes, then edge labels, wrapping both ways', () => {
    const [alpha, beta] = [fakeNode('alpha'), fakeNode('beta')];
    const label = fakeLabel('an edge', 7, 8);
    const {search, statuses, centered} = setUp([alpha, beta], [label]);
    search.open();
    search.step(1);
    search.step(1);
    search.step(-1);
    expect(statuses).toEqual(['Match 1/3: "alpha"', 'Match 2/3: "beta"', 'Match 3/3: "an edge"', 'Match 2/3: "beta"']);
    expect(centered[2]).toEqual({x: 7, y: 8});
  });

  it('recomputes the matches on every step, so edits in between count', () => {
    const [first, second] = [fakeNode('apple'), fakeNode('apricot')];
    const {search, statuses} = setUp([first, second], [], 'ap');
    search.open();
    second.label.text = () => 'zzz';
    search.step(1);
    expect(statuses[1]).toBe('Match 1/1: "apple"');
  });

  it('says so when there is no search yet, or nothing matches', () => {
    const {search, statuses} = setUp([fakeNode('beta')], [], 'zzz');
    search.step(1);
    search.open();
    expect(statuses).toEqual(['No search yet — press / to search.', 'No matches for "zzz"']);
  });

  it('quotes a long match in part', () => {
    const {search, statuses} = setUp([fakeNode('a'.repeat(50))]);
    search.open();
    expect(statuses[0]).toBe(`Match 1/1: "${'a'.repeat(40)}…"`);
  });

  it('brings its own commands', () => {
    const {search, host} = setUp([fakeNode('alpha')]);
    const commands = search.commands();
    commands[DACommandType.SEARCH_GRAPH]();
    expect(host.prompt).toHaveBeenCalled();
    expect(Object.keys(commands).sort()).toEqual(
      [DACommandType.SEARCH_GRAPH, DACommandType.SEARCH_NEXT_MATCH, DACommandType.SEARCH_PREV_MATCH].sort());
  });
});
