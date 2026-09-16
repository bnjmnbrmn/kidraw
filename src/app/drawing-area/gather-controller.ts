import Konva from 'konva';
import type { ThemeService } from '../services/theme.service';
import type { DrawingLayer } from './drawing.layer';
import { DANode } from './da-node';
import { DAEdge, EdgeControlPoint } from './da-edge';
import { endpointFlowDirection, pickEntryCandidate } from './graph-nav';
import { planGather, GatherNeighbor, GatherPlacement } from './gather-fisheye';
import { lineSegmentIntersectsRect } from './utils';
import { routeNewEdgeIncrementally } from './incremental-desiderata-v3-route-edges';

/** Axis-aligned box a gather meta-arrow connects to (node or container). */
interface MetaBox {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

/**
 * What the gather view needs from the drawing area that owns it. Deliberately
 * narrow: gather reads the navigation state to decide which neighbour must
 * stay out of a pile, and otherwise only moves nodes and re-routes edges.
 */
export interface GatherHost {
  readonly drawingLayer: DrawingLayer;
  /** Animations in flight; gather adds its own and lets the host settle them. */
  readonly tweens: Konva.Tween[];
  readonly themeService: ThemeService;
  /** The edge the traversal is riding, if any. Read only. */
  readonly graphNavEdge: DAEdge | null;
  /** Direction of the last traversal step, if any. Read only. */
  readonly graphNavMomentum: {x: number; y: number} | null;
  log(message: string): void;
  emitStatus(message: string): void;
  finishTweens(): void;
  getTraversalAnchorNode(): DANode | null;
  getNodeCenterInLayerCoordinates(node: DANode): {x: number; y: number};
  refreshWaypointVisibility(drawIfChanged?: boolean): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
}

/**
 * The fisheye gather view: a node's neighbourhood pulled onto a ring around it
 * so a crowded graph can be read and navigated locally, then put back exactly
 * as it was.
 *
 * Neighbours keep their bearings and compress onto the ring, stacking when
 * crowded (the geometry is pure, in `gather-fisheye.ts`); strangers inside the
 * zone are pushed out so nothing near the ring reads as a neighbour; and the
 * wiring is transformed along with the nodes so the picture looks like the real
 * layout sucked inwards rather than a different graph.
 *
 * It is a *view*, not an edit: every position and every edge control point it
 * touches is recorded here first, and Ungather restores them. That is why the
 * state below lives with the behaviour instead of on the component - nothing
 * outside this file has any business reading it.
 *
 * Covered by `tools/qa/grid-overlay/gather-fisheye.js`.
 */
export class GatherController {
  /** Where each moved node sat before the gather, for restore. */
  private gatheredNodePositions: Map<DANode, {x: number; y: number}> = new Map();
  /** Node the current gather view is centered on. */
  private gatherAnchor: DANode | null = null;
  /** Explicitly gathered (Gather key); restored by Ungather or re-toggle. */
  private gatherPinned = false;
  /** Member edges of a pile, hidden while their meta-edge stands in for
   *  them; shown again on ungather. */
  private gatherHiddenEdges: DAEdge[] = [];
  /** Meta-node containers, meta-edges, xN badges, and label markers;
   *  destroyed on ungather. */
  private gatherIndicators: Konva.Node[] = [];
  /** Drawing-layer children order before stack restacking, for restore. */
  private gatherZOrder: Konva.Node[] | null = null;
  /** Debounced re-route of edges between gathered nodes and the rest of the
   *  graph - rapid navigation keeps cancelling it so only the resting view
   *  pays for routing. */
  private gatherDeferredRouting: number | null = null;
  /** Pre-gather control points of every edge Gather re-routed, so Ungather
   *  restores the wiring exactly. */
  private gatheredEdgeControlPoints = new Map<DAEdge, EdgeControlPoint[]>();

  constructor(private readonly host: GatherHost) {}

  /** The Gather key: gather here, pin an auto-gathered view, or restore. */
  toggle(): void {
    this.host.finishTweens();
    const anchorNode = this.host.getTraversalAnchorNode();
    if (this.gatheredNodePositions.size > 0
        && (anchorNode === null || anchorNode === this.gatherAnchor)) {
      if (!this.gatherPinned && this.gatherAnchor !== null) {
        // The nav session auto-gathered this view; the explicit key pins it
        // so it survives leaving the submenu.
        this.gatherPinned = true;
        this.host.emitStatus('Gather pinned. Ungather restores.');
        return;
      }
      this.restoreGatheredNodes();
      return;
    }
    if (!anchorNode) {
      this.host.emitStatus('Move the crosshairs onto a node to gather.');
      return;
    }
    this.gatherAround(anchorNode, true);
  }




