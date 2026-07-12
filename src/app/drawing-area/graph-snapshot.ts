export interface DALabelSnapshot {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  isSelected: boolean;
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
}

/** A bend point on an edge's polyline. `waypointId` is set on user-placed
 *  bend points (which render as `DAWaypoint` glyphs); `pinned` indicates a
 *  user waypoint that routers should preserve in place. Plain bead points
 *  written by routers have neither field set. */
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
