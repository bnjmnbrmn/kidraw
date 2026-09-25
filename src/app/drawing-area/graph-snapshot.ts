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
  /** Colors chosen for this node, over the theme's. Named as in a style file. */
  fill?: string;
  stroke?: string;
  textColor?: string;
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
  /** Colors chosen for this edge, over the theme's. Named as in a style file. */
  stroke?: string;
  fill?: string;
}

export interface GraphSnapshot {
  nodes: DANodeSnapshot[];
  edges: DAEdgeSnapshot[];
  /** Id of the identity plugin (diagram type) bound to this graph;
   *  absent means 'default'. Persisted as the graph doc's `type`. */
  diagramType?: string;
  /** Legacy (plugin v0): identity was recorded as plugins: ['todo-graph'].
   *  Read for migration on restore/load; no longer written. */
  plugins?: string[];
}

/** A node's chosen colors in snapshot form: only the ones it has. */
export function nodeColorFields(colors: {fill?: string; stroke?: string; text?: string} | null):
    Pick<DANodeSnapshot, 'fill' | 'stroke' | 'textColor'> {
  return {
    ...(colors?.fill ? {fill: colors.fill} : {}),
    ...(colors?.stroke ? {stroke: colors.stroke} : {}),
    ...(colors?.text ? {textColor: colors.text} : {}),
  };
}

/** The colors a node snapshot chose, or null for none. */
export function nodeColorsOf(n: Pick<DANodeSnapshot, 'fill' | 'stroke' | 'textColor'>):
    {fill?: string; stroke?: string; text?: string} | null {
  if (!n.fill && !n.stroke && !n.textColor) return null;
  return {
    ...(n.fill ? {fill: n.fill} : {}),
    ...(n.stroke ? {stroke: n.stroke} : {}),
    ...(n.textColor ? {text: n.textColor} : {}),
  };
}

/** An edge's chosen colors in snapshot form: only the ones it has. */
export function edgeColorFields(colors: {stroke?: string; fill?: string} | null):
    Pick<DAEdgeSnapshot, 'stroke' | 'fill'> {
  return {
    ...(colors?.stroke ? {stroke: colors.stroke} : {}),
    ...(colors?.fill ? {fill: colors.fill} : {}),
  };
}

/** Just the color fields that are set; a style file names them the same way. */
export function pickNodeColors(n: Pick<DANodeSnapshot, 'fill' | 'stroke' | 'textColor'>):
    Pick<DANodeSnapshot, 'fill' | 'stroke' | 'textColor'> {
  return nodeColorFields(nodeColorsOf(n));
}

/** The colors an edge snapshot chose, or null for none. */
export function edgeColorsOf(e: Pick<DAEdgeSnapshot, 'stroke' | 'fill'>): {stroke?: string; fill?: string} | null {
  const fields = edgeColorFields(e);
  return Object.keys(fields).length > 0 ? fields : null;
}
