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
  /** Ids of plugins active on this graph (their style defaults apply to
   *  newly created nodes). Persisted as the graph doc's `plugins` list. */
  plugins?: string[];
}
