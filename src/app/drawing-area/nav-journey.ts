import type {DANode} from './da-node';
import type {DAEdge} from './da-edge';
import type {Point} from './utils';
import {nodeCenterInLayer} from './node-geometry';

/** Which end of an edge the walk came out of. */
export type NavDirection = 'out' | 'in';

/** Where graph traversal has been, and which way it was going.
 *
 *  Move by Link (held NSEW quadrants) and the nav popup (sticky go-to) are
 *  two surfaces onto one walk: leaving one and entering the other continues
 *  the same journey rather than starting a cold one. That only works if the
 *  momentum, the last node and the jumplist live somewhere other than either
 *  surface — here. */
export class NavJourney {
  private lastNode: DANode | null = null;
  private _momentum: Point | null = null;
  private _direction: NavDirection | null = null;
  private _focusedEdge: DAEdge | null = null;
  /** Vim jumplist: node ids in visit order, with a cursor into them. */
  private readonly history: string[] = [];
  private historyIndex = -1;

  /** The heading of the last traversal, for picking the entry link at the
   *  next node. Null on a cold start. */
  get momentum(): Point | null {
    return this._momentum;
  }

  get direction(): NavDirection | null {
    return this._direction;
  }

  /** The edge drawn highlighted as the active scan position; at most one. */
  get focusedEdge(): DAEdge | null {
    return this._focusedEdge;
  }

  /** The node the walk last landed on, unless it has since been deleted. */
  lastNodeAmong(nodes: readonly DANode[]): DANode | null {
    if (this.lastNode && !nodes.includes(this.lastNode)) this.lastNode = null;
    return this.lastNode;
  }

  /** Begin from `node` without claiming to have traveled there. */
  startAt(node: DANode): void {
    this.lastNode = node;
  }

  /** Free crosshairs movement to a different node breaks the chain, so the
   *  next traversal has no direction to continue. */
  coldStartUnlessAt(node: DANode): void {
    if (node !== this.lastNode) this._direction = null;
  }

  /** Land on the far end of a link: record the jump, and take the heading
   *  from the two node centers so the next hop can continue onward. */
  arrive(source: DANode, dest: DANode, direction: NavDirection): void {
    this.recordVisit(source.id, dest.id);
    this.lastNode = dest;
    this._direction = direction;
    const from = nodeCenterInLayer(source);
    const to = nodeCenterInLayer(dest);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > 1e-6) {
      this._momentum = {x: (to.x - from.x) / length, y: (to.y - from.y) / length};
    }
  }

  /** Highlight `edge` as the scan position. Returns whether it changed, so
   *  the caller redraws only when there is something new to see. */
  focusEdge(edge: DAEdge | null): boolean {
    if (this._focusedEdge === edge) return false;
    if (this._focusedEdge) this._focusedEdge.navFocused = false;
    this._focusedEdge = edge;
    if (edge) edge.navFocused = true;
    return true;
  }

  /** Ctrl+O (delta -1) / Ctrl+I (delta +1): step through the jumplist,
   *  skipping entries whose nodes have since been deleted. Stepping does not
   *  edit the history — only a new jump truncates it. Returns the node
   *  landed on, or null when the list is exhausted in that direction.
   *  Arriving this way is a cold start: no direction, nothing focused. */
  stepHistory(delta: -1 | 1, nodeById: (id: string) => DANode | undefined): DANode | null {
    let i = this.historyIndex + delta;
    while (i >= 0 && i < this.history.length && !nodeById(this.history[i])) {
      i += delta;
    }
    if (i < 0 || i >= this.history.length) return null;
    this.historyIndex = i;
    const node = nodeById(this.history[i])!;
    this.lastNode = node;
    this._direction = null;
    this.focusEdge(null);
    return node;
  }

  /** A new jump truncates any forward history (vim jumplist semantics); the
   *  source is stitched in when the chain broke — free crosshairs movement
   *  between jumps leaves a gap the history would otherwise hide. */
  private recordVisit(sourceId: string, destId: string): void {
    if (this.historyIndex < this.history.length - 1) {
      this.history.splice(this.historyIndex + 1);
    }
    if (this.history[this.history.length - 1] !== sourceId) {
      this.history.push(sourceId);
    }
    this.history.push(destId);
    this.historyIndex = this.history.length - 1;
  }
}
