/**
 * The drawing area's interaction modes, and the rule that at most one is on.
 *
 * A mode is a gesture that outlives a keystroke and changes what the next keys
 * mean: grow (the held add key), Move by Link, Move by Node's held session, and
 * area select. Each lives in its own controller. Before this list, the
 * drawing area asked each one separately wherever it cared, and nothing stopped
 * two being on at once: that held only because their entry gestures happened
 * not to overlap (notes/idea-interaction-modes-list.md; Ben asked for it to be
 * built, 2026-09-24).
 *
 * Two ways of getting keys stay as they were: grow suspends the keymenu and
 * takes raw keys (keyDown/keyUp here), while the held-chord modes keep
 * receiving the keymenu's commands. The list does not route commands; it
 * knows which mode is on, starts one by canceling the other, and cancels
 * whatever is on when the graph under it is replaced.
 */
export interface InteractionMode {
  /** For logs and tests. */
  readonly name: string;
  readonly active: boolean;
  /** Raw keys, for a mode that has suspended the keymenu. */
  keyDown?(event: KeyboardEvent): void;
  keyUp?(event: KeyboardEvent): void;
  /** Stop without committing anything, and take down what it shows. */
  cancel(): void;
}

export class InteractionModes {
  constructor(private readonly modes: readonly InteractionMode[]) {}

  /** The mode that is on, if any. */
  get active(): InteractionMode | null {
    return this.modes.find(mode => mode.active) ?? null;
  }

  /** The mode called `name` is starting: whatever else is on stops first. */
  begin(name: string): void {
    for (const other of this.modes) {
      if (other.name !== name && other.active) other.cancel();
    }
  }

  /** The graph was replaced (a load, undo, redo): its nodes are gone, so no
   *  mode can carry on aiming at them. */
  cancelAll(): void {
    for (const mode of this.modes) {
      if (mode.active) mode.cancel();
    }
  }

  keyDown(event: KeyboardEvent): void {
    this.active?.keyDown?.(event);
  }

  /** Every mode hears key-ups, not only the active one: grow tracks physical
   *  keys released after it has ended (a rolled chord), as it always did. */
  keyUp(event: KeyboardEvent): void {
    for (const mode of this.modes) mode.keyUp?.(event);
  }
}
