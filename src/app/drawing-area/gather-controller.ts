/**
 * Gather (v2, 2026-09-25; notes/idea-gather-recursive.md): pull the node
 * under the crosshairs' neighbors in around it to look at them, then put
 * them back.
 *
 * One command, a toggle. Over a node it gathers that node's neighbors, in and
 * out, keeping each one's direction from it (gather-plan.ts); a node with
 * fewer than three neighbors brings their neighbors too, on a second ring.
 * Nodes that are not part of it are pushed out of the way. Pressed again, it
 * puts every node it moved back where it was, with its edges' bends.
 *
 * A gathering is an ordinary change to the graph: it takes an undo step, and
 * saves if you leave it gathered. Putting back is one too.
 */
import { DACommandType } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { DAEdge, EdgeControlPoint } from './da-edge';
import type { DANode } from './da-node';
import type { DrawingLayer } from './drawing.layer';
import { GatherBox, planGather } from './gather-plan';

/** Below this many neighbors, Gather also brings theirs. */
const SHALLOW_BELOW = 3;

/** What Gather needs from the drawing area. */
export interface GatherHost {
  readonly drawingLayer: DrawingLayer;
  nodeUnderCrosshairs(): DANode | null;
  finishTweens(): void;
  /** Route the edges of these nodes around what is now in their way. */
  rerouteIncidentEdges(nodes: DANode[]): void;
  /** Bring this layer-space box into view: centered, zoomed out only as far
   *  as it needs, never in past natural size. */
  frame(box: {minX: number; minY: number; maxX: number; maxY: number}): void;
  emitStatus(message: string): void;
}

interface Gathering {
  anchor: DANode;
  positions: Map<DANode, {x: number; y: number}>;
  bends: Map<DAEdge, EdgeControlPoint[]>;
}

export class GatherController {
  private gathering: Gathering | null = null;

  constructor(private readonly host: GatherHost) {}

  commands() {
    return {
      [DACommandType.GATHER]: () => this.toggle(),
    } satisfies CommandSlice;
  }

  /** The node things are gathered around, if any. */
  get anchor(): DANode | null {
    return this.gathering?.anchor ?? null;
  }

  /** The graph was replaced: what was recorded no longer describes it. */
  forget(): void {
    this.gathering = null;
  }

  toggle(): void {
    this.host.finishTweens();
    const node = this.host.nodeUnderCrosshairs();
    if (this.gathering && (node === null || node === this.gathering.anchor)) {
      this.putBack();
      return;
    }
    if (!node) {
      this.host.emitStatus('Point at a node to gather its neighbors around it');
      return;
    }
    if (this.gathering) this.putBack();
    this.gather(node);
  }

  private gather(anchor: DANode): void {
    const first = neighborsOf([anchor], new Set([anchor]));
    const second = first.length < SHALLOW_BELOW ? neighborsOf(first, new Set([anchor, ...first])) : [];
    if (first.length === 0) {
      this.host.emitStatus(`"${anchor.label.text()}" has no neighbors to gather`);
      return;
    }
    const gathered = new Set([anchor, ...first, ...second]);
    const others = this.host.drawingLayer.getDANodes().filter(node => !gathered.has(node));
    const plan = planGather(boxOf(anchor), [first.map(boxOf), second.map(boxOf)], others.map(boxOf));
    const moved = this.host.drawingLayer.getDANodes().filter(node => plan.has(node.id));
    this.gathering = {anchor, positions: positionsOf(moved), bends: bendsOf(moved)};
    for (const node of moved) node.konvaGroup.position(plan.get(node.id)!);
    this.straightenAndReroute(moved, gathered);
    this.host.frame(boundsAround(anchor, [...gathered]));
    const count = first.length + second.length;
    this.host.emitStatus(`Gathered ${count} around "${anchor.label.text()}" — Gather again puts them back`);
  }

  /** Edges within the gathering run straight; the rest of the moved nodes'
   *  edges are routed around what now stands in their way. */
  private straightenAndReroute(moved: DANode[], gathered: Set<DANode>): void {
    // A self-loop's bends are its shape, and it follows its node.
    const edges = new Set(moved.flatMap(node => node.connectedEdges).filter(edge => edge.srcNode !== edge.destNode));
    edges.forEach(edge => edge.setControlPoints([]));
    const inside = (edge: DAEdge) => gathered.has(edge.srcNode) && gathered.has(edge.destNode);
    const outside = moved.filter(node => node.connectedEdges.some(edge => !inside(edge)));
    edges.forEach(edge => edge.refreshGeometry());
    if (outside.length > 0) this.host.rerouteIncidentEdges(outside);
    [...edges].filter(inside).forEach(edge => edge.setControlPoints([]));
    this.host.drawingLayer.batchDraw();
  }

  private putBack(): void {
    const {positions, bends} = this.gathering!;
    this.gathering = null;
    const layer = this.host.drawingLayer;
    const alive = new Set(layer.getDANodes());
    let count = 0;
    positions.forEach((at, node) => {
      if (!alive.has(node)) return;
      node.konvaGroup.position(at);
      count++;
    });
    const edges = new Set(layer.getDAEdges());
    bends.forEach((points, edge) => {
      if (edges.has(edge)) edge.restoreControlPoints(points);
    });
    new Set([...positions.keys()].flatMap(node => node.connectedEdges)).forEach(edge => edge.refreshGeometry());
    layer.batchDraw();
    this.host.emitStatus(`Put back ${count} node${count === 1 ? '' : 's'}`);
  }
}

/** Nodes one edge away from any of `from`, not in `exclude`, in the order
 *  their edges were drawn. */
function neighborsOf(from: DANode[], exclude: Set<DANode>): DANode[] {
  const found: DANode[] = [];
  for (const node of from) {
    for (const edge of node.connectedEdges) {
      const other = edge.srcNode === node ? edge.destNode : edge.srcNode;
      if (!exclude.has(other) && !found.includes(other)) found.push(other);
    }
  }
  return found;
}

/** A box centered on the anchor that holds all of `nodes`: framing it keeps
 *  the crosshairs on the anchor, so Gather again puts back rather than
 *  gathering around a neighbor. */
function boundsAround(anchor: DANode, nodes: DANode[]): {minX: number; minY: number; maxX: number; maxY: number} {
  const a = boxOf(anchor);
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  const boxes = nodes.map(boxOf);
  const rx = Math.max(...boxes.map(b => Math.max(cx - b.x, b.x + b.w - cx)));
  const ry = Math.max(...boxes.map(b => Math.max(cy - b.y, b.y + b.h - cy)));
  return {minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry};
}

function boxOf(node: DANode): GatherBox {
  return {id: node.id, x: node.konvaGroup.x(), y: node.konvaGroup.y(), w: node.NODE_WIDTH, h: node.NODE_HEIGHT};
}

function positionsOf(nodes: DANode[]): Map<DANode, {x: number; y: number}> {
  return new Map(nodes.map(node => [node, {x: node.konvaGroup.x(), y: node.konvaGroup.y()}]));
}

function bendsOf(nodes: DANode[]): Map<DAEdge, EdgeControlPoint[]> {
  const edges = new Set(nodes.flatMap(node => node.connectedEdges));
  return new Map([...edges].map(edge => [edge, edge.controlPoints.map(point => ({...point}))]));
}
