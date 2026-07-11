/**
 * KiDraw file-format types. See docs/file-format.md.
 *
 * Two kinds of files:
 *   - Graph document (*.kidraw.json / .yaml): semantic content only.
 *   - Style set    (*.kd-style.json / .yaml): presentation, may import others.
 *
 * Graph documents reference style sets via the styles[] array. Each entry is
 * either a relative path (string) or an inline style-set body (object).
 */

// ─── Graph document ───────────────────────────────────────────────────────

export interface KidrawGraphDoc {
  kidraw: 1;
  styles: StyleRef[];
  semantics: GraphSemantics;
  /** Ids of app plugins active on this graph (e.g. 'todo-graph'). A plugin's
   *  style defaults apply to nodes created while it is active. */
  plugins?: string[];
}

export type StyleRef = string | InlineStyleSet;

export interface GraphSemantics {
  nodes: { [nodeId: string]: NodeSemantics };
  edges: { [edgeId: string]: EdgeSemantics };
}

export interface NodeSemantics {
  label?: string;
  description?: string;
  notes?: string;
  tags?: string[];
}

export interface EdgeSemantics {
  from: string;
  to: string;
  directed?: EdgeDirected;
  tags?: string[];
  labels?: EdgeLabel[];
}

export type EdgeDirected = 'directed' | 'undirected' | 'bidirectional';

export interface EdgeLabel {
  text: string;
}

// ─── Style sets ───────────────────────────────────────────────────────────

/** A style set saved as its own file. */
export interface KidrawStyleSet {
  kdStyle: 1;
  imports?: string[];
  tagStyles?: { [tag: string]: TagStyleProps };
  nodes?: { [nodeId: string]: NodeStyleProps };
  edges?: { [edgeId: string]: EdgeStyleProps };
  view?: Viewport;
}

/**
 * A style set declared inline inside a graph document. Same shape as
 * KidrawStyleSet but identified by `name` rather than a filename, and
 * without the `kdStyle` version marker (the enclosing graph doc has
 * `kidraw: 1` which is enough).
 */
export interface InlineStyleSet {
  name: string;
  imports?: string[];
  tagStyles?: { [tag: string]: TagStyleProps };
  nodes?: { [nodeId: string]: NodeStyleProps };
  edges?: { [edgeId: string]: EdgeStyleProps };
  view?: Viewport;
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface StyleProps {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textColor?: string;
  fontSize?: number;
  opacity?: number;
}

/**
 * Values inside `tagStyles`. A tag can be applied to either a node or an
 * edge, so its rule may legally carry any element-applicable property.
 */
export type TagStyleProps = NodeStyleProps & EdgeStyleProps;

export interface NodeStyleProps extends StyleProps {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  shape?: NodeShapeName;
  textOverflow?: TextOverflowName;
}

export type NodeShapeName = 'box' | 'circle' | 'diamond' | 'junction' | 'invisible';

export type TextOverflowName =
  | 'clip'
  | 'shrink-font'
  | 'ellipsis'
  | 'widen-h'
  | 'widen-v'
  | 'widen-both'
  | 'fit';

export interface EdgeStyleProps extends StyleProps {
  lineStyle?: LineStyleName;
  waypoints?: WaypointSpec[];
  labelOffsets?: { dx: number; dy: number }[];
}

/** A bend point on an edge. Plain router-generated points use just `x`/`y`;
 *  user-placed waypoints additionally carry `id` (stable identifier so undo/
 *  redo and reload preserve identity) and `pinned` (routers preserve the
 *  position when re-routing). */
export interface WaypointSpec {
  x: number;
  y: number;
  id?: string;
  pinned?: boolean;
}

export type LineStyleName = 'solid' | 'dashed' | 'dotted';

// ─── Parse results ────────────────────────────────────────────────────────

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: string): ParseResult<T> {
  return { ok: false, error };
}

// ─── Helpers / type guards ────────────────────────────────────────────────

export function isInlineStyleSet(ref: StyleRef): ref is InlineStyleSet {
  return typeof ref !== 'string';
}

export function styleRefId(ref: StyleRef): string {
  return typeof ref === 'string' ? ref : ref.name;
}

/** Convert an InlineStyleSet body to a standalone KidrawStyleSet (strip the name, add kdStyle marker). */
export function inlineToStyleSet(inline: InlineStyleSet): KidrawStyleSet {
  const { name: _name, ...body } = inline;
  return { kdStyle: 1, ...body };
}
