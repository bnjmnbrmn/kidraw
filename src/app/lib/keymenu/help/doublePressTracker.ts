/**
 * Tracks press/release timing to detect double-press gestures.
 * A double-press is two presses within `intervalMs` of the first release.
 */
export class DoublePressTracker {
  private lastReleaseTime = 0;
  private pressCount = 0;

  constructor(private readonly intervalMs: number = 325) {}

  /** Call on key down. Returns true if this press completes a double-press. */
  onPress(): boolean {
    const now = Date.now();
    if (this.pressCount === 1 && (now - this.lastReleaseTime) <= this.intervalMs) {
      this.pressCount = 0;
      this.lastReleaseTime = 0;
      return true;
    }
    this.pressCount = 1;
    return false;
  }

  /** Call on key up. */
  onRelease(): void {
    this.lastReleaseTime = Date.now();
  }

  /** Reset all state. */
  reset(): void {
    this.lastReleaseTime = 0;
    this.pressCount = 0;
  }
}
