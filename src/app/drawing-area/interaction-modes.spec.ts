import { InteractionMode, InteractionModes } from './interaction-modes';

function fakeMode(name: string, active = false) {
  const mode = {
    name,
    active,
    keyDown: jasmine.createSpy(`${name}.keyDown`),
    keyUp: jasmine.createSpy(`${name}.keyUp`),
    cancel: jasmine.createSpy(`${name}.cancel`).and.callFake(() => { mode.active = false; }),
  };
  return mode;
}

describe('InteractionModes', () => {
  it('starting one mode cancels the one that is on, and only that one', () => {
    const grow = fakeMode('grow', true);
    const linkNav = fakeMode('link-nav');
    const areaSelect = fakeMode('area-select');
    const modes = new InteractionModes([grow, linkNav, areaSelect]);

    modes.begin('link-nav');

    expect(grow.cancel).toHaveBeenCalledTimes(1);
    expect(linkNav.cancel).not.toHaveBeenCalled();
    expect(areaSelect.cancel).not.toHaveBeenCalled();
  });

  it('knows which mode is on', () => {
    const grow = fakeMode('grow');
    const linkNav = fakeMode('link-nav', true);
    expect(new InteractionModes([grow, linkNav]).active).toBe(linkNav);
    expect(new InteractionModes([grow]).active).toBeNull();
  });

  it('cancels whatever is on when the graph is replaced', () => {
    const grow = fakeMode('grow', true);
    const linkNav = fakeMode('link-nav');
    new InteractionModes([grow, linkNav]).cancelAll();
    expect(grow.cancel).toHaveBeenCalled();
    expect(linkNav.cancel).not.toHaveBeenCalled();
  });

  it('sends key-downs to the active mode, and key-ups to every mode', () => {
    const grow = fakeMode('grow', true);
    const areaSelect = fakeMode('area-select');
    const bare: InteractionMode = {name: 'bare', active: false, cancel: () => undefined};
    const modes = new InteractionModes([grow, areaSelect, bare]);
    const event = new KeyboardEvent('keydown', {key: 'a'});

    modes.keyDown(event);
    modes.keyUp(event);

    expect(grow.keyDown).toHaveBeenCalledWith(event);
    expect(areaSelect.keyDown).not.toHaveBeenCalled();
    expect(grow.keyUp).toHaveBeenCalledWith(event);
    expect(areaSelect.keyUp).toHaveBeenCalledWith(event);
  });
});
