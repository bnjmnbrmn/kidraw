import {NavPopupComponent} from './nav-popup.component';

describe('NavPopupComponent list keys', () => {
  function keyEvent(key: string): KeyboardEvent {
    return {
      key,
      ctrlKey: false,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as unknown as KeyboardEvent;
  }

  function withRows(): NavPopupComponent {
    const component = new NavPopupComponent();
    component.rows = [{id: 'box', title: 'Box'}, {id: 'circle', title: 'Circle'}, {id: 'diamond', title: 'Diamond'}];
    component.ngOnChanges({rows: {} as never});
    return component;
  }

  it('moves the selection with the profile\'s down and up keys in list mode', () => {
    const component = withRows();
    component.listKeys = {up: 'i', down: 'k'};
    const highlighted = spyOn(component.highlightRow, 'emit');

    component.onKeydown(keyEvent('k'));
    component.onKeydown(keyEvent('k'));
    component.onKeydown(keyEvent('i'));

    expect(highlighted.calls.allArgs()).toEqual([['circle'], ['diamond'], ['circle']]);
  });

  it('leaves those letters to the fuzzy filter in filter mode', () => {
    const component = withRows();
    component.filterMode = true;
    const highlighted = spyOn(component.highlightRow, 'emit');

    component.onKeydown(keyEvent('j'));

    expect(highlighted).not.toHaveBeenCalled();
  });

  it('commits the selected row on Enter', () => {
    const component = withRows();
    const committed = spyOn(component.commitRow, 'emit');

    component.onKeydown(keyEvent('j'));
    component.onKeydown(keyEvent('Enter'));

    expect(committed).toHaveBeenCalledOnceWith({id: 'circle'});
  });
});
