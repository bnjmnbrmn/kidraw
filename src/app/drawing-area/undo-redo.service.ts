import { GraphSnapshot } from './graph-snapshot';

export class UndoRedoService {
  private undoStack: GraphSnapshot[] = [];
  private redoStack: GraphSnapshot[] = [];
  private readonly maxEntries = 100;

  pushSnapshot(snapshot: GraphSnapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(currentState: GraphSnapshot): GraphSnapshot | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(currentState);
    return previous;
  }

  redo(currentState: GraphSnapshot): GraphSnapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(currentState);
    return next;
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