  /** Everything the gather view needs to know about one neighbor. */
  private collectGatherNeighbors(anchorNode: DANode):
      Map<DANode, {direction: 'in' | 'out'; kind: string; edges: DAEdge[]}> {
    const infos = new Map<DANode, {direction: 'in' | 'out'; kind: string; edges: DAEdge[]}>();
    for (const edge of anchorNode.outgoingEdges) {
      const n = edge.destNode;
      if (n === anchorNode) continue;
      const info = infos.get(n)
        ?? {direction: 'out' as const, kind: edge.tags[0] ?? n.tags[0] ?? '', edges: []};
      info.edges.push(edge);
      infos.set(n, info);
    }
    for (const edge of anchorNode.incomingEdges) {
      const n = edge.srcNode;
      if (n === anchorNode) continue;
      const existing = infos.get(n);
      if (existing) { // edges both ways → counts as 'out'
        existing.edges.push(edge);
        continue;
      }
      infos.set(n, {direction: 'in', kind: edge.tags[0] ?? n.tags[0] ?? '', edges: [edge]});
    }
    return infos;
  }

  /** Gather the anchor's neighborhood into the fisheye view: neighbors keep
   *  their bearings and compress onto a ring (stacking when crowded — see
   *  gather-fisheye.ts), strangers inside the zone are pushed out, and the
   *  wiring is transformed with the nodes so the picture reads as the real
   *  layout sucked in. A temporary view: Ungather restores everything. */
  private gatherAround(anchorNode: DANode, pinned: boolean): void {
    this.host.finishTweens();
    if (this.gatheredNodePositions.size > 0) {
      this.restoreGatheredNodes(false);
    }

    const infos = this.collectGatherNeighbors(anchorNode);
    if (infos.size === 0) {
      if (pinned) this.host.emitStatus('Nothing connected to gather.');
      return;
    }
    this.gatherAnchor = anchorNode;
    this.gatherPinned = pinned;

    const protectedNodes = this.gatherProtectedNodes(anchorNode, infos);
    const boxOf = (n: DANode) => {
      const c = this.host.getNodeCenterInLayerCoordinates(n);
      return {id: n.id, cx: c.x, cy: c.y, halfW: n.NODE_WIDTH / 2, halfH: n.NODE_HEIGHT / 2};
    };
    const neighbors: GatherNeighbor[] = [...infos.entries()].map(([n, i]) => ({
      ...boxOf(n),
      direction: i.direction,
      kind: i.kind,
      protected: protectedNodes.has(n),
    }));
    const plan = planGather(boxOf(anchorNode), neighbors);
    const placedById = new Map(plan.placed.map(p => [p.id, p]));
    const nodeById = new Map([...infos.keys()].map(n => [n.id, n]));

    // Snapshot z-order before restacking piles (restored on ungather).
    this.gatherZOrder = [...this.host.drawingLayer.getChildren()];

    // Move the neighbors.
    for (const p of plan.placed) {
      const node = nodeById.get(p.id)!;
      this.gatheredNodePositions.set(node, {x: node.group.x(), y: node.group.y()});
      this.host.tweens.push(new Konva.Tween({
        node: node.group,
        x: p.x - node.NODE_WIDTH / 2,
        y: p.y - node.NODE_HEIGHT / 2,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          this.host.updateEdgesForResizedNodes([node]);
          this.host.drawingLayer.batchDraw();
        },
      }).play());
    }
    // Stack z-order: deepest first, so index 0 renders on top.
    const stackMembers = new Map<string, GatherPlacement[]>();
    for (const p of plan.placed) {
      if (!p.stack) continue;
      const list = stackMembers.get(p.stack.key) ?? [];
      list.push(p);
      stackMembers.set(p.stack.key, list);
    }
    for (const members of stackMembers.values()) {
      [...members].sort((a, b) => b.stack!.index - a.stack!.index)
        .forEach(p => nodeById.get(p.id)!.group.moveToTop());
    }

