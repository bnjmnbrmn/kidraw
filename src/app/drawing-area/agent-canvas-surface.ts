/**
 * What an agent sees of the canvas and may do to it (`AgentCanvasTarget`,
 * notes/idea-mcp-server.md): read the graph, the selection and the view;
 * point at a node and highlight things, never moving the user's selection;
 * and change the graph through operations, one undo group per batch —
 * never through the keyboard's commands. Reading mode (reading/) steps
 * through an explanation on the same surface.
 */
import type Konva from 'konva';
import type {
  AgentCanvasTarget, AgentChange, AgentChangeResult, AgentEdgeInfo, AgentEditMeta, AgentNodeInfo, ClientRect,
} from '../agent/agent-canvas';
import type { DANode } from './da-node';
import type { DrawingLayer } from './drawing.layer';
import type { GraphOperation, UndoGroup } from './graph-operations';
import { nextId } from './id-generator';
import { layeredLayout } from './layered-layout';
import type { Point } from './utils';
import type { Viewport } from './viewport';

/** What the agent's surface needs from the drawing area. */
export interface AgentCanvasHost {
  readonly drawingLayer: DrawingLayer;
  readonly viewport: Viewport;
  readonly stage: Konva.Stage;
  /** How long the view takes to recentre, in seconds. */
  readonly recenterDuration: number;
  nodeUnderCrosshairs(): DANode | null;
  nodeCenter(node: DANode): Point;
  finishTweens(): void;
  centerViewOnLayerPoint(point: Point): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  /** Apply an undo group all-or-nothing; a conflict message, or null. */
  applyOperations(group: UndoGroup): Promise<string | null>;
  revertChangeSet(changeSetId: string): Promise<string | null>;
  /** The user, not the agent, panned or zoomed. */
  viewChangedByUser(): void;
}

export class AgentCanvasSurface implements AgentCanvasTarget {
  /** Until this time (performance.now()), view changes are the agent's own focus animation. */
  private agentViewMoveUntil = 0;
  private lastUserViewChangeEmit = 0;

  constructor(private readonly host: AgentCanvasHost) {}

  // Read-only inspection plus view guidance. Nothing here mutates the graph
  // or touches the undo stack, until agentApplyChanges.

  agentNodes(): AgentNodeInfo[] {
    return this.host.drawingLayer.getDANodes().map(node => ({
      id: node.id, label: node.label.text(), tags: [...node.tags],
    }));
  }

  agentEdges(): AgentEdgeInfo[] {
    return this.host.drawingLayer.getDAEdges().map(edge => ({
      id: edge.id,
      from: edge.srcNode.id,
      to: edge.destNode.id,
      labels: edge.labels.map(label => label.label),
      tags: [...edge.tags],
    }));
  }

  agentSelection(): {nodeIds: string[]; edgeIds: string[]; underCrosshairsId: string | null} {
    const layer = this.host.drawingLayer;
    return {
      nodeIds: layer.getSelectedDANodes().map(n => n.id),
      edgeIds: layer.getSelectedDAEdges().map(e => e.id),
      underCrosshairsId: this.host.nodeUnderCrosshairs()?.id ?? null,
    };
  }

  agentZoomPercent(): number {
    return Math.round(this.host.drawingLayer.scaleX() * 100);
  }

  agentVisibleNodeIds(): string[] {
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
      if (now < this.agentViewMoveUntil || now - this.lastUserViewChangeEmit < 250) return;
      this.lastUserViewChangeEmit = now;
      this.host.viewChangedByUser();
    });
  }

  /** Pan the view onto the node. The agent only points: it never changes the
   *  user's selection, so nothing the user is doing gets redirected. */
  agentFocusNode(id: string): boolean {
    const node = this.host.drawingLayer.getDANodes().find(n => n.id === id);
    if (!node) return false;
    this.agentViewMoveUntil = performance.now() + this.host.recenterDuration * 1000 + 150;
    this.host.finishTweens();
    this.host.centerViewOnLayerPoint(this.host.nodeCenter(node));
    this.host.drawingLayer.batchDraw();
    return true;
  }

  agentDiagramTypeId(): string {
    return this.host.drawingLayer.diagramType;
  }

  async agentApplyChanges(changes: AgentChange[], meta: AgentEditMeta): Promise<AgentChangeResult> {
    const planner = await import('./agent-change-planner');
    return planner.applyAgentChanges(
      this.host.drawingLayer.serializeGraph(), changes, meta, nextId, group => this.host.applyOperations(group),
      () => this.agentArrange(meta));
  }

  /** The agent's "arrange": lay the graph out top-down along its links
   *  (layered-layout.ts), as moves in the agent's change set, so undoing its
   *  turn puts the nodes back. Pinned nodes stay where they are. */
  private async agentArrange(meta: AgentEditMeta): Promise<string | null> {
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

  agentRevertChangeSet(changeSetId: string): Promise<string | null> {
    return this.host.revertChangeSet(changeSetId);
  }

  agentSetHighlights(ids: string[]): void {
    const layer = this.host.drawingLayer;
    const wanted = new Set(ids);
    for (const node of layer.getDANodes()) {
      if (wanted.has(node.id) || node.agentHighlighted) node.setAgentHighlight(wanted.has(node.id));
    }
    for (const edge of layer.getDAEdges()) edge.setEmphasized(wanted.has(edge.id));
    layer.batchDraw();
  }

  agentNodeClientRect(id: string): ClientRect | null {
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

  agentViewClientRect(): ClientRect {
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
