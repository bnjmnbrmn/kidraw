import Konva from 'konva';
import {Animations} from './animations';

describe('Animations', () => {
  let animations: Animations;
  let node: Konva.Rect;

  beforeEach(() => {
    animations = new Animations();
    node = new Konva.Rect({x: 0, y: 0, width: 1, height: 1});
    new Konva.Layer().add(node);
  });

  const move = (to: number, rest: Partial<Konva.NodeConfig> = {}) =>
    ({node, duration: 10, x: to, ...rest});

  it('starts empty', () => {
    expect(animations.count).toBe(0);
  });

  it('keeps what it starts', () => {
    animations.start(move(50));
    expect(animations.count).toBe(1);
  });

  it('snaps everything to its end state, rather than canceling it', () => {
    animations.start(move(120));
    animations.finishAll();
    expect(node.x()).toBe(120);
    expect(animations.count).toBe(0);
  });

  it('settles several at once', () => {
    const other = new Konva.Rect({x: 0, y: 0, width: 1, height: 1});
    new Konva.Layer().add(other);
    animations.start(move(10));
    animations.start({node: other, duration: 10, x: 99});
    expect(animations.count).toBe(2);
    animations.finishAll();
    expect(node.x()).toBe(10);
    expect(other.x()).toBe(99);
    expect(animations.count).toBe(0);
  });

  it('is empty during finishAll, so an onFinish that starts one is kept', () => {
    // A tween whose landing begins the next leg must not be discarded by the
    // sweep that triggered it.
    animations.start(move(10, {onFinish: () => animations.start(move(20))}));
    animations.finishAll();
    expect(animations.count).toBe(1);
  });

  it('forgets a self-removing tween when it lands, and still calls onFinish', () => {
    let landed = false;
    animations.startSelfRemoving(move(30, {onFinish: () => { landed = true; }}));
    expect(animations.count).toBe(1);
    animations.finishAll();
    expect(landed).toBeTrue();
    expect(animations.count).toBe(0);
  });

  it('cancels a tracked frame once, and tolerates having none', () => {
    const cancel = spyOn(window, 'cancelAnimationFrame');
    animations.cancelFrame();
    expect(cancel).not.toHaveBeenCalled();

    animations.trackFrame(7);
    animations.cancelFrame();
    expect(cancel).toHaveBeenCalledWith(7);

    animations.cancelFrame();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
