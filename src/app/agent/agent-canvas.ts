/**
 * What agent mode needs from the drawing area. AgentCanvasSurface
 * (drawing-area/agent-canvas-surface.ts) implements this; the agent tools and
 * caption overlay use only this surface, so the canvas internals stay behind
 * it.
 *
 * Most of it reads the graph or guides the view. Agent edits come in through
 * `agentApplyChanges` only, which plans graph operations and applies them
 * through the same path as undo (DrawingAreaComponent.applyOperations); add no
 * other agent-specific setters.
 */

/** One change an agent asks for. Node references are ids of existing nodes,
 *  or the handle of a node added earlier in the same batch. Edges are ids. */
export type AgentChange =
  /** `nodeKind` names one of the diagram type's node kinds (e.g. "definition"); omit for a plain node. */
  | {kind: 'add_node'; text: string; handle?: string; near?: string; tags?: string[]; nodeKind?: string}
  /** `nodeKind: null` makes it a plain node. */
  | {kind: 'update_node'; node: string; text?: string; tags?: string[]; nodeKind?: string | null}
  | {kind: 'delete_node'; node: string}
  /** `edgeKind` names one of the diagram type's edge kinds (e.g. "supports", "path"). */
  | {kind: 'add_edge'; from: string; to: string; edgeKind?: string; label?: string}
  /** `edgeKind: null` makes it a plain edge; `label: ''` removes its label; `tags` replaces its tags. */
  | {kind: 'update_edge'; edge: string; label?: string; edgeKind?: string | null; tags?: string[]}
  | {kind: 'delete_edge'; edge: string}
  /** The whole reading order: every statement in order, listed again where it is read again. */
  | {kind: 'set_reading_order'; nodes: string[]}
  /** Lay the whole graph out top-down along its edges, after the rest of the batch. */
  | {kind: 'arrange'};

export interface AgentEditMeta {
  /** e.g. 'agent:codex' */
  author: string;
  /** Short description for undo and status, e.g. "Agent: explain recursion". */
  label: string;
  /** The change set this batch belongs to: one per agent turn. */
  changeSetId: string;
}

export interface AgentChangeResult {
  ok: boolean;
  /** Why nothing was applied (a bad reference, or a conflict with newer edits). */
  error?: string;
  created: {kind: 'node' | 'edge'; id: string; handle?: string}[];
  /** Nodes added or changed, and the ends of added edges. */
  touchedNodeIds: string[];
}


export interface AgentNodeInfo {
  id: string;
  label: string;
  tags: string[];
}

export interface AgentEdgeInfo {
  id: string;
  from: string;
  to: string;
  labels: string[];
  tags: string[];
}

/** A rectangle in browser viewport (client) coordinates. */
export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AgentCanvasTarget {
  agentNodes(): AgentNodeInfo[];
  agentEdges(): AgentEdgeInfo[];
  agentSelection(): {nodeIds: string[]; edgeIds: string[]; underCrosshairsId: string | null};
  /** Nodes at least partly inside the usable viewport. */
  agentVisibleNodeIds(): string[];
  agentZoomPercent(): number;
  /** Select the node and pan the view onto it. False if there is no such node. */
  agentFocusNode(id: string): boolean;
  /** Replace the highlight set: node ids get a halo, edge ids are emphasized
   *  (a faint background link drawn at full strength). */
  agentSetHighlights(ids: string[]): void;
  agentNodeClientRect(id: string): ClientRect | null;
  /** The usable viewport (inside header, keymenu, and panel insets). */
  agentViewClientRect(): ClientRect;
  /** The bound diagram type's id (see the plugin registry). */
  agentDiagramTypeId(): string;
  /** Apply a batch as one undo group, all-or-nothing. */
  agentApplyChanges(changes: AgentChange[], meta: AgentEditMeta): Promise<AgentChangeResult>;
  /** Revert a change set (e.g. an agent turn). Resolves to a conflict message, or null. */
  agentRevertChangeSet(changeSetId: string): Promise<string | null>;
}
