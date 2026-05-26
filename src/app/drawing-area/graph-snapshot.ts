export interface DALabelSnapshot {
  id: string;
  /** Absolute world position. Set even when anchor is present (last-known
   *  rendered position; used for hit-tests before refreshGeometry runs). */
  x: number;
  y: number;
  text: string;
  fontSize: number;
  isSelected: boolean;
  /** Path-anchored position along the parent edge's polyline, see
   *  notes/idea-edge-labels.md. When present, `x` and `y` are derived from
   *  this against the edge's current polyline on restore. Absent for legacy
   *  snapshots (pre path-anchoring); restore re-projects (x, y) to derive. */
  anchorT?: number;
  anchorOffset?: number;
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
}
