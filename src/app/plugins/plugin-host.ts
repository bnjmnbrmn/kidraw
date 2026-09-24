import type {NodeShape} from '../drawing-area/command.model';
import type {GraphOperation} from '../drawing-area/graph-operations';

/** A node as a plugin sees it: plain data, never the Konva object. */
export interface PluginNode {
  readonly id: string;
  readonly label: string;
  readonly tags: readonly string[];
  readonly shape: NodeShape;
}

/**
 * What a plugin's commands may use (notes/design-plugins.md).
 *
 * Reads are plain data. The one write is `apply`, which runs graph operations
 * as a single undo group — so a plugin's change undoes, saves and (later)
 * syncs like any other, and no plugin touches Konva. The drawing area lends
 * this; `AgentCanvasTarget` is the same idea for agents.
 */
export interface PluginHost {
  /** The graph's diagram type: the id of the plugin bound as its identity. */
  diagramType(): string;
  /** What a command acts on: the selected nodes, else the node under the crosshairs. */
  targetNodes(): PluginNode[];
  /** Apply operations as one undo group, all or nothing, before returning.
   *  Returns a conflict message, having changed nothing, or null. Synchronous
   *  on purpose: a command that awaited between reading the graph and writing
   *  it would let the next key press plan against a graph it has not changed. */
  apply(label: string, operations: GraphOperation[]): string | null;
  /** Say something in the header's status line. */
  status(message: string): void;
}
