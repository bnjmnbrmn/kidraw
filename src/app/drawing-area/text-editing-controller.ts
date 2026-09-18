import type {DrawingLayer} from './drawing.layer';
import type {DANode} from './da-node';
import type {DALabel} from './da-label';
import type {Point} from './utils';
import type {VimChangeMotion} from './command.model';
import {resolveBoxOverlaps} from './overlap-resolution';

/** What a caret motion can be applied to: a node or an edge label. */
export interface CursorTarget {
  moveCursorH(distance: number): void;
  moveCursorV(distance: number): void;
  cursorToLineStart(): void;
  cursorToLineEnd(): void;
  cursorWordForward(): void;
  cursorWordEnd(): void;
  cursorWordBack(): void;
}

export interface TextEditingHost {
  readonly drawingLayer: DrawingLayer;
  readonly resizeReflowGap: number;
  getSelectedLabels(): DALabel[];
  getEdgeForLabel(label: DALabel): {refreshGeometry(): void} | null;
  finishTweens(): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  refreshLabelEditGhost(): void;
}

/** Owns text mutations and the geometry they cause while labels are edited. */
export class TextEditingController {
  constructor(private readonly host: TextEditingHost) {}

  insertChar(key: string): void {
    this.host.finishTweens();
    const centres = this.selectedNodeCentres();
    const resized = this.host.drawingLayer.appendTextToSelected(key);
    this.settleGrowingNodes(resized, centres);
    this.refreshResizedNodes(resized);
    this.editLabels(label => label.insertAtCursor(key));
    this.finishEdit();
  }

  deleteLastChar(): void {
    this.host.finishTweens();
    const resized = this.host.drawingLayer.deleteBeforeCursorFromSelected();
    this.refreshResizedNodes(resized);
    this.editLabels(label => label.deleteBeforeCursor());
    this.finishEdit();
  }

  deleteCharAtCursor(): void {
    this.host.finishTweens();
    const resized = this.host.drawingLayer.deleteAtCursorFromSelected();
    this.refreshResizedNodes(resized);
    this.editLabels(label => label.deleteAtCursor());
    this.finishEdit();
  }

  replaceCharAtCursor(value: string): void {
    this.host.finishTweens();
    const resized = this.host.drawingLayer.getSelectedDANodes()
      .filter(node => node.replaceAtCursor(value));
    this.refreshResizedNodes(resized);
    this.editLabels(label => label.replaceAtCursor(value));
    this.finishEdit();
  }

  changeTextAtCursor(motion: VimChangeMotion): void {
    this.host.finishTweens();
    const resized = this.host.drawingLayer.getSelectedDANodes()
      .filter(node => node.changeAtCursor(motion));
    this.refreshResizedNodes(resized);
    this.editLabels(label => label.changeAtCursor(motion));
    this.finishEdit();
  }

  /** Apply a caret motion to everything being edited (selected nodes and
   *  edge labels). Motions never change geometry — just the caret. */
  moveCursor(motion: (target: CursorTarget) => void): void {
    this.host.drawingLayer.getSelectedDANodes().forEach(motion);
    this.host.getSelectedLabels().forEach(motion);
    this.host.drawingLayer.batchDraw();
    this.host.refreshLabelEditGhost();
  }

  /** Show or hide a node's caret. A markdown label resizes as it switches
   *  between its rendered and source views; record where its centre was.
   *  Showing or hiding the caret never moves the node, so the size read
   *  beforehand gives that centre. */
  toggleNodeCaret(
    node: DANode,
    toggle: () => boolean,
    resized: Map<DANode, Point>,
  ): void {
    const width = node.NODE_WIDTH;
    const height = node.NODE_HEIGHT;
    if (toggle()) resized.set(node, {x: node.group.x() + width / 2, y: node.group.y() + height / 2});
  }

  /** Keep caret-resized nodes on their centres and their edges attached,
   *  the same as when typing grows a node. */
  settleCaretResizes(resized: Map<DANode, Point>): void {
    if (resized.size === 0) return;
    const nodes = [...resized.keys()];
    this.settleGrowingNodes(nodes, resized);
    this.refreshResizedNodes(nodes);
  }

  /** Box centres of the nodes being edited, read before their text changes. */
  selectedNodeCentres(): Map<DANode, Point> {
    return new Map(this.host.drawingLayer.getSelectedDANodes().map(node => [node, {
      x: node.group.x() + node.NODE_WIDTH / 2,
      y: node.group.y() + node.NODE_HEIGHT / 2,
    }]));
  }

  /** Typing grows a box from its top-left corner, so a node walks down and
   *  right over whatever is there — usually the node it was just connected
   *  to (da-446). Two rules keep it out of the way: it grows about its own
   *  centre, and if it still lands on a neighbour it is the one that moves,
   *  not the neighbour. The rest of the graph holds still while you type. */
  settleGrowingNodes(grown: DANode[], centres: Map<DANode, Point>): void {
    if (grown.length === 0) return;
    this.restoreCentres(grown, centres);
    const all = this.host.drawingLayer.getDANodes();
    const movable = new Set(grown);
    const boxes = all.map(node => ({
      x: node.group.x(), y: node.group.y(),
      w: node.NODE_WIDTH, h: node.NODE_HEIGHT,
      movable: movable.has(node) && !node.pinned,
    }));
    for (const i of resolveBoxOverlaps(boxes, this.host.resizeReflowGap)) {
      all[i].group.x(boxes[i].x);
      all[i].group.y(boxes[i].y);
    }
  }

  /** Re-place each grown node on the centre it had before it grew. */
  private restoreCentres(nodes: DANode[], centres: Map<DANode, Point>): void {
    for (const node of nodes) {
      const centre = centres.get(node);
      if (!centre || node.pinned) continue;
      node.group.x(centre.x - node.NODE_WIDTH / 2);
      node.group.y(centre.y - node.NODE_HEIGHT / 2);
    }
  }

  private refreshResizedNodes(nodes: DANode[]): void {
    this.host.updateEdgesForResizedNodes(nodes);
  }

  /** Edit the selected edge labels; re-place each from its anchor so a
   *  growing box keeps its above/below clearance from the line. */
  private editLabels(edit: (label: DALabel) => void): void {
    for (const label of this.host.getSelectedLabels()) {
      edit(label);
      this.host.getEdgeForLabel(label)?.refreshGeometry();
    }
  }

  private finishEdit(): void {
    this.host.drawingLayer.batchDraw();
    this.host.refreshLabelEditGhost();
  }
}
