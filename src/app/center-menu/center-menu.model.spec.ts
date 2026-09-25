import { CenterMenuList, CenterMenuSpec } from './center-menu.model';

const files = ['plans/next.kidraw.yaml', 'notes/ideas.kidraw.yaml', 'readme.kidraw.yaml']
  .map(path => ({label: path, value: path}));

describe('CenterMenuList', () => {
  const openMenu = (spec: Partial<CenterMenuSpec<string>> = {}) =>
    new CenterMenuList<string>({title: 'Open', items: files, ...spec});

  it('lists everything in order, the first row highlighted, until something is typed', () => {
    const list = openMenu();
    expect(list.visible.map(item => item.value)).toEqual(files.map(f => f.value));
    expect(list.choice()).toEqual({kind: 'item', value: 'plans/next.kidraw.yaml'});
  });

  it('filters by what is typed, best match first', () => {
    const list = openMenu();
    list.setText('idea');
    expect(list.visible.map(item => item.value)).toEqual(['notes/ideas.kidraw.yaml']);
    list.setText('zzz');
    expect(list.visible).toEqual([]);
    expect(list.choice()).toBeNull();
  });

  it('moves within the list and stops at its ends', () => {
    const list = openMenu();
    list.move(-1);
    expect(list.highlighted).toBe(0);
    list.move(1); list.move(1); list.move(1);
    expect(list.highlighted).toBe(2);
    expect(list.choice()).toEqual({kind: 'item', value: 'readme.kidraw.yaml'});
  });

  it('starts on the row asked for', () => {
    expect(openMenu({initialValue: 'readme.kidraw.yaml'}).highlighted).toBe(2);
  });

  describe('a menu that takes text (Save As)', () => {
    const saveAs = () => openMenu({acceptsText: true, initialText: 'graph.kidraw.yaml'});

    it('chooses the typed text until you move onto a row, and the suggestion does not filter', () => {
      const list = saveAs();
      expect(list.visible.length).toBe(3);
      expect(list.choice()).toEqual({kind: 'text', text: 'graph.kidraw.yaml'});
      list.move(1);
      expect(list.choice()).toEqual({kind: 'item', value: 'plans/next.kidraw.yaml'});
      list.move(-1);
      expect(list.choice()).toEqual({kind: 'text', text: 'graph.kidraw.yaml'});
    });

    it('Tab copies the highlighted row into the field, to edit', () => {
      const list = saveAs();
      list.move(1);
      list.complete();
      expect(list.text).toBe('plans/next.kidraw.yaml');
      expect(list.choice()).toEqual({kind: 'text', text: 'plans/next.kidraw.yaml'});
    });

    it('chooses nothing for an empty name', () => {
      const list = saveAs();
      list.setText('   ');
      expect(list.choice()).toBeNull();
    });
  });
});