    // Push non-participants out of the gather zone so nothing near the ring
    // can be mistaken for a neighbor.
    const aC = this.host.getNodeCenterInLayerCoordinates(anchorNode);
    for (const node of this.host.drawingLayer.getDANodes()) {
      if (node === anchorNode || infos.has(node)) continue;
      const c = this.host.getNodeCenterInLayerCoordinates(node);
      const d = Math.hypot(c.x - aC.x, c.y - aC.y);
      const need = plan.clearRadius + Math.hypot(node.NODE_WIDTH, node.NODE_HEIGHT) / 2;
      if (d >= need) continue;
      const ang = d < 1e-6 ? 0 : Math.atan2(c.y - aC.y, c.x - aC.x);
      this.gatheredNodePositions.set(node, {x: node.group.x(), y: node.group.y()});
      this.host.tweens.push(new Konva.Tween({
        node: node.group,
        x: aC.x + Math.cos(ang) * need - node.NODE_WIDTH / 2,
        y: aC.y + Math.sin(ang) * need - node.NODE_HEIGHT / 2,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          this.host.updateEdgesForResizedNodes([node]);
          this.host.drawingLayer.batchDraw();
        },
      }).play());
    }

    this.scheduleAfterGatherTweens(anchorNode,
      () => this.applyGatherEdgeTreatment(anchorNode, infos, placedById, stackMembers, nodeById));

