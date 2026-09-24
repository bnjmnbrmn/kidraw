/**
 * Rearranging the graph: the layouts (graph-layout.ts), and edge routing —
 * of the whole graph or of what the selection reaches, in a Web Worker with
 * a countdown and a hard timeout, so a graph that will not converge cannot
 * freeze the page — plus the quick single-edge routing that keeps a new
 * edge, or a dragged node's edges, clear of the rest.
 */
import { DACommandType, LayoutType, RoutingAlgorithm } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { DAEdge } from './da-edge';
import type { DANode } from './da-node';
import type { DrawingLayer } from './drawing.layer';
import { applyLayout, isClearLayout, layoutSpacingFor } from './graph-layout';
import {
  applyDesiderataRouteEdges,
  DEFAULT_OPTIONS as DESIDERATA_DEFAULTS,
} from './desiderata-route-edges';
import {
  applyBezierFitWeightedChainEdges,
  DEFAULT_OPTIONS as BFWC_FIT_DEFAULTS,
  DEFAULT_WC_OPTIONS as BFWC_WC_DEFAULTS,
} from './bezier-fit-weighted-chain-edges';
import {
  applyIncrementalDesiderataRouteEdges,
  DEFAULT_OPTIONS as INCREMENTAL_DEFAULTS,
} from './incremental-desiderata-route-edges';
import {
  routeNewEdgeIncrementally,
  applyIncrementalDesiderataV3RouteEdges,
  DEFAULT_OPTIONS as INCREMENTAL_V3_DEFAULTS,
} from './incremental-desiderata-v3-route-edges';
import type { RoutingRequest, RoutingResponse } from './routing-worker-messages';

/** What layout and routing need from the drawing area. */
export interface LayoutHost {
  readonly drawingLayer: DrawingLayer;
  finishTweens(): void;
  /** Record the graph as it is now as an undo step. */
  pushUndoSnapshot(): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  refreshWaypointVisibility(draw: boolean): void;
  /** Score the routing for the metrics panel. */
  computeMetrics(nodes: DANode[], edges: DAEdge[]): void;
  /** Show a status message. Not logged: the countdown ticks ten times a
   *  second. */
  status(message: string): void;
  log(message: string): void;
}

/** How long a routing pass may run before it is abandoned. */
const ROUTING_TIMEOUT_MS = 15000;

