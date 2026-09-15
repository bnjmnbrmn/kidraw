/**
 * What agent mode needs from the drawing area. DrawingAreaComponent implements
 * this; the agent tools and caption overlay use only this surface, so the
 * canvas internals stay behind it.
 */

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
  /** Replace the agent's highlight set. */
  agentSetHighlights(ids: string[]): void;
  agentNodeClientRect(id: string): ClientRect | null;
  /** The usable viewport (inside header, keymenu, and panel insets). */
  agentViewClientRect(): ClientRect;
}
