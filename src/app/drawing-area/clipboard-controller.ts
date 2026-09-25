/**
 * The graph's own clipboard: `y` yanks the selected nodes and the edges
 * wholly inside the selection, `x` cuts, `p` pastes. The payload is a
 * subgraph, not text, and nothing about it survives a page reload; the
 * labels' text also goes on the system clipboard, to paste into the agent
 * chat or another label.
 */
import { DACommandType } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DAWaypoint } from './da-waypoint';
import type { DrawingLayer } from './drawing.layer';
import type { GraphSnapshot } from './graph-snapshot';
import type { Point } from './utils';

/** What the clipboard needs from the drawing area. */
export interface ClipboardHost {
  readonly drawingLayer: DrawingLayer;
  getSelectedLabels(): DALabel[];
  labelUnderCrosshairs(): DALabel | null | undefined;
  waypointUnderCrosshairs(): DAWaypoint | undefined;
  nodeUnderCrosshairs(): DANode | null;
  crosshairsInLayerCoords(): Point;
  /** What Delete does: cut removes exactly that. */
  deleteSelected(): void;
  finishTweens(): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  checkAndEmitEditState(): void;
  emitStatus(message: string): void;
}

export class ClipboardController {
  private contents: GraphSnapshot | null = null;

  constructor(private readonly host: ClipboardHost) {}

  commands() {
    return {
      [DACommandType.COPY_SELECTION]: () => this.copy(),
      [DACommandType.CUT_SELECTION]: () => this.cut(),
      [DACommandType.PASTE_CLIPBOARD]: () => this.paste(),
    } satisfies CommandSlice;
  }

  /** What the clipboard holds (the browser tests read it). */
  get held(): GraphSnapshot | null {
    return this.contents;
  }

  copy(): void {
    const nodes = this.targetNodes();
    const sub = this.host.drawingLayer.copySubgraphOf(nodes);
    if (!sub) return this.host.emitStatus('Nothing to copy.');
    this.contents = sub;
    // Best effort: the browser may refuse the system clipboard.
    void navigator.clipboard?.writeText(nodes.map(node => node.label.text()).join('\n\n')).catch(() => {});
    const edges = sub.edges.length;
    this.host.emitStatus(`Copied ${count(sub.nodes.length, 'node')}${edges > 0 ? ` and ${count(edges, 'edge')}` : ''}.`);
  }

  /** `x`: copies the nodes the delete is about to remove, then deletes
   *  exactly what Delete would have — so cut stays a strict superset of the
   *  Delete it replaced and still removes waypoints, edges and labels, which
   *  the clipboard has no representation for (da-272). */
  cut(): void {
    const sub = this.host.drawingLayer.copySubgraphOf(this.targetNodes());
    if (sub) this.contents = sub;
    this.host.deleteSelected();
    this.host.emitStatus(sub ? `Cut ${count(sub.nodes.length, 'node')}.` : 'Deleted.');
    this.host.checkAndEmitEditState();
  }

  /** Drop the clipboard subgraph centered on the crosshairs, selected so it
   *  can be dragged straight away. */
  paste(): void {
    if (!this.contents) return this.host.emitStatus('Clipboard is empty.');
    this.host.finishTweens();
    const at = this.host.crosshairsInLayerCoords();
    const pasted = this.host.drawingLayer.pasteSubgraph(this.contents, at.x, at.y);
    this.host.updateEdgesForResizedNodes(pasted);
    this.host.drawingLayer.batchDraw();
    this.host.checkAndEmitEditState();
    this.host.emitStatus(`Pasted ${count(pasted.length, 'node')}.`);
  }

  /** The nodes the clipboard acts on: the selection when there is one;
   *  otherwise whatever the crosshairs are over, so `y` yanks the node you
   *  are looking at the way vim yanks the line you are on (da-272).
   *
   *  The guards mirror Delete's priority order, so a cut copies exactly what
   *  it is about to remove: with a waypoint, edge or label selected, delete
   *  acts on that and the clipboard takes nothing. Unselected, Delete takes
   *  the item the hover trace is around (label, waypoint, node, edge), so a
   *  label or waypoint under the crosshairs also leaves the clipboard empty. */
  private targetNodes(): DANode[] {
    const layer = this.host.drawingLayer;
    if (layer.getSelectedDAWaypoints().length > 0) return [];
    const selected = layer.getSelectedDANodes();
    if (selected.length > 0) return selected;
    if (layer.getSelectedDAEdges().length > 0 || this.host.getSelectedLabels().length > 0) return [];
    if (this.host.labelUnderCrosshairs() || this.host.waypointUnderCrosshairs()) return [];
    const hovered = this.host.nodeUnderCrosshairs();
    return hovered ? [hovered] : [];
  }
}

/** "1 node", "3 nodes". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