export class LayoutController {
  /** The routing algorithm last applied; a layout routes the edges it moved
   *  with it (incremental-desiderata-v3 until one has been). */
  private lastAppliedRouting: RoutingAlgorithm | null = null;
  /** The routing run in flight: its worker, its countdown and its deadline. */
  private worker: Worker | null = null;
  private countdown: ReturnType<typeof setInterval> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: LayoutHost) {}

  /** Rearranging the graph: layouts and edge routing. */
  commands() {
    return {
      [DACommandType.APPLY_LAYOUT]: c => this.applyLayout(c.layout),
      [DACommandType.APPLY_EDGE_ROUTING]: c => this.applyEdgeRouting(c.algorithm),
    } satisfies CommandSlice;
  }

  /** Whether a routing pass is in flight; graph edits wait until it is done.
   *  (The browser scripts poll this.) */
  get running(): boolean {
    return this.worker !== null;
  }

  /** Lay out the selected nodes, or all of them, then route the edges the
   *  layout moved. */
  applyLayout(layout: LayoutType): void {
    this.host.finishTweens();
    this.host.pushUndoSnapshot();
    const layer = this.host.drawingLayer;
    const allNodes = layer.getDANodes();
    const allEdges = layer.getDAEdges();

    const selectedNodes = allNodes.filter(n => n.isSelected);
    const nodes = selectedNodes.length > 0 ? selectedNodes : allNodes;
    const nodeSet = new Set(nodes);
    const edges = allEdges.filter(e => nodeSet.has(e.srcNode) && nodeSet.has(e.destNode));

    const crossLinks = applyLayout(layout, nodes, edges, layoutSpacingFor(nodes, layout));
    this.host.updateEdgesForResizedNodes(allNodes);

    // The layout moved nodes wholesale, so pre-existing unpinned waypoints on
    // affected edges now describe meaningless detours — drop them (pinned
    // waypoints survive setControlPoints) and re-route to fit the new
    // positions. The "-clear" variants keep tree/skeleton edges straight;
    // for the tree-clears the layout hands back the NON-TREE cross-links,
    // whose straight chords legitimately pierce nodes the tree geometry
    // can't move — those still get routed, against everything else frozen.
    const touchedEdges = allEdges.filter(
      e => nodeSet.has(e.srcNode) || nodeSet.has(e.destNode));
    for (const e of touchedEdges) e.setControlPoints([]);
    layer.batchDraw();
    if (isClearLayout(layout)) {
      if (crossLinks.length > 0) {
        this.host.status(`Layout applied — tree edges straight, routing ${crossLinks.length} cross-link${crossLinks.length === 1 ? '' : 's'}.`);
        this.applyEdgeRouting(
          this.lastAppliedRouting ?? 'incremental-desiderata-v3', crossLinks);
      } else {
        this.host.status('Layout applied — edges left straight (clear variant).');
      }
      return;
    }
    this.applyEdgeRouting(
      this.lastAppliedRouting ?? 'incremental-desiderata-v3', touchedEdges);
  }

  /** Route `explicitEdges`, or what the selection scopes, holding the rest
   *  of the graph's edges in place as obstacles. */
  applyEdgeRouting(algorithm: RoutingAlgorithm, explicitEdges?: DAEdge[]): void {
    this.host.finishTweens();
    const allNodes = this.host.drawingLayer.getDANodes();
    const allEdges = this.host.drawingLayer.getDAEdges();

    const routeEdges = explicitEdges && explicitEdges.length > 0
      ? explicitEdges
      : this.routingScopeFromSelection(allEdges);
    const routeSet = new Set(routeEdges);
    // When routing only a subset, the other edges stay put but still act as
    // obstacles so the routed edges weave around them rather than overlap.
    const frozenEdges = routeSet.size < allEdges.length
      ? allEdges.filter(e => !routeSet.has(e))
      : [];

    this.routeInWorker(algorithm, allNodes, allEdges, routeEdges, frozenEdges);
  }

  /** What the routing commands act on. Selected edges win; otherwise selected
   *  nodes scope routing to their outgoing edges and, recursively, every edge
   *  reachable from them along outgoing edges (the whole subtree's wiring);
   *  with no selection the whole graph is routed. */
  private routingScopeFromSelection(allEdges: DAEdge[]): DAEdge[] {
    const selectedEdges = allEdges.filter(e => e.isSelected);
    if (selectedEdges.length > 0) return selectedEdges;
    const selectedNodes = this.host.drawingLayer.getSelectedDANodes();
    if (selectedNodes.length === 0) return allEdges;
    const inScope = new Set<DANode>(selectedNodes);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of allEdges) {
        if (inScope.has(e.srcNode) && !inScope.has(e.destNode)) {
          inScope.add(e.destNode);
          grew = true;
        }
      }
    }
    return allEdges.filter(e => inScope.has(e.srcNode));
  }

  /** Run the chosen edge-routing algorithm in the Web Worker with a live
   *  countdown and a hard timeout, so a non-converging graph can't freeze the
   *  UI. Falls back to synchronous routing where Worker is unavailable. */
  private routeInWorker(
    algorithm: RoutingAlgorithm,
    allNodes: DANode[], allEdges: DAEdge[], routeEdges: DAEdge[], frozenEdges: DAEdge[],
  ): void {
    this.stop(); // supersede any in-flight run

    if (typeof Worker === 'undefined') {
      this.applyRoutingSync(algorithm, allNodes, allEdges, routeEdges, frozenEdges);
      return;
    }

    const request: RoutingRequest = {
      algorithm,
      nodes: allNodes.map(n => ({
        id: n.id, x: n.konvaGroup.x(), y: n.konvaGroup.y(),
        width: n.NODE_WIDTH, height: n.NODE_HEIGHT, shape: n.nodeShape,
      })),
      routeEdges: routeEdges.map(e => ({ id: e.id, srcId: e.srcNode.id, destId: e.destNode.id })),
      frozenEdges: frozenEdges.map(e => ({
        id: e.id, srcId: e.srcNode.id, destId: e.destNode.id,
        controlPoints: e.controlPoints.map(p => ({ x: p.x, y: p.y })),
      })),
    };

    let worker: Worker;
    try {
      worker = new Worker(new URL('./routing.worker', import.meta.url));
    } catch {
      this.applyRoutingSync(algorithm, allNodes, allEdges, routeEdges, frozenEdges);
      return;
    }
    this.worker = worker;

    worker.onmessage = ({ data }: MessageEvent<RoutingResponse>) => {
      this.stop();
      this.applyRoutedControlPoints(data, allNodes, allEdges);
      this.lastAppliedRouting = algorithm;
      const unclean = data.uncleanEdgeIds?.length ?? 0;
      this.host.status(unclean > 0
        ? `⚠ ${unclean} edge${unclean === 1 ? '' : 's'} could not be routed cleanly.`
        : '');
    };
    worker.onerror = () => {
      this.stop();
      this.host.status('⚠ Layout failed (routing error).');
    };

    const deadline = Date.now() + ROUTING_TIMEOUT_MS;
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now()) / 1000;
      this.host.status(`Calculating layout… ${remaining.toFixed(1)}s`);
    };
    tick();
    this.countdown = setInterval(tick, 100);
    this.deadline = setTimeout(() => {
      this.stop();
      this.host.status(`⚠ Layout gave up after ${ROUTING_TIMEOUT_MS / 1000}s — graph too complex to converge.`);
    }, ROUTING_TIMEOUT_MS);

    worker.postMessage(request);
  }

  /** Apply the control points the worker computed onto the live edges. Edges
   *  removed while routing ran are simply skipped. */
  private applyRoutedControlPoints(result: RoutingResponse, allNodes: DANode[], allEdges: DAEdge[]): void {
    this.host.pushUndoSnapshot();
    const byId = new Map(allEdges.map(e => [e.id, e]));
    for (const routed of result.edges) {
      const edge = byId.get(routed.id);
      if (!edge) continue;
      edge.setControlPoints(routed.controlPoints);
      edge.setSmoothRendering(true);
      edge.promoteToWaypoints();
    }
    this.host.refreshWaypointVisibility(false);
    this.host.drawingLayer.batchDraw();
    this.host.computeMetrics(allNodes, allEdges);
  }

  /** Synchronous routing fallback for environments without Web Workers. */
  private applyRoutingSync(
    algorithm: RoutingAlgorithm,
    allNodes: DANode[], allEdges: DAEdge[], routeEdges: DAEdge[], frozenEdges: DAEdge[],
  ): void {
    this.host.pushUndoSnapshot();
    const log = (msg: string) => this.host.log(msg);
    let unclean = 0;
    switch (algorithm) {
      case 'bezier-fit-weighted-chain':
        applyBezierFitWeightedChainEdges(allNodes, routeEdges, BFWC_FIT_DEFAULTS, BFWC_WC_DEFAULTS, log, frozenEdges);
        break;
      case 'incremental-desiderata-v2': {
        const stats = applyIncrementalDesiderataRouteEdges(allNodes, routeEdges, INCREMENTAL_DEFAULTS, log, frozenEdges);
        unclean = stats.uncleanEdges.length;
        break;
      }
      case 'incremental-desiderata-v3': {
        const stats = applyIncrementalDesiderataV3RouteEdges(allNodes, routeEdges, INCREMENTAL_V3_DEFAULTS, log, frozenEdges);
        unclean = stats.uncleanEdges.length;
        break;
      }
      case 'desiderata':
      default:
        applyDesiderataRouteEdges(allNodes, routeEdges, DESIDERATA_DEFAULTS, log, frozenEdges);
        break;
    }
    routeEdges.forEach(e => { e.setSmoothRendering(true); e.promoteToWaypoints(); });
    this.host.drawingLayer.batchDraw();
    this.lastAppliedRouting = algorithm;
    if (unclean > 0) {
      this.host.status(`⚠ ${unclean} edge${unclean === 1 ? '' : 's'} could not be routed cleanly.`);
    }
    this.host.computeMetrics(allNodes, allEdges);
  }

  /** Route a just-added edge with incremental-desiderata-v3, holding every
   *  other edge fixed. Synchronous — a single edge routes in milliseconds under
   *  the per-edge budgets. The undo snapshot for the add-edge command is pushed
   *  before the command mutates, so the routed shape is part of the same undo
   *  step as the edge itself. */
  autoRouteNewEdge(edge: DAEdge): void {
    const layer = this.host.drawingLayer;
    const clean = routeNewEdgeIncrementally(
      layer.getDANodes(),
      layer.getDAEdges(),
      edge,
      undefined,
      (msg: string) => this.host.log(msg),
    );
    edge.promoteToWaypoints();
    this.host.refreshWaypointVisibility(false);
    layer.batchDraw();
    if (!clean) {
      this.host.status('⚠ New edge could not be routed cleanly.');
    }
  }

  /** Re-route every edge incident to the given nodes with the same single-edge
   *  incremental pipeline used when adding an edge, holding the rest of the
   *  graph fixed. Runs at drag-step granularity (once per grid step, not per
   *  animation frame). Edges are re-routed one at a time, each seeing the
   *  previous ones' fresh routes; pinned user waypoints survive via
   *  setControlPoints' merge. Silent about unclean routes — a status message
   *  every repeat tick would spam; the route keeps improving as the node moves. */
  rerouteIncidentEdges(nodes: DANode[]): void {
    const incident = new Set<DAEdge>();
    nodes.forEach(n => n.connectedEdges.forEach(e => incident.add(e)));
    if (incident.size === 0) return;
    const allNodes = this.host.drawingLayer.getDANodes();
    const allEdges = this.host.drawingLayer.getDAEdges();
    for (const edge of incident) {
      routeNewEdgeIncrementally(allNodes, allEdges, edge, undefined, (msg: string) => this.host.log(msg));
      edge.promoteToWaypoints();
    }
    this.host.refreshWaypointVisibility(false);
    this.host.drawingLayer.batchDraw();
  }

  /** Tear down the in-flight routing run: stop the countdown + timeout and kill
   *  the worker. Safe to call when nothing is running. */
  stop(): void {
    if (this.countdown !== null) { clearInterval(this.countdown); this.countdown = null; }
    if (this.deadline !== null) { clearTimeout(this.deadline); this.deadline = null; }
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
}
