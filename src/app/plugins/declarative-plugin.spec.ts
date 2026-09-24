import {parsePluginDefinition} from './declarative-plugin';

const KANBAN = `
id: kanban
name: Kanban
description: Cards moving through columns
labels: markdown
requires: [markdown]
nodes: {shape: box, width: 240, textOverflow: fit}
tagGroups:
  - id: column
    name: Column
    choices:
      - {tag: column/doing, label: DOING, color: '#d97706'}
      - {tag: column/done, label: DONE, color: '#16a34a', dims: true}
edgeKinds:
  - {tag: kanban/blocks, name: Blocks, color: '#dc2626', description: Has to be done first.}
menu:
  - {label: Doing, set: column/doing}
  - {label: No Column, clear: column, key: n}
`;

const errorsOf = (source: string) => parsePluginDefinition(source).errors ?? [];

describe('plugins written as data', () => {
  it('reads a diagram type: defaults, tags, kinds, and a menu that sets its tags', () => {
    const {plugin, errors} = parsePluginDefinition(KANBAN);
    expect(errors).toBeUndefined();
    expect(plugin!.id).toBe('kanban');
    expect(plugin!.labelFormat).toBe('markdown');
    expect(plugin!.requires).toEqual(['markdown']);
    expect(plugin!.nodeDefaults).toEqual({shape: 'box', width: 240, textOverflow: 'fit'});
    expect(plugin!.tagGroups![0].choices.map(choice => choice.tag)).toEqual(['column/doing', 'column/done']);
    expect(plugin!.edgeKinds![0].name).toBe('Blocks');
    expect(plugin!.menu).toEqual([
      {label: 'Doing', call: {id: 'tags.set', args: {group: 'column', tag: 'column/doing'}}},
      {label: 'No Column', key: 'n', call: {id: 'tags.set', args: {group: 'column', tag: null}}},
    ]);
  });

  it('leaves out what the file does not say', () => {
    const {plugin} = parsePluginDefinition('id: bare\nname: Bare\n');
    expect(plugin).toEqual({id: 'bare', name: 'Bare', nodeDefaults: {}});
  });

  it('says everything that is wrong at once, and where', () => {
    const errors = errorsOf(`
id: Kanban!
nodes: {shape: hexagon}
colour: red
tagGroups:
  - id: column
    name: Column
    choices:
      - {tag: column/doing, label: DOING, color: orange}
menu:
  - {label: Done, set: column/done}
`);
    expect(errors).toEqual(jasmine.arrayWithExactContents([
      'plugin.colour: is not a field here',
      'plugin.id: "Kanban!" is not allowed here',
      'plugin.name: is required',
      'plugin.nodes.shape: should be one of box, circle, diamond',
      'plugin.tagGroups[0].choices[0].color: "orange" is not allowed here',
      'plugin.tagGroups[0].choices: needs at least one choice',
      'plugin.menu[0].set: no tag group has the tag column/done',
    ]));
  });

  it('refuses a menu entry that neither sets nor clears, or does both', () => {
    const base = 'id: x-y\nname: X\ntagGroups: [{id: grp, name: G, choices: [{tag: grp/a, label: A, color: "#fff"}]}]\n';
    expect(errorsOf(base + 'menu: [{label: Nothing}]')).toEqual(['plugin.menu[0]: needs exactly one of set or clear']);
    expect(errorsOf(base + 'menu: [{label: Both, set: grp/a, clear: grp}]')).toEqual(['plugin.menu[0]: needs exactly one of set or clear']);
  });

  it('says so when the file is not YAML, or not a mapping', () => {
    expect(errorsOf('id: [unclosed')[0]).toMatch(/^not valid YAML/);
    expect(errorsOf('- just\n- a list')).toEqual(['plugin: should be a mapping']);
  });
});
