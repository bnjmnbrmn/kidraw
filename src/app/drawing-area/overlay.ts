/**
 * A transient Konva decoration: at most one on screen, rebuilt wholesale.
 *
 * The drawing area carries seven of these — the hover trace, the label-edit
 * lens, the navigation landing ghost, the nav-popup ghost, the grow ghost, the
 * link-nav quadrant lines, the movement goal line. None is part of the graph;
 * none is serialized; each exists to answer "what would happen if you did that"
 * and disappears when the answer changes.
 *
 * Each had grown its own nullable field and its own clear method, and those
 * methods had drifted: one redrew its layer, one redrew two, one redrew none.
 * That divergence was invisible, because a missing repaint is not a state
 * change and so no test could see it.
 *
 * What stays with the caller is what is genuinely particular: the link-nav
 * lines own a debounce timer, and the hover trace tears down the landing ghost
 * with it. Those are behaviors, not lifecycle.
 */
import Konva from 'konva';

export class Overlay<T extends Konva.Group | Konva.Shape> {
  private current: T | null = null;

  /** The layer is read lazily: it does not exist until ngAfterViewInit. */
  constructor(private readonly layer: () => Konva.Layer | undefined) {}

  /** What is showing, if anything. */
  get node(): T | null {
    return this.current;
  }

  get showing(): boolean {
    return this.current !== null;
  }

  /**
   * Replace whatever is showing with what `build` returns.
   *
   * The build happens after the old one is destroyed, so a builder that reads
   * the layer sees it without the previous copy in the way.
   *
   * `place` is not decoration. Most of these sit above everything — a ghost
   * under a node is not a preview of anything. The link-nav quadrant lines are
   * the exception: they are a backdrop the real graph has to stay readable
   * through, so they go to the bottom.
   */
  show(build: () => T, place: 'top' | 'bottom' = 'top'): T {
    this.clear(false);
    const node = build();
    this.layer()?.add(node);
    if (place === 'top') node.moveToTop(); else node.moveToBottom();
    this.current = node;
    return node;
  }

  /**
   * Take it off screen. Returns whether there was anything to remove, which is
   * what a caller needs to decide if a repaint is owed elsewhere.
   */
  clear(draw = true): boolean {
    if (!this.current) return false;
    this.current.destroy();
    this.current = null;
    if (draw) this.layer()?.batchDraw();
    return true;
  }
}
