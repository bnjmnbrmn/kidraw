import {NavPopupComponent} from './nav-popup.component';

describe('NavPopupComponent link directions', () => {
  function keyEvent(key: string): KeyboardEvent {
    return {
      key,
      ctrlKey: false,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as unknown as KeyboardEvent;
  }

  it('emits NSEW movement from the configured profile keys in list mode', () => {
    const component = new NavPopupComponent();
    component.directionKeys = {up: 'i', left: 'j', down: 'k', right: 'l'};
    const emit = spyOn(component.moveDirection, 'emit');

    component.onKeydown(keyEvent('j'));
    component.onKeydown(keyEvent('k'));
    component.onKeydown(keyEvent('i'));
    component.onKeydown(keyEvent('l'));

    expect(emit.calls.allArgs()).toEqual([['west'], ['south'], ['north'], ['east']]);
  });

  it('leaves direction letters available to the fuzzy filter in filter mode', () => {
    const component = new NavPopupComponent();
    component.filterMode = true;
    const emit = spyOn(component.moveDirection, 'emit');

    component.onKeydown(keyEvent('h'));

    expect(emit).not.toHaveBeenCalled();
  });
});
