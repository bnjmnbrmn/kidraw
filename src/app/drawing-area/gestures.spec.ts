import { Gesture, Gestures } from './gestures';

function fakeGesture(name: string, active = false) {
  const gesture = {
    name,
    active,
    keyDown: jasmine.createSpy(`${name}.keyDown`),
    keyUp: jasmine.createSpy(`${name}.keyUp`),
    cancel: jasmine.createSpy(`${name}.cancel`).and.callFake(() => { gesture.active = false; }),
  };
  return gesture;
}

describe('Gestures', () => {
  it('starting one gesture cancels the one that is on, and only that one', () => {
    const grow = fakeGesture('grow', true);
    const linkNav = fakeGesture('link-nav');
    const areaSelect = fakeGesture('area-select');
    const gestures = new Gestures([grow, linkNav, areaSelect]);

    gestures.begin('link-nav');

    expect(grow.cancel).toHaveBeenCalledTimes(1);
    expect(linkNav.cancel).not.toHaveBeenCalled();
    expect(areaSelect.cancel).not.toHaveBeenCalled();
  });

  it('knows which gesture is on', () => {
    const grow = fakeGesture('grow');
    const linkNav = fakeGesture('link-nav', true);
    expect(new Gestures([grow, linkNav]).active).toBe(linkNav);
    expect(new Gestures([grow]).active).toBeNull();
  });

  it('cancels whatever is on when the graph is replaced', () => {
    const grow = fakeGesture('grow', true);
    const linkNav = fakeGesture('link-nav');
    new Gestures([grow, linkNav]).cancelAll();
    expect(grow.cancel).toHaveBeenCalled();
    expect(linkNav.cancel).not.toHaveBeenCalled();
  });

  it('sends key-downs to the active gesture, and key-ups to every gesture', () => {
    const grow = fakeGesture('grow', true);
    const areaSelect = fakeGesture('area-select');
    const bare: Gesture = {name: 'bare', active: false, cancel: () => undefined};
    const gestures = new Gestures([grow, areaSelect, bare]);
    const event = new KeyboardEvent('keydown', {key: 'a'});

    gestures.keyDown(event);
    gestures.keyUp(event);

    expect(grow.keyDown).toHaveBeenCalledWith(event);
    expect(areaSelect.keyDown).not.toHaveBeenCalled();
    expect(grow.keyUp).toHaveBeenCalledWith(event);
    expect(areaSelect.keyUp).toHaveBeenCalledWith(event);
  });
});
