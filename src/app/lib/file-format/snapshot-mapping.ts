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
 * Node style props resolve through the cascade
 *   app defaults -> identity extension defaults -> per-node file props,
 * and a per-node prop is only written when it differs from its resolved
 * cascade value. File `w`/`h`/`fontSize` are the node's *base* values (the
 * inputs — e.g. fit mode's max width), never the rendered size, which is
 * derived from base + text on every load (restoreGraph -> applyTextOverflow).
 *
 * Runtime-only fields (excluded from both files):
 *   - isSelected (always reset to false on load)
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
import { resolveIdentity } from '../../extensions/extension-registry';

/** App-level bottom of the node style cascade; mirrors DANode's defaults. */
export const APP_NODE_DEFAULTS = {
  shape: 'box',
  width: 120,
  height: 120,
  fontSize: 16,
  textOverflow: 'widen-both',
} as const;

export const DEFAULT_LABEL_FONT_SIZE = 14;

/** Identity for a graph: explicit diagramType/type, migrated from the legacy
 *  plugin v0 recording (plugins: ['todo-graph']) when absent. */
function identityOf(explicit: string | undefined, legacyPlugins: string[] | undefined): string {
  return explicit ?? (legacyPlugins?.includes('todo-graph') ? 'todo-graph' : 'default');
}

/** The fully resolved cascade values (app defaults overlaid with the identity
 *  extension's defaults) that per-node props are compared against / filled from. */
function cascadeDefaults(diagramType: string) {
  const d = resolveIdentity(diagramType).nodeDefaults;
  return {
    shape: d.shape ?? APP_NODE_DEFAULTS.shape,
    width: d.width ?? APP_NODE_DEFAULTS.width,
    height: d.height ?? APP_NODE_DEFAULTS.height,
    fontSize: d.fontSize ?? APP_NODE_DEFAULTS.fontSize,
    textOverflow: d.textOverflow ?? APP_NODE_DEFAULTS.textOverflow,
  };
}

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
  const diagramType = identityOf(snap.diagramType, snap.plugins);
  const def = cascadeDefaults(diagramType);

  const semNodes: { [id: string]: NodeSemantics } = {};
  const styleNodes: { [id: string]: NodeStyleProps } = {};

  for (const n of snap.nodes) {
    const sem: NodeSemantics = {};
    if (n.text) sem.label = n.text;
    semNodes[n.id] = sem;

    // Persist base values (the inputs), never derived rendered sizes, and
    // only when they deviate from the cascade.
    const sp: NodeStyleProps = { x: n.x, y: n.y };
    const w = n.baseWidth ?? n.width;
    const h = n.baseHeight ?? n.height;
    const fontSize = n.baseFontSize ?? n.fontSize;
    if (w !== def.width) sp.w = w;
    if (h !== def.height) sp.h = h;
    if (fontSize !== def.fontSize) sp.fontSize = fontSize;
    if (n.nodeShape && n.nodeShape !== def.shape) sp.shape = n.nodeShape;
    if (n.textOverflowMode && n.textOverflowMode !== def.textOverflow) {
      sp.textOverflow = n.textOverflowMode;
    }
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
      sp.waypoints = e.controlPoints.map(p => ({
        x: p.x,
        y: p.y,
        ...(p.waypointId ? {id: p.waypointId} : {}),
        ...(p.pinned ? {pinned: true} : {}),
      }));
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
    ...(diagramType !== 'default' ? { type: diagramType } : {}),
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

  const diagramType = identityOf(doc.type, doc.plugins);
  const def = cascadeDefaults(diagramType);

  const nodes: DANodeSnapshot[] = [];
  for (const [id, sem] of Object.entries(doc.semantics.nodes)) {
    const sp = styleNodes[id] ?? {};
    // File props are base values; missing ones fill from the cascade. The
    // rendered size is re-derived from base + text on restore.
    const width = sp.w ?? def.width;
    const height = sp.h ?? def.height;
    const fontSize = sp.fontSize ?? def.fontSize;
    const node: DANodeSnapshot = {
      id,
      x: sp.x ?? 0,
      y: sp.y ?? 0,
      text: sem.label ?? '',
      width,
      height,
      fontSize,
      baseWidth: width,
      baseHeight: height,
      baseFontSize: fontSize,
      isSelected: false,
      nodeShape: sp.shape ?? def.shape,
      textOverflowMode: sp.textOverflow ?? def.textOverflow,
    };
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
      fontSize: DEFAULT_LABEL_FONT_SIZE,
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
      edge.controlPoints = sp.waypoints.map(p => ({
        x: p.x,
        y: p.y,
        ...(p.id ? {waypointId: p.id} : {}),
        ...(p.pinned ? {pinned: true} : {}),
      }));
    }
    if (sem.directed) edge.directedness = sem.directed;
    if (sp.lineStyle) edge.lineStyle = sp.lineStyle;
    edges.push(edge);
  }

  return {
    nodes,
    edges,
    ...(diagramType !== 'default' ? { diagramType } : {}),
  };
}
