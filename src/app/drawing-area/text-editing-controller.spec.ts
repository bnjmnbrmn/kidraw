import {DANode} from './da-node';
import {DrawingLayer} from './drawing.layer';
import {TextEditingController, TextEditingHost} from './text-editing-controller';

/** A host with only what the geometry passes touch. */
function hostFor(drawingLayer: DrawingLayer, resizeReflowGap = 16): TextEditingHost {
  return {
    drawingLayer,
    resizeReflowGap,
    getSelectedLabels: () => [],
    getEdgeForLabel: () => null,
    finishTweens: () => {},
    updateEdgesForResizedNodes: () => {},
    refreshLabelEditGhost: () => {},
  } as unknown as TextEditingHost;
}

describe('TextEditingController growth geometry', () => {
  it('grows an edited node about its centre and off its neighbours', () => {
    const drawingLayer = new DrawingLayer();
    const anchorNode = new DANode(400, 400, 'anchor');
    const editing = new DANode(400, 200, 'x');
    drawingLayer.addRawNode(anchorNode);
    drawingLayer.addRawNode(editing);
    const text = new TextEditingController(hostFor(drawingLayer));

    const centre = {
      x: editing.konvaGroup.x() + editing.NODE_WIDTH / 2,
      y: editing.konvaGroup.y() + editing.NODE_HEIGHT / 2,
    };
    // Stand in for what typing does: the box grows from its top-left, far
    // enough to swallow the node below it.
    editing.resizeBy(300);

    text.settleGrowingNodes([editing], new Map([[editing, centre]]));

    const box = (n: DANode) => ({
      x: n.konvaGroup.x(), y: n.konvaGroup.y(), w: n.NODE_WIDTH, h: n.NODE_HEIGHT,
    });
    const a = box(anchorNode), e = box(editing);
    expect(a.x < e.x + e.w && a.x + a.w > e.x && a.y < e.y + e.h && a.y + a.h > e.y)
      .toBeFalse();
    // The anchor is the one that did not move.
    expect(anchorNode.konvaGroup.x()).toBe(400);
    expect(anchorNode.konvaGroup.y()).toBe(400);
  });

  it('leaves a pinned node where it is when it grows', () => {
    const drawingLayer = new DrawingLayer();
    const editing = new DANode(400, 200, 'x');
    editing.pinned = true;
    drawingLayer.addRawNode(editing);
    const text = new TextEditingController(hostFor(drawingLayer));

    const centre = {
      x: editing.konvaGroup.x() + editing.NODE_WIDTH / 2,
      y: editing.konvaGroup.y() + editing.NODE_HEIGHT / 2,
    };
    const before = {x: editing.konvaGroup.x(), y: editing.konvaGroup.y()};
    editing.resizeBy(300);

    text.settleGrowingNodes([editing], new Map([[editing, centre]]));

    expect(editing.konvaGroup.x()).toBe(before.x);
    expect(editing.konvaGroup.y()).toBe(before.y);
  });

  it('records a caret-resized node only when the toggle reports a change', () => {
    const drawingLayer = new DrawingLayer();
    const node = new DANode(100, 100, 'a');
    drawingLayer.addRawNode(node);
    const text = new TextEditingController(hostFor(drawingLayer));
    const resized = new Map<DANode, {x: number; y: number}>();

    text.toggleNodeCaret(node, () => false, resized);
    expect(resized.size).toBe(0);

    text.toggleNodeCaret(node, () => true, resized);
    expect(resized.get(node)).toEqual({
      x: node.konvaGroup.x() + node.NODE_WIDTH / 2,
      y: node.konvaGroup.y() + node.NODE_HEIGHT / 2,
    });
  });
});
