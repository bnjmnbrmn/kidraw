/**
 * The drawing area's side of `CanvasPort` (canvas-port.ts): what agent mode
 * and reading mode see of the canvas and may do to it. Read the graph, the
 * selection and the view; point at a node and highlight things, never moving
 * the user's selection; and change the graph through operations, one undo
 * group per batch, never through the keyboard's commands.
 */
import type Konva from 'konva';
import type {
  CanvasPort, CanvasChange, CanvasChangeResult, CanvasEdge, CanvasEditMeta, CanvasNode, ClientRect,
} from '../drawing-area/canvas-port';
import type { DANode } from './da-node';
import type { DrawingLayer } from './drawing.layer';
import type { GraphOperation, UndoGroup } from './graph-operations';
import { nextId } from './id-generator';
import { layeredLayout } from './layered-layout';
import type { Point } from './utils';
import type { Viewport } from './viewport';

/** What the port needs from the drawing area. */
export interface CanvasPortHost {
  readonly drawingLayer: DrawingLayer;
  readonly viewport: Viewport;
  readonly stage: Konva.Stage;
  /** How long the view takes to recenter, in seconds. */
  readonly recenterDuration: number;
  nodeUnderCrosshairs(): DANode | null;
  nodeCenter(node: DANode): Point;
  finishTweens(): void;
  centerViewOnLayerPoint(point: Point): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  /** Apply an undo group all-or-nothing; a conflict message, or null. */
  applyOperations(group: UndoGroup): Promise<string | null>;
  revertChangeSet(changeSetId: string): Promise<string | null>;
  /** The user, not a client of the port, panned or zoomed. */
  viewChangedByUser(): void;
}

export class CanvasPortSurface implements CanvasPort {
  /** Until this time (performance.now()), view changes are the port's own focus animation. */
  private portViewMoveUntil = 0;
  private lastUserViewChangeEmit = 0;

  constructor(private readonly host: CanvasPortHost) {}

  // Read-only inspection plus view guidance. Nothing here mutates the graph
  // or touches the undo stack, until applyChanges.

  nodes(): CanvasNode[] {
    return this.host.drawingLayer.getDANodes().map(node => ({
      id: node.id, label: node.label.text(), tags: [...node.tags],
    }));
  }

  edges(): CanvasEdge[] {
    return this.host.drawingLayer.getDAEdges().map(edge => ({
      id: edge.id,
      from: edge.srcNode.id,
      to: edge.destNode.id,
      labels: edge.labels.map(label => label.label),
      tags: [...edge.tags],
    }));
  }

  selection(): {nodeIds: string[]; edgeIds: string[]; underCrosshairsId: string | null} {
    const layer = this.host.drawingLayer;
    return {
      nodeIds: layer.getSelectedDANodes().map(n => n.id),
      edgeIds: layer.getSelectedDAEdges().map(e => e.id),
      underCrosshairsId: this.host.nodeUnderCrosshairs()?.id ?? null,
    };
  }

  zoomPercent(): number {
    return Math.round(this.host.drawingLayer.scaleX() * 100);
  }

  visibleNodeIds(): string[] {
    const layer = this.host.drawingLayer;
    const scale = layer.scaleX();
    const {minX, maxX, minY, maxY} = this.host.viewport;
    return layer.getDANodes().filter(node => {
      const x = layer.x() + node.group.x() * scale;
      const y = layer.y() + node.group.y() * scale;
      return x + node.NODE_WIDTH * scale > minX && x < maxX && y + node.NODE_HEIGHT * scale > minY && y < maxY;
    }).map(node => node.id);
  }

  /**
   * Tell the shell whenever the user, not the agent, pans or zooms the view,
   * however it happened: pan and zoom keys, crosshairs pushing at the edge,
   * a jump, the mouse. Agent mode uses this to switch to "You lead"; a plain
   * crosshairs move that leaves the view where it is doesn't count.
   */
  watchUserViewChanges(): void {
    this.host.drawingLayer.on('xChange.agentView yChange.agentView scaleXChange.agentView', () => {
      const now = performance.now();
      // A tween changes the view every frame; one notification per burst is plenty.
      if (now < this.portViewMoveUntil || now - this.lastUserViewChangeEmit < 250) return;
      this.lastUserViewChangeEmit = now;
      this.host.viewChangedByUser();
    });
  }

