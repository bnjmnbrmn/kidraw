import { GraphSnapshot } from './graph-snapshot';
import { UndoGroup } from './graph-operations';

/**
 * One step of history.
 *
 * - `snapshot`: the whole graph as it was before a keymenu edit. Undoing it
 *   restores that graph (and so rewinds everything after it).
 * - `group`: an undo group of operations. Undoing it applies their inverse,
 *   which leaves unrelated later changes alone; this is how agent edits are
 *   recorded, and where user edits are headed
 *   (notes/idea-multiplayer-readiness.md).
 */
export type UndoEntry =
  | { kind: 'snapshot'; snapshot: GraphSnapshot }
  | { kind: 'group'; group: UndoGroup };

export class UndoRedoService {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private readonly maxEntries = 100;

  pushSnapshot(snapshot: GraphSnapshot): void {
    this.push({ kind: 'snapshot', snapshot });
  }

  pushGroup(group: UndoGroup): void {
    this.push({ kind: 'group', group });
  }

  private push(entry: UndoEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** Take the latest step off the undo stack. A snapshot step is replaced on
   *  the redo stack by `currentState`; a group moves across unchanged (the
   *  caller applies its inverse). Steps that would change nothing are
   *  dropped on the way (see `dropUnchanged`). */
  undo(currentState: GraphSnapshot): UndoEntry | null {
    dropUnchanged(this.undoStack, currentState);
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry.kind === 'snapshot' ? { kind: 'snapshot', snapshot: currentState } : entry);
    return entry;
  }

  redo(currentState: GraphSnapshot): UndoEntry | null {
    dropUnchanged(this.redoStack, currentState);
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry.kind === 'snapshot' ? { kind: 'snapshot', snapshot: currentState } : entry);
    return entry;
  }

  /** The last undo couldn't be applied (a conflict): put the group back. */
  cancelUndo(): void {
    const entry = this.redoStack.pop();
    if (entry) this.undoStack.push(entry);
  }

  /** The last redo couldn't be applied: put the group back. */
  cancelRedo(): void {
    const entry = this.undoStack.pop();
    if (entry) this.redoStack.push(entry);
  }

  /** The groups of a change set still in history, oldest first. */
  changeSetGroups(changeSetId: string): UndoGroup[] {
    return this.undoStack
      .filter((entry): entry is { kind: 'group'; group: UndoGroup } =>
        entry.kind === 'group' && entry.group.changeSetId === changeSetId)
      .map(entry => entry.group);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

/**
 * Drop snapshot steps from the top of `stack` that match the graph as it is:
 * restoring one would change nothing, so the key press would seem to do
 * nothing. They come from commands that were refused ("Select an edge
 * first") or found nothing to change, because the snapshot is taken before
 * the command decides (notes/bug-refused-command-leaves-undo-step.md).
 *
 * Checked at undo time rather than when the command ends, because some
 * commands finish later — a node drag tweens over the following frames — and
 * would look unchanged if compared straight away.
 */
function dropUnchanged(stack: UndoEntry[], currentState: GraphSnapshot): void {
  const current = JSON.stringify(currentState);
  for (let top = stack.at(-1); top?.kind === 'snapshot' && JSON.stringify(top.snapshot) === current; top = stack.at(-1)) {
    stack.pop();
  }
}
