/**
 * The canvas as seen by everything that is not the keyboard: agent mode
 * (agent/) and reading mode (reading/). They read the graph, the selection
 * and the view, point at nodes and highlight things, and change the graph
 * only through `applyChanges`, which plans graph operations and applies them
 * as one undo group, the same path undo takes (HistoryController.apply).
 * Neither sees Konva, and neither runs the keyboard's commands.
 *
 * CanvasPortSurface (canvas-port-surface.ts) implements it. The drawing area
 * owns this contract; its clients depend on it, never the other way round,
 * so agent mode can be taken out without the canvas noticing. Add no setters
 * for one client's convenience: a new need is a new change kind.
 *
 * Renamed from AgentCanvasTarget on 2026-09-26, when it had two clients.
 */

/** One change a client asks for. Node references are ids of existing nodes,
 *  or the handle of a node added earlier in the same batch. Edges are ids. */
export type CanvasChange =
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

export interface CanvasEditMeta {
  /** e.g. 'agent:codex' */
  author: string;
  /** Short description for undo and status, e.g. "Agent: explain recursion". */
  label: string;
  /** The change set this batch belongs to: one per agent turn. */
  changeSetId: string;
}

export interface CanvasChangeResult {
  ok: boolean;
  /** Why nothing was applied (a bad reference, or a conflict with newer edits). */
  error?: string;
  created: {kind: 'node' | 'edge'; id: string; handle?: string}[];
  /** Nodes added or changed, and the ends of added edges. */
  touchedNodeIds: string[];
}


export interface CanvasNode {
  id: string;
  label: string;
  tags: string[];
}

export interface CanvasEdge {
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

export interface CanvasPort {
  nodes(): CanvasNode[];
  edges(): CanvasEdge[];
  selection(): {nodeIds: string[]; edgeIds: string[]; underCrosshairsId: string | null};
  /** Nodes at least partly inside the usable viewport. */
  visibleNodeIds(): string[];
  zoomPercent(): number;
  /** Select the node and pan the view onto it. False if there is no such node. */
  focusNode(id: string): boolean;
  /** Replace the highlight set: node ids get a halo, edge ids are emphasized
   *  (a faint background link drawn at full strength). */
  setHighlights(ids: string[]): void;
  nodeClientRect(id: string): ClientRect | null;
  /** The usable viewport (inside header, keymenu, and panel insets). */
  viewClientRect(): ClientRect;
  /** The bound diagram type's id (see the plugin registry). */
  diagramTypeId(): string;
  /** Apply a batch as one undo group, all-or-nothing. */
  applyChanges(changes: CanvasChange[], meta: CanvasEditMeta): Promise<CanvasChangeResult>;
  /** Revert a change set (e.g. an agent turn). Resolves to a conflict message, or null. */
  revertChangeSet(changeSetId: string): Promise<string | null>;
}
