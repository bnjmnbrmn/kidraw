export interface DALabelSnapshot {
  id: string;
  /** Rendered position. Derived from (edgeT, side) when those are present;
   *  the source of truth only in legacy snapshots that predate anchors. */
  x: number;
  y: number;
  text: string;
  fontSize: number;
  isSelected: boolean;
  /** Anchor: arc-length fraction along the edge path (0..1). Absent in
   *  legacy snapshots — restore derives it by projecting x/y onto the path. */
  edgeT?: number;
  side?: import('./edge-label-anchor').EdgeLabelSide;
}

export interface DANodeSnapshot {
  id: string;
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
  fontSize: number;
  isSelected: boolean;
  nodeShape?: import('./command.model').NodeShape;
  textOverflowMode?: import('./command.model').TextOverflowMode;
  baseWidth?: number;
  baseHeight?: number;
  baseFontSize?: number;
  pinned?: boolean;
  /** Semantic tags from the graph document. Kept in the runtime snapshot so
   *  save/undo/layout operations do not erase type information. */
  tags?: string[];
}

/** A bend point on an edge's polyline. `waypointId` is set on editable bend
 *  points (including a self-loop's two initial bends), which render as
 *  `DAWaypoint` glyphs; `pinned` indicates a waypoint that routers should
 *  preserve in place. Plain bead points written by routers have neither. */
export interface DAControlPointSnapshot {
  x: number;
  y: number;
  waypointId?: string;
  pinned?: boolean;
}

export interface DAEdgeSnapshot {
  id: string;
  srcNodeId: string;
  destNodeId: string;
  isSelected: boolean;
  labels: DALabelSnapshot[];
  controlPoints?: DAControlPointSnapshot[];
  directedness?: import('./command.model').EdgeDirectedness;
  lineStyle?: import('./command.model').LineStyle;
  /** Semantic tags from the graph document (for example `component-of` or
   *  `depends-on`). Layout uses these to distinguish hierarchy edges from
   *  cross-links. */
  tags?: string[];
}

export interface GraphSnapshot {
  nodes: DANodeSnapshot[];
  edges: DAEdgeSnapshot[];
  /** Id of the identity extension (diagram type) bound to this graph;
   *  absent means 'default'. Persisted as the graph doc's `type`. */
  diagramType?: string;
  /** Legacy (plugin v0): identity was recorded as plugins: ['todo-graph'].
   *  Read for migration on restore/load; no longer written. */
  plugins?: string[];
}
