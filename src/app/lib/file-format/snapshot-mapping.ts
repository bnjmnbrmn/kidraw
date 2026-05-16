/**
 * Maps between the runtime GraphSnapshot (in-memory / undo-redo / legacy
 * localStorage shape) and the file-format pair {KidrawGraphDoc, KidrawStyleSet}.
 *
 * Semantics vs. style split:
 *   - semantics (graph doc): node label + tags + description, edge from/to/
 *     directedness/labels (text only) + tags.
 *   - style (style set): positions, sizes, fonts, shape, line style,
 *     waypoints, label offsets, text-overflow mode.
 *
 * Runtime-only fields (excluded from both files):
 *   - isSelected (always reset to false on load)
 *   - baseWidth / baseHeight / baseFontSize (internal scaling reset values)
 *   - pinned (layout-session state)
 */

import {
  DAEdgeSnapshot,
  DALabelSnapshot,
  DANodeSnapshot,
  GraphSnapshot,
} from '../../drawing-area/graph-snapshot';
import {
  EdgeSemantics,
  EdgeStyleProps,
  KidrawGraphDoc,
  KidrawStyleSet,
  NodeSemantics,
  NodeStyleProps,
} from './types';

export const DEFAULT_NODE_WIDTH = 120;
export const DEFAULT_NODE_HEIGHT = 60;
export const DEFAULT_FONT_SIZE = 14;

export interface SnapshotToFilesOptions {
  /**
   * Relative path to the style file. If provided, the returned graph doc's
   * `styles` array will reference it. If omitted, `styles` is empty (caller
   * is expected to populate it — e.g. with an inline style).
   */
  stylePath?: string;
}

export function snapshotToFiles(
  snap: GraphSnapshot,
  options: SnapshotToFilesOptions = {},
): { doc: KidrawGraphDoc; style: KidrawStyleSet } {
  const semNodes: { [id: string]: NodeSemantics } = {};
  const styleNodes: { [id: string]: NodeStyleProps } = {};

  for (const n of snap.nodes) {
    const sem: NodeSemantics = {};
    if (n.text) sem.label = n.text;
    semNodes[n.id] = sem;

    const sp: NodeStyleProps = {
      x: n.x,
      y: n.y,
      w: n.width,
      h: n.height,
      fontSize: n.fontSize,
    };
    if (n.nodeShape && n.nodeShape !== 'box') sp.shape = n.nodeShape;
    if (n.textOverflowMode) sp.textOverflow = n.textOverflowMode;
    styleNodes[n.id] = sp;
  }

  const semEdges: { [id: string]: EdgeSemantics } = {};
  const styleEdges: { [id: string]: EdgeStyleProps } = {};

  for (const e of snap.edges) {
    const sem: EdgeSemantics = { from: e.srcNodeId, to: e.destNodeId };
    if (e.directedness) sem.directed = e.directedness;
    if (e.labels && e.labels.length > 0) {
      sem.labels = e.labels.map(l => ({ text: l.text }));
    }
    semEdges[e.id] = sem;

    const sp: EdgeStyleProps = {};
    if (e.lineStyle) sp.lineStyle = e.lineStyle;
    if (e.controlPoints && e.controlPoints.length > 0) {
      sp.waypoints = e.controlPoints.map(p => ({ x: p.x, y: p.y }));
    }
    if (e.labels && e.labels.length > 0) {
      // Snapshot stores absolute label positions; the file format calls these
      // labelOffsets. We preserve the values verbatim; meaning is up to the
      // renderer (currently treated as absolute world coords).
      sp.labelOffsets = e.labels.map(l => ({ dx: l.x, dy: l.y }));
    }
    if (Object.keys(sp).length > 0) styleEdges[e.id] = sp;
  }

  const doc: KidrawGraphDoc = {
    kidraw: 1,
    styles: options.stylePath ? [options.stylePath] : [],
    semantics: { nodes: semNodes, edges: semEdges },
  };

  const style: KidrawStyleSet = {
    kdStyle: 1,
    nodes: styleNodes,
    edges: styleEdges,
  };

  return { doc, style };
}

export function filesToSnapshot(
  doc: KidrawGraphDoc,
  resolvedStyle: KidrawStyleSet,
): GraphSnapshot {
  const styleNodes = resolvedStyle.nodes ?? {};
  const styleEdges = resolvedStyle.edges ?? {};

  const nodes: DANodeSnapshot[] = [];
  for (const [id, sem] of Object.entries(doc.semantics.nodes)) {
    const sp = styleNodes[id] ?? {};
    const node: DANodeSnapshot = {
      id,
      x: sp.x ?? 0,
      y: sp.y ?? 0,
      text: sem.label ?? '',
      width: sp.w ?? DEFAULT_NODE_WIDTH,
      height: sp.h ?? DEFAULT_NODE_HEIGHT,
      fontSize: sp.fontSize ?? DEFAULT_FONT_SIZE,
      isSelected: false,
    };
    if (sp.shape) node.nodeShape = sp.shape;
    if (sp.textOverflow) node.textOverflowMode = sp.textOverflow;
    nodes.push(node);
  }

  const edges: DAEdgeSnapshot[] = [];
  for (const [id, sem] of Object.entries(doc.semantics.edges)) {
    const sp = styleEdges[id] ?? {};
    const semLabels = sem.labels ?? [];
    const offsets = sp.labelOffsets ?? [];
    const labels: DALabelSnapshot[] = semLabels.map((lbl, i) => ({
      id: `${id}-label-${i}`,
      x: offsets[i]?.dx ?? 0,
      y: offsets[i]?.dy ?? 0,
      text: lbl.text,
      fontSize: DEFAULT_FONT_SIZE,
      isSelected: false,
    }));
    const edge: DAEdgeSnapshot = {
      id,
      srcNodeId: sem.from,
      destNodeId: sem.to,
      isSelected: false,
      labels,
    };
    if (sp.waypoints && sp.waypoints.length > 0) {
      edge.controlPoints = sp.waypoints.map(p => ({ x: p.x, y: p.y }));
    }
    if (sem.directed) edge.directedness = sem.directed;
    if (sp.lineStyle) edge.lineStyle = sp.lineStyle;
    edges.push(edge);
  }

  return { nodes, edges };
}