    if (pinned) {
      const stacked = plan.placed.filter(p => p.stack !== null).length;
      const parts = `${infos.size} neighbor${infos.size === 1 ? '' : 's'}`
        + (stacked > 0 ? ` (${stacked} in ${stackMembers.size} stack${stackMembers.size === 1 ? '' : 's'})` : '');
      this.host.emitStatus(`Gathered ${parts}. Gather again or Ungather restores.`);
    }
  }

  /** The traversal's next-jump candidate and its bearing-adjacent
   *  siblings — these must never disappear into a stack. */
  private gatherProtectedNodes(
    anchorNode: DANode,
    infos: Map<DANode, {direction: 'in' | 'out'; kind: string; edges: DAEdge[]}>,
  ): Set<DANode> {
    const result = new Set<DANode>();
    let navNext: DANode | null = null;
    if (this.host.graphNavEdge
        && this.host.drawingLayer.getDAEdges().includes(this.host.graphNavEdge)
        && (this.host.graphNavEdge.srcNode === anchorNode || this.host.graphNavEdge.destNode === anchorNode)) {
      const other = this.host.graphNavEdge.srcNode === anchorNode
        ? this.host.graphNavEdge.destNode : this.host.graphNavEdge.srcNode;
      if (infos.has(other)) navNext = other;
    }
    if (!navNext) {
      // Same pick Jump Outgoing would make: momentum-aligned, else first
      // clockwise from 12 o'clock.
      const toDest = anchorNode.outgoingEdges.length > 0;
      const candidates = toDest ? anchorNode.outgoingEdges : anchorNode.incomingEdges;
      if (candidates.length > 0) {
        const flows = candidates.map(e =>
          endpointFlowDirection(e.getPathPoints(), toDest ? 'src' : 'dest'));
        const pick = pickEntryCandidate(flows, this.host.graphNavMomentum);
        if (pick >= 0) {
          const e = candidates[pick];
          const other = e.srcNode === anchorNode ? e.destNode : e.srcNode;
          if (infos.has(other)) navNext = other;
        }
      }
    }
    if (!navNext) return result;
    result.add(navNext);
    const aC = this.host.getNodeCenterInLayerCoordinates(anchorNode);
    const bearingOf = (n: DANode) => {
      const c = this.host.getNodeCenterInLayerCoordinates(n);
      return Math.atan2(c.y - aC.y, c.x - aC.x);
    };
    const sorted = [...infos.keys()].sort((a, b) => bearingOf(a) - bearingOf(b));
    const i = sorted.indexOf(navNext);
    if (sorted.length > 1) {
      result.add(sorted[(i + 1) % sorted.length]);
      result.add(sorted[(i - 1 + sorted.length) % sorted.length]);
    }
    return result;
  }

  /** Run `work` just after the gather placement tweens land (finishTweens
   *  fires it synchronously in tests and on interrupt). */
  private scheduleAfterGatherTweens(anchorNode: DANode, work: () => void): void {
    const scheduler = new Konva.Tween({
      node: anchorNode.group,
      duration: 0.32,
      x: anchorNode.group.x(),
      onFinish: work,
    });
    this.host.tweens.push(scheduler);
    scheduler.play();
  }

  private saveGatherEdgeWiring(edge: DAEdge): void {
    if (!this.gatheredEdgeControlPoints.has(edge)) {
      this.gatheredEdgeControlPoints.set(edge, edge.controlPoints.map(c => ({...c})));
    }
  }

  /** The wiring pass, after placement: anchor↔neighbor edges keep their
   *  shape via the same rotate+scale that moved their node (the "sucked in"
   *  look); stacked edges go straight so a pile reads as one bundle (with
   *  buried labels hidden behind a "…N more labels…" marker); everything
   *  else re-routes incrementally — debounced, so rapid navigation only
   *  pays for the view it rests on. */
  private applyGatherEdgeTreatment(
    anchorNode: DANode,
    infos: Map<DANode, {direction: 'in' | 'out'; kind: string; edges: DAEdge[]}>,
    placedById: Map<string, GatherPlacement>,
    stackMembers: Map<string, GatherPlacement[]>,
    nodeById: Map<string, DANode>,
  ): void {
    const aC = this.host.getNodeCenterInLayerCoordinates(anchorNode);
    const handled = new Set<DAEdge>();

    for (const [node, info] of infos) {
      const p = placedById.get(node.id);
      if (!p) continue;
      const saved = this.gatheredNodePositions.get(node);
      for (const edge of info.edges) {
        handled.add(edge);
        this.saveGatherEdgeWiring(edge);
        const hasWaypoint = edge.controlPoints.some(cp => cp.waypointId);
        if (p.stack !== null) {
          // A pile is represented by a meta-node (dashed container) and one
          // meta-edge; the member edges hide entirely — labels and waypoint
          // glyphs live inside the edge group and ride along. N overlapping
          // arrowheads never read as N; one arrow into a box labeled ×N
          // does.
          if (edge.group.visible()) {
            edge.group.visible(false);
            this.gatherHiddenEdges.push(edge);
          }
          continue;
        }
        if (hasWaypoint || edge.controlPoints.length === 0 || !saved) {
          edge.setControlPoints([]);
          continue;
        }
        const oldC = {x: saved.x + node.NODE_WIDTH / 2, y: saved.y + node.NODE_HEIGHT / 2};
        const va = {x: oldC.x - aC.x, y: oldC.y - aC.y};
        const vb = {x: p.x - aC.x, y: p.y - aC.y};
        const da = Math.hypot(va.x, va.y);
        if (da < 1e-6) {
          edge.setControlPoints([]);
          continue;
        }
        const scale = Math.hypot(vb.x, vb.y) / da;
        const rot = Math.atan2(vb.y, vb.x) - Math.atan2(va.y, va.x);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        edge.setControlPoints(edge.controlPoints.map(cp => {
          const dx = cp.x - aC.x;
          const dy = cp.y - aC.y;
          return {...cp, x: aC.x + (dx * cos - dy * sin) * scale, y: aC.y + (dx * sin + dy * cos) * scale};
        }));
      }
    }

    // Meta-node + meta-edge per pile: a dashed container around the sheets,
    // one thick arrow into/out of it, the ×N count at its corner, and the
    // top edge's label (plus a "…K more labels…" marker) on the arrow.
    const containerOf = new Map<DANode, Konva.Rect>();
    const pileIds = new Map<Konva.Rect, number>();
    for (const [key, members] of stackMembers) {
      const ordered = [...members].sort((a, b) => a.stack!.index - b.stack!.index);
      const memberNodes = ordered.map(m => nodeById.get(m.id)!);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of memberNodes) {
        minX = Math.min(minX, n.group.x());
        minY = Math.min(minY, n.group.y());
        maxX = Math.max(maxX, n.group.x() + n.NODE_WIDTH);
        maxY = Math.max(maxY, n.group.y() + n.NODE_HEIGHT);
      }
      const PAD = 10;
      const container = new Konva.Rect({
        x: minX - PAD,
        y: minY - PAD,
        width: maxX - minX + 2 * PAD,
        height: maxY - minY + 2 * PAD,
        stroke: '#8a8a8a',
        strokeWidth: 1.5,
        dash: [7, 5],
        cornerRadius: 8,
        fill: 'rgba(138, 138, 138, 0.07)',
        listening: false,
      });
      this.host.drawingLayer.add(container);
      this.gatherIndicators.push(container);
      pileIds.set(container, pileIds.size);
      for (const n of memberNodes) containerOf.set(n, container);
      // Sheets render inside (above) their container, deepest first.
      [...ordered].reverse().forEach(m => nodeById.get(m.id)!.group.moveToTop());

      const labels: string[] = [];
      for (const m of ordered) {
        for (const edge of infos.get(nodeById.get(m.id)!)?.edges ?? []) {
          for (const label of edge.labels) {
            if (label.label.trim()) labels.push(label.label);
          }
        }
      }
      this.addGatherMetaEdge(anchorNode, container, key.startsWith('in:'), labels);
      this.addGatherStackBadge(container, ordered.length);
    }

    // Everything else touching a moved node. A stacked member's wiring to
    // the wider graph hides with its pile but is not lost: each distinct
    // (pile ↔ endpoint) connection renders as one thin meta-arrow bundled
    // at the container — the fan of individually re-routed member edges
    // was most of the gathered view's noise. Edges between still-individual
    // nodes stay live: stale wiring → incremental re-route, debounced
    // behind the navigation.
    const rest: DAEdge[] = [];
    const bundles = new Map<string, {from: MetaBox; to: MetaBox}>();
    for (const node of this.gatheredNodePositions.keys()) {
      for (const edge of node.connectedEdges) {
        if (handled.has(edge) || rest.includes(edge) || !edge.group.visible()) continue;
        const srcRect = containerOf.get(edge.srcNode);
        const dstRect = containerOf.get(edge.destNode);
        if (!srcRect && !dstRect) {
          rest.push(edge);
          continue;
        }
        edge.group.visible(false);
        this.gatherHiddenEdges.push(edge);
        const sKey = srcRect ? `pile:${pileIds.get(srcRect)}` : `node:${edge.srcNode.id}`;
        const dKey = dstRect ? `pile:${pileIds.get(dstRect)}` : `node:${edge.destNode.id}`;
        if (!bundles.has(`${sKey}->${dKey}`)) {
          bundles.set(`${sKey}->${dKey}`, {
            from: srcRect ? this.gatherMetaBoxOfRect(srcRect) : this.gatherMetaBoxOfNode(edge.srcNode),
            to: dstRect ? this.gatherMetaBoxOfRect(dstRect) : this.gatherMetaBoxOfNode(edge.destNode),
          });
        }
      }
    }
    for (const bundle of bundles.values()) {
      this.addGatherMetaArrow(bundle.from, bundle.to, true);
    }
    if (this.gatherDeferredRouting !== null) {
      clearTimeout(this.gatherDeferredRouting);
      this.gatherDeferredRouting = null;
    }
    if (rest.length > 0) {
      if (this.gatherPinned) this.host.emitStatus('Gathering…');
      this.gatherDeferredRouting = window.setTimeout(() => {
        this.gatherDeferredRouting = null;
        const allNodes = this.host.drawingLayer.getDANodes();
        const allEdges = this.host.drawingLayer.getDAEdges();
        for (const edge of rest) {
          this.saveGatherEdgeWiring(edge);
          edge.setControlPoints([]);
          // Straight first: the router only earns its curves when the
          // straight chord actually pierces a node — a temporary view
          // doesn't need routing polish, it needs calm.
          if (this.straightChordPiercesNode(edge, allNodes)) {
            routeNewEdgeIncrementally(allNodes, allEdges, edge, undefined, (msg: string) => this.host.log(msg));
            edge.promoteToWaypoints();
          }
        }
        this.host.refreshWaypointVisibility(false);
        this.host.drawingLayer.batchDraw();
        if (this.gatherPinned) {
          this.host.emitStatus(`Gathered around ${(this.gatherAnchor?.label?.text() ?? '').trim() || 'node'}.`);
        }
      }, 250);
    }
    this.host.drawingLayer.batchDraw();
  }

  /** "×N" count badge at the top-right corner of a pile's container: how
   *  many nodes (and edges) are stacked here, since the capped cascade
   *  deliberately looks the same for 4 and 50. */
  private addGatherStackBadge(container: Konva.Rect, size: number): void {
    const badge = new Konva.Text({
      x: container.x() + container.width() - 6,
      y: container.y() - 18,
      text: `×${size}`,
      fontSize: 13,
      fontStyle: 'italic bold',
      fill: '#8a8a8a',
      listening: false,
    });
    this.host.drawingLayer.add(badge);
    badge.moveToTop();
    this.gatherIndicators.push(badge);
  }

  /** The primary meta-edge: one thick arrow between the anchor's box and a
   *  pile's container, pointing the way all the hidden member edges flow,
   *  carrying the top edge's label and a "…K more labels…" marker on
   *  opposite sides so they never collide. */
  private addGatherMetaEdge(
    anchorNode: DANode,
    container: Konva.Rect,
    incoming: boolean,
    labels: string[],
  ): void {
    const anchorBox = this.gatherMetaBoxOfNode(anchorNode);
    const containerBox = this.gatherMetaBoxOfRect(container);
    const geo = incoming
      ? this.addGatherMetaArrow(containerBox, anchorBox, false)
      : this.addGatherMetaArrow(anchorBox, containerBox, false);
    if (!geo || labels.length === 0) return;

    const mid = {x: (geo.start.x + geo.end.x) / 2, y: (geo.start.y + geo.end.y) / 2};
    const perp = {x: -geo.u.y, y: geo.u.x};
    const put = (text: string, side: number, italic: boolean) => {
      const t = new Konva.Text({
        x: mid.x + perp.x * side,
        y: mid.y + perp.y * side,
        text,
        fontSize: italic ? 11 : 12,
        fontStyle: italic ? 'italic' : 'normal',
        fill: '#8a8a8a',
        listening: false,
      });
      t.offsetX(t.width() / 2);
      t.offsetY(t.height() / 2);
      this.host.drawingLayer.add(t);
      t.moveToTop();
      this.gatherIndicators.push(t);
    };
    put(labels[0], 16, false);
    if (labels.length > 1) {
      put(`…${labels.length - 1} more label${labels.length === 2 ? '' : 's'}…`, -16, true);
    }
  }

  /** A meta-arrow between two boxes: boundary to boundary, gray direction
   *  gradient (dim source → bright destination, arrowhead in the
   *  destination gray), tip standing off its target, rendered just above
   *  the grid — below nodes and real edges, like wiring should be. `thin`
   *  is the secondary form bundling a pile's connections to the wider
   *  graph. */
  private addGatherMetaArrow(
    from: MetaBox,
    to: MetaBox,
    thin: boolean,
  ): {start: {x: number; y: number}; end: {x: number; y: number}; u: {x: number; y: number}} | null {
    const len = Math.hypot(to.cx - from.cx, to.cy - from.cy);
    if (len < 1e-6) return null;
    const u = {x: (to.cx - from.cx) / len, y: (to.cy - from.cy) / len};
    const start = this.rectBoundaryPoint({x: from.cx, y: from.cy}, from.halfW, from.halfH, u);
    const end = this.rectBoundaryPoint({x: to.cx, y: to.cy}, to.halfW, to.halfH, {x: -u.x, y: -u.y});
    const standoff = thin ? 4 : 6;
    const tip = {x: end.x - u.x * standoff, y: end.y - u.y * standoff};
    const dark = this.host.themeService.theme === 'dark';
    const grayFrom = dark ? '#5c5c5c' : '#c2c2c2';
    const grayTo = dark ? '#d4d4d4' : '#4d4d4d';
    const arrow = new Konva.Arrow({
      points: [start.x, start.y, tip.x, tip.y],
      stroke: '#8a8a8a',
      strokeLinearGradientStartPoint: {x: start.x, y: start.y},
      strokeLinearGradientEndPoint: {x: tip.x, y: tip.y},
      strokeLinearGradientColorStops: [0, grayFrom, 1, grayTo],
      fill: grayTo,
      strokeWidth: thin ? 2.5 : 5,
      pointerLength: thin ? 10 : 16,
      pointerWidth: thin ? 10 : 16,
      lineCap: 'round',
      opacity: thin ? 0.7 : 0.95,
      listening: false,
    });
    this.host.drawingLayer.add(arrow);
    arrow.zIndex(1); // above the grid group, below every node and edge
    this.gatherIndicators.push(arrow);
    return {start, end, u};
  }

  private gatherMetaBoxOfNode(n: DANode): MetaBox {
    const c = this.host.getNodeCenterInLayerCoordinates(n);
    return {cx: c.x, cy: c.y, halfW: n.NODE_WIDTH / 2, halfH: n.NODE_HEIGHT / 2};
  }

  private gatherMetaBoxOfRect(r: Konva.Rect): MetaBox {
    return {cx: r.x() + r.width() / 2, cy: r.y() + r.height() / 2, halfW: r.width() / 2, halfH: r.height() / 2};
  }

  /** Whether the straight chord between an edge's endpoint boxes runs
   *  through any other node's box. */
  private straightChordPiercesNode(edge: DAEdge, allNodes: DANode[]): boolean {
    const a = this.host.getNodeCenterInLayerCoordinates(edge.srcNode);
    const b = this.host.getNodeCenterInLayerCoordinates(edge.destNode);
    for (const node of allNodes) {
      if (node === edge.srcNode || node === edge.destNode) continue;
      if (!node.group.visible()) continue;
      if (lineSegmentIntersectsRect(
        a.x, a.y, b.x, b.y,
        node.group.x(), node.group.y(),
        node.group.x() + node.NODE_WIDTH, node.group.y() + node.NODE_HEIGHT,
      )) {
        return true;
      }
    }
    return false;
  }

  /** Where a ray from a box's center exits its (axis-aligned) boundary. */
  private rectBoundaryPoint(
    center: {x: number; y: number},
    halfW: number,
    halfH: number,
    u: {x: number; y: number},
  ): {x: number; y: number} {
    const tx = Math.abs(u.x) < 1e-9 ? Infinity : halfW / Math.abs(u.x);
    const ty = Math.abs(u.y) < 1e-9 ? Infinity : halfH / Math.abs(u.y);
    const t = Math.min(tx, ty);
    return {x: center.x + u.x * t, y: center.y + u.y * t};
  }

  ungather(): void {
    this.host.finishTweens();
    if (this.gatheredNodePositions.size === 0) {
      this.host.emitStatus('Nothing to ungather.');
      return;
    }
    this.restoreGatheredNodes();
  }

  private restoreGatheredNodes(animate = true): void {
    if (this.gatherDeferredRouting !== null) {
      clearTimeout(this.gatherDeferredRouting);
      this.gatherDeferredRouting = null;
    }
    // Hidden pile edges come back; the meta-node/meta-edge overlays go away.
    for (const edge of this.gatherHiddenEdges) {
      edge.group.visible(true);
    }
    this.gatherHiddenEdges = [];
    for (const indicator of this.gatherIndicators) {
      indicator.destroy();
    }
    this.gatherIndicators = [];
    // Original stacking order of the layer (stacks called moveToTop).
    if (this.gatherZOrder) {
      const layer = this.host.drawingLayer;
      this.gatherZOrder
        .filter(child => child.getParent() === layer)
        .forEach((child, i) => child.zIndex(i));
      this.gatherZOrder = null;
    }
    this.gatherAnchor = null;
    this.gatherPinned = false;

    // Put back the pre-gather wiring exactly (gather re-routed the edges
    // around the temporary arrangement).
    const restoreEdgeWiring = () => {
      for (const [edge, cps] of this.gatheredEdgeControlPoints) {
        edge.restoreControlPoints(cps);
      }
      this.gatheredEdgeControlPoints.clear();
    };

    if (!animate) {
      const moved = [...this.gatheredNodePositions.keys()];
      for (const [node, pos] of this.gatheredNodePositions) {
        node.group.position(pos);
      }
      this.gatheredNodePositions.clear();
      restoreEdgeWiring();
      this.host.updateEdgesForResizedNodes(moved);
      this.host.drawingLayer.batchDraw();
      return;
    }

    for (const [node, pos] of this.gatheredNodePositions) {
      this.host.tweens.push(new Konva.Tween({
        node: node.group,
        x: pos.x,
        y: pos.y,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          this.host.updateEdgesForResizedNodes([node]);
          this.host.drawingLayer.batchDraw();
        },
      }).play());
    }
    this.gatheredNodePositions.clear();
    restoreEdgeWiring();
  }

  /** Auto-select the first edge of the given direction on a node, if any. */
  /** Anchor priority: the node you're on (crosshairs), then the traversal's
   *  current node — an in-progress journey continues from where it is — and
   *  only then the selection. A selection is a way to START a journey; it
   *  must not keep hijacking the anchor after the traversal moves on
   *  (checking it first made every Go re-anchor at the selected node,
   *  2026-07-16 dogfood bug). */
}
