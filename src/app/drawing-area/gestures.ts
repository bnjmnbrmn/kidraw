/**
 * The drawing area's gestures, and the rule that at most one is under way.
 *
 * A gesture here is something you start that outlives a keystroke and changes
 * what the next keys mean: grow (the held add key), Move by Link, Move by
 * Node's held session, and area select. Each lives in its own controller.
 * Before this list, the drawing area asked each one separately wherever it
 * cared, and nothing stopped two being on at once: that held only because the
 * keys that start them happened not to overlap (notes/idea-gestures-list.md;
 * Ben asked for it to be built, 2026-09-24).
 *
 * Not to be confused with the keymenu's modes (KeyMenuMode: normal, label
 * edit, caps), which say what the keyboard is laid out for; a gesture runs
 * inside the normal mode.
 *
 * Two ways of getting keys stay as they were: grow suspends the keymenu and
 * takes raw keys (keyDown/keyUp here), while the held-chord gestures keep
 * receiving the keymenu's commands. The list does not route commands; it
 * knows which gesture is on, starts one by canceling the other, and cancels
 * whatever is on when the graph under it is replaced.
 */
export interface Gesture {
  /** For logs and tests. */
  readonly name: string;
  readonly active: boolean;
  /** Raw keys, for a gesture that has suspended the keymenu. */
  keyDown?(event: KeyboardEvent): void;
  keyUp?(event: KeyboardEvent): void;
  /** Stop without committing anything, and take down what it shows. */
  cancel(): void;
}

export class Gestures {
  constructor(private readonly gestures: readonly Gesture[]) {}

  /** The gesture that is on, if any. */
  get active(): Gesture | null {
    return this.gestures.find(gesture => gesture.active) ?? null;
  }

  /** The gesture called `name` is starting: whatever else is on stops first. */
  begin(name: string): void {
    for (const other of this.gestures) {
      if (other.name !== name && other.active) other.cancel();
    }
  }

  /** The graph was replaced (a load, undo, redo): its nodes are gone, so no
   *  gesture can carry on aiming at them. */
  cancelAll(): void {
    for (const gesture of this.gestures) {
      if (gesture.active) gesture.cancel();
    }
  }

  keyDown(event: KeyboardEvent): void {
    this.active?.keyDown?.(event);
  }

  /** Every gesture hears key-ups, not only the active one: grow tracks physical
   *  keys released after it has ended (a rolled chord), as it always did. */
  keyUp(event: KeyboardEvent): void {
    for (const gesture of this.gestures) gesture.keyUp?.(event);
  }
}
