import { DACommandType } from './command.model';
import { DANode } from './da-node';
import { StyleController, StyleHost } from './style-controller';

/** A layer of `nodes`, the given ones targeted. Shape toggling, colour and
 *  the direction cycle are covered through the component, where their
 *  targeting lives (drawing-area.component.*.spec.ts). */
function setUp(nodes: DANode[], targets: DANode[], underCrosshairs: {node?: object; label?: object} = {}) {
  const updated: DANode[][] = [];
  const batchDraw = jasmine.createSpy('batchDraw');
  const host = {
    drawingLayer: {getDANodes: () => nodes, getSelectedDANodes: () => [], batchDraw},
    nodeSizeStep: 20,
    textSizeStep: 2,
    resizeReflowGap: 16,
    targetNodes: () => targets,
    nodeUnderCrosshairs: () => underCrosshairs.node ?? null,
    labelUnderCrosshairs: () => underCrosshairs.label ?? null,
    getSelectedLabels: () => [],
    updateEdgesForResizedNodes: (resized: DANode[]) => updated.push(resized),
    log: () => undefined,
  } as unknown as StyleHost;
  return {style: new StyleController(host), updated, batchDraw};
}

/** A node whose box is its set size, whatever its text. */
function box(x: number, text: string): DANode {
  const node = new DANode(x, 0, text);
  node.textOverflowMode = 'clip';
  return node;
}

/** Whether two nodes' boxes overlap. */
function overlap(a: DANode, b: DANode): boolean {
  return a.group.x() < b.group.x() + b.NODE_WIDTH && b.group.x() < a.group.x() + a.NODE_WIDTH &&
    a.group.y() < b.group.y() + b.NODE_HEIGHT && b.group.y() < a.group.y() + a.NODE_HEIGHT;
}

describe('StyleController', () => {
  it('grows the target node and pushes a neighbour it now overlaps out of the way', () => {
    const grown = box(0, 'grown');
    const neighbour = box(grown.NODE_WIDTH + 20, 'neighbour');
    const {style, updated} = setUp([grown, neighbour], [grown]);
    const width = grown.NODE_WIDTH;
    style.adjustNodeSize(100);
    expect(grown.NODE_WIDTH).toBeGreaterThan(width);
    expect(grown.group.position()).toEqual({x: 0, y: 0});
    expect(overlap(grown, neighbour)).toBeFalse();
    expect(updated).toEqual([[grown, neighbour]]);
  });

  it('leaves a pinned neighbour where it is', () => {
    const grown = box(0, 'grown');
    const pinned = box(grown.NODE_WIDTH + 20, 'pinned');
    pinned.pinned = true;
    const before = pinned.group.position();
    const {style, updated} = setUp([grown, pinned], [grown]);
    style.adjustNodeSize(100);
    expect(pinned.group.position()).toEqual(before);
    expect(updated).toEqual([[grown]]);
  });

  it('does nothing when no target can change size', () => {
    const junction = new DANode(0, 0, '', undefined, undefined, 'junction');
    const {style, updated, batchDraw} = setUp([junction], [junction]);
    style.adjustNodeSize(20);
    expect(updated).toEqual([]);
    expect(batchDraw).not.toHaveBeenCalled();
  });

  it('with nothing selected, resizes the text of the node and the label under the crosshairs', () => {
    const node = jasmine.createSpyObj('node', {adjustLabelFontSizeBy: true});
    const label = jasmine.createSpyObj('label', {adjustFontSizeBy: false});
    const {style, batchDraw} = setUp([], [], {node, label});
    style.adjustTextSize(-2);
    expect(node.adjustLabelFontSizeBy).toHaveBeenCalledWith(-2);
    expect(label.adjustFontSizeBy).toHaveBeenCalledWith(-2);
    expect(batchDraw).toHaveBeenCalled();
  });

  it('takes the size commands by their steps, and the edge defaults', () => {
    const {style} = setUp([], []);
    const nodeSize = spyOn(style, 'adjustNodeSize');
    const textSize = spyOn(style, 'adjustTextSize');
    const commands = style.commands();
    commands[DACommandType.INCREASE_SELECTED_NODE_SIZE]();
    commands[DACommandType.DECREASE_SELECTED_NODE_SIZE]();
    commands[DACommandType.INCREASE_SELECTED_TEXT_SIZE]();
    commands[DACommandType.DECREASE_SELECTED_TEXT_SIZE]();
    commands[DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS]({kind: DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS, directedness: 'undirected'});
    commands[DACommandType.SET_DEFAULT_LINE_STYLE]({kind: DACommandType.SET_DEFAULT_LINE_STYLE, lineStyle: 'dashed'});
    expect(nodeSize.calls.allArgs()).toEqual([[20], [-20]]);
    expect(textSize.calls.allArgs()).toEqual([[2], [-2]]);
    expect(style.defaults).toEqual({nodeShape: 'box', edgeDirectedness: 'undirected', lineStyle: 'dashed'});
  });
});
