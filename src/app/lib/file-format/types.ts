/**
 * KiDraw file-format types. See kidraw-file-format.md.
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
  tagStyles?: { [tag: string]: StyleProps };
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
  tagStyles?: { [tag: string]: StyleProps };
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

export interface NodeStyleProps extends StyleProps {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  shape?: NodeShapeName;
}

export type NodeShapeName = 'box' | 'circle' | 'diamond' | 'junction';

export interface EdgeStyleProps extends StyleProps {
  lineStyle?: LineStyleName;
  waypoints?: { x: number; y: number }[];
  labelOffsets?: { dx: number; dy: number }[];
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