  /** Pan the view onto the node. The agent only points: it never changes the
   *  user's selection, so nothing the user is doing gets redirected. */
  focusNode(id: string): boolean {
    const node = this.host.drawingLayer.getDANodes().find(n => n.id === id);
    if (!node) return false;
    this.portViewMoveUntil = performance.now() + this.host.recenterDuration * 1000 + 150;
    this.host.finishTweens();
    this.host.centerViewOnLayerPoint(this.host.nodeCenter(node));
    this.host.drawingLayer.batchDraw();
    return true;
  }

  diagramTypeId(): string {
    return this.host.drawingLayer.diagramType;
  }

  async applyChanges(changes: CanvasChange[], meta: CanvasEditMeta): Promise<CanvasChangeResult> {
    const planner = await import('./canvas-change-planner');
    return planner.applyCanvasChanges(
      this.host.drawingLayer.serializeGraph(), changes, meta, nextId, group => this.host.applyOperations(group),
      () => this.arrange(meta));
  }

  /** The agent's "arrange": lay the graph out top-down along its links
   *  (layered-layout.ts), as moves in the agent's change set, so undoing its
   *  turn puts the nodes back. Pinned nodes stay where they are. */
  private async arrange(meta: CanvasEditMeta): Promise<string | null> {
    const layer = this.host.drawingLayer;
    const nodes = layer.getDANodes();
    const edges = layer.getDAEdges();
    const positions = layeredLayout(
      nodes.map(node => ({id: node.id, x: node.group.x(), y: node.group.y(), width: node.NODE_WIDTH, height: node.NODE_HEIGHT})),
      edges.map(edge => ({from: edge.srcNode.id, to: edge.destNode.id})),
    );
    const ops: GraphOperation[] = [];
    for (const node of nodes) {
      const to = positions.get(node.id);
      const from = {x: node.group.x(), y: node.group.y()};
      if (!to || node.pinned || (Math.abs(to.x - from.x) < 0.5 && Math.abs(to.y - from.y) < 0.5)) continue;
      ops.push({op: 'update_node', id: node.id, before: from, after: {x: to.x, y: to.y}});
    }
    if (ops.length === 0) return null;
    const conflict = await this.host.applyOperations({
      author: meta.author, label: `${meta.label} (arrange)`, ops, changeSetId: meta.changeSetId,
    });
    // Routes drawn around the old positions would loop around the new ones.
    for (const edge of edges) edge.setControlPoints([]);
    this.host.updateEdgesForResizedNodes(nodes);
    layer.batchDraw();
    return conflict;
  }

  revertChangeSet(changeSetId: string): Promise<string | null> {
    return this.host.revertChangeSet(changeSetId);
  }

  setHighlights(ids: string[]): void {
    const layer = this.host.drawingLayer;
    const wanted = new Set(ids);
    for (const node of layer.getDANodes()) {
      if (wanted.has(node.id) || node.agentHighlighted) node.setAgentHighlight(wanted.has(node.id));
    }
    for (const edge of layer.getDAEdges()) edge.setEmphasized(wanted.has(edge.id));
    layer.batchDraw();
  }

  nodeClientRect(id: string): ClientRect | null {
    const layer = this.host.drawingLayer;
    const node = layer.getDANodes().find(n => n.id === id);
    if (!node) return null;
    const scale = layer.scaleX();
    const container = this.host.stage.container().getBoundingClientRect();
    return {
      left: container.left + layer.x() + node.group.x() * scale,
      top: container.top + layer.y() + node.group.y() * scale,
      width: node.NODE_WIDTH * scale,
      height: node.NODE_HEIGHT * scale,
    };
  }

  viewClientRect(): ClientRect {
    const viewport = this.host.viewport;
    const container = this.host.stage.container().getBoundingClientRect();
    return {
      left: container.left + viewport.minX,
      top: container.top + viewport.minY,
      width: viewport.width,
      height: viewport.height,
    };
  }
}
