/**
 * Every animation the drawing area has in flight.
 *
 * Konva tweens keep running after the command that started them returns, so a
 * second command arriving mid-tween would otherwise fight the first: the node
 * is somewhere between two grid cells, the crosshairs are drifting, and
 * whatever the new command measures is wrong. The rule is that a command that
 * cares settles everything first, and that only works if there is one place
 * holding them all.
 *
 * The same goes for the drag loop, which is a requestAnimationFrame chain
 * rather than a tween: cancelling it needs the id, so the id lives here too.
 *
 * Seven regions of the component call `finishAll` — more than share anything
 * else in the file.
 */
import Konva from 'konva';
import type { TweenConfig } from 'konva/lib/Tween';

export class Animations {
  private running: Konva.Tween[] = [];
  private frameId: number | null = null;

  /** How many are in flight. For tests and diagnostics. */
  get count(): number {
    return this.running.length;
  }

  /** Start a tween and keep it where `finishAll` can reach it. */
  start(config: TweenConfig): Konva.Tween {
    const tween = new Konva.Tween(config);
    this.running.push(tween);
    tween.play();
    return tween;
  }

  /** Take over a tween the caller built, and play it. */
  adopt(tween: Konva.Tween): Konva.Tween {
    this.running.push(tween);
    tween.play();
    return tween;
  }

  /**
   * Start a tween that takes itself out of the list when it lands.
   *
   * For animations long enough that a later command should be free to start
   * its own without first snapping this one to its end — a recentre, say,
   * which the user can interrupt by simply moving.
   */
  startSelfRemoving(config: TweenConfig): Konva.Tween {
    const tween: Konva.Tween = this.start({
      ...config,
      onFinish: () => {
        this.forget(tween);
        config.onFinish?.call(tween);
      },
    });
    return tween;
  }

  /**
   * Snap everything to its end state and forget it.
   *
   * Snapping rather than cancelling: a half-finished move leaves a node
   * between grid cells, and the next command would measure from there.
   */
  finishAll(): void {
    const settling = this.running;
    this.running = [];
    settling.forEach(tween => tween.finish());
  }

  /** Remember the drag loop's frame, so the next command can stop it. */
  trackFrame(id: number | null): void {
    this.frameId = id;
  }

  /** Stop the drag loop where it stands. Unlike a tween it is not snapped:
   *  the caller is about to replace it with a fresh drag. */
  cancelFrame(): void {
    if (this.frameId === null) return;
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private forget(tween: Konva.Tween): void {
    const index = this.running.indexOf(tween);
    if (index > -1) this.running.splice(index, 1);
  }
}
