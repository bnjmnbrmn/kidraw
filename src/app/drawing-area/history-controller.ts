/**
 * The graph's history, and the write path that isn't a keymenu command.
 *
 * Undo and redo step back through two kinds of entry: whole-graph snapshots,
 * which the keyboard's commands take before they change anything, and groups
 * of operations, which is how agent edits and plugin commands change the graph
 * (graph-operations.ts). Applying a group is all or nothing: when the graph no
 * longer matches what its operations expect, nothing changes and the conflict
 * is reported instead. A change set (e.g. one agent turn) can be reverted as
 * one new group, even after later changes.
 *
 * Plugin commands run here too, since their one way to write is a group.
 */
import { DACommandType } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { DAEdge } from './da-edge';
import type { DANode } from './da-node';
import type { DrawingLayer } from './drawing.layer';
import { GraphOperationApplier } from './graph-operation-applier';
import { GraphOperation, UndoGroup, invertOperations } from './graph-operations';
import type { GraphSnapshot } from './graph-snapshot';
import type { UndoRedoService } from './undo-redo.service';
import { PluginCommandCall, PluginCommands } from '../plugins/plugin-commands';
import type { PluginHost, PluginNode } from '../plugins/plugin-host';
import { PLUGIN_REGISTRY, resolveIdentity } from '../plugins/plugin-registry';

/** What the history needs from the drawing area. */
export interface HistoryHost {
  readonly drawingLayer: DrawingLayer;
  readonly undoRedo: UndoRedoService;
  /** The selection, else the node under the crosshairs: what a plugin command acts on. */
  targetNodes(): DANode[];
  isPluginEnabled(id: string): boolean;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  autoRouteNewEdge(edge: DAEdge): void;
  finishTweens(): void;
  checkAndEmitEditState(): void;
  scheduleVaultAutoSave(): void;
  emitStatus(message: string): void;
  /** A snapshot is about to replace the graph: stop what was aimed at the
   *  old one (gestures, the label-edit ghost). */
  beforeGraphReplaced(): void;
  /** The graph was replaced: leave label editing, show the crosshairs. */
  afterGraphReplaced(): void;
}

/** A node as plugins see it: plain data, not the Konva object. */
function pluginNodeOf(node: DANode): PluginNode {
  return {id: node.id, label: node.label.text(), tags: [...node.tags], shape: node.nodeShape};
}

export class HistoryController {
  private applierInstance?: GraphOperationApplier;
  private pluginCommands?: PluginCommands;

  constructor(private readonly host: HistoryHost) {}

  commands() {
    return {
      [DACommandType.UNDO]: () => this.undo(),
      [DACommandType.REDO]: () => this.redo(),
      [DACommandType.PLUGIN_COMMAND]: c => this.runPluginCommand(c.call),
    } satisfies CommandSlice;
  }

  /** Built on first use: the layer arrives after construction. */
  private get applier(): GraphOperationApplier {
    return this.applierInstance ??= new GraphOperationApplier(this.host.drawingLayer, {
      nodesChanged: nodes => this.host.updateEdgesForResizedNodes(nodes),
      edgeAdded: edge => this.host.autoRouteNewEdge(edge),
    });
  }

  // ── Operations ──

  /**
   * Apply a group all-or-nothing within the current keystroke, record it for
   * undo, and save. Returns a conflict message instead, having changed
   * nothing. Synchronous so that a plugin command reading the graph and
   * writing it leaves no gap for a second key press to plan against a graph
   * the first has not changed.
   */
  apply(group: UndoGroup): string | null {
    this.host.finishTweens();
    const conflict = this.applier.apply(group.ops);
    if (conflict) return conflict;
    this.host.undoRedo.pushGroup(group);
    this.afterOperations();
    return null;
  }

  /** Undo every group of a change set (e.g. one agent turn) as one new undo
   *  group, even if other changes came after it. */
  revertChangeSet(changeSetId: string, author = 'user'): string | null {
    const groups = this.host.undoRedo.changeSetGroups(changeSetId);
    if (groups.length === 0) return `Nothing left to revert in ${changeSetId}`;
    return this.apply({
      author,
      label: `Revert ${groups[0].label}`,
      ops: invertOperations(groups.flatMap(group => group.ops)),
    });
  }

  private afterOperations(): void {
    this.host.drawingLayer.batchDraw();
    this.host.checkAndEmitEditState();
    this.host.scheduleVaultAutoSave();
  }

  // ── Undo and redo ──

  undo(): void {
    this.host.finishTweens();
    const entry = this.host.undoRedo.undo(this.host.drawingLayer.serializeGraph());
    if (!entry) return;
    if (entry.kind === 'group') this.replayGroup(entry.group, 'undo');
    else this.restoreSnapshot(entry.snapshot);
  }

  redo(): void {
    this.host.finishTweens();
    const entry = this.host.undoRedo.redo(this.host.drawingLayer.serializeGraph());
    if (!entry) return;
    if (entry.kind === 'group') this.replayGroup(entry.group, 'redo');
    else this.restoreSnapshot(entry.snapshot);
  }

  /** Undo a group (apply its inverse) or redo it, putting it back on its
   *  stack if the graph has changed in a way that conflicts. */
  private replayGroup(group: UndoGroup, direction: 'undo' | 'redo'): void {
    const conflict = this.applier.apply(direction === 'undo' ? invertOperations(group.ops) : group.ops);
    if (conflict) {
      if (direction === 'undo') this.host.undoRedo.cancelUndo();
      else this.host.undoRedo.cancelRedo();
      this.host.emitStatus(`Can't ${direction} "${group.label}": ${conflict}`);
      return;
    }
    this.afterOperations();
    this.host.emitStatus(`${direction === 'undo' ? 'Undid' : 'Redid'}: ${group.label}`);
  }

  private restoreSnapshot(snapshot: GraphSnapshot): void {
    this.host.beforeGraphReplaced();
    this.host.drawingLayer.restoreGraph(snapshot);
    this.host.drawingLayer.batchDraw();
    this.host.checkAndEmitEditState();
    this.host.afterGraphReplaced();
  }

  // ── Plugin commands ──

  /** Run a plugin's command. The table of them is built on first use. */
  private runPluginCommand(call: PluginCommandCall): void {
    this.pluginCommands ??= new PluginCommands(this.pluginHost(), PLUGIN_REGISTRY.values(),
      id => this.host.isPluginEnabled(id));
    if (!this.pluginCommands.run(call)) this.host.emitStatus(`No plugin has the command ${call.id}`);
  }

  /** What plugins' commands may use (plugins/plugin-host.ts). */
  private pluginHost(): PluginHost {
    const layer = () => this.host.drawingLayer;
    return {
      diagramType: () => layer().diagramType,
      identity: () => resolveIdentity(layer().diagramType),
      targetNodes: () => this.host.targetNodes().map(pluginNodeOf),
      apply: (label, ops: GraphOperation[]) => this.apply({author: 'user', label, ops}),
      status: message => this.host.emitStatus(message),
    };
  }
}
