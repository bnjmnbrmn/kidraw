import {TestBed} from '@angular/core/testing';
import {NodeShape} from '../drawing-area/command.model';
import {GraphOperation} from '../drawing-area/graph-operations';
import {PluginCommands} from './plugin-commands';
import {PluginHost} from './plugin-host';
import {PluginLibraryService} from './plugin-library.service';
import {PLUGIN_REGISTRY, resolveIdentity} from './plugin-registry';
import {TAGS_PLUGIN} from './tags.plugin';

const KEY = 'kidraw-user-plugins';
const KANBAN = `
id: kanban-test
name: Kanban Test
tagGroups:
  - {id: column, name: Column, choices: [{tag: column/doing, label: DOING, color: '#d97706'}, {tag: column/done, label: DONE, color: '#16a34a'}]}
menu:
  - {label: Doing, set: column/doing}
`;

describe('the plugin library', () => {
  let library: PluginLibraryService;

  beforeEach(() => {
    localStorage.removeItem(KEY);
    library = TestBed.inject(PluginLibraryService);
  });
  afterEach(() => {
    library.remove('kanban-test');
    localStorage.removeItem(KEY);
  });

  it('adds a plugin written as data, registers it, and keeps it', () => {
    const result = library.add(KANBAN);
    expect(result.plugin?.name).toBe('Kanban Test');
    expect(PLUGIN_REGISTRY.has('kanban-test')).toBeTrue();
    expect(library.isAdded('kanban-test')).toBeTrue();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([KANBAN]);
  });

  it('refuses one that does not parse, or whose id is taken', () => {
    expect(library.add('id: [').errors?.[0]).toMatch(/not valid YAML/);
    expect(library.add('id: explanation\nname: Mine\n').errors).toEqual(['a plugin called explanation already exists']);
    library.add(KANBAN);
    expect(library.add(KANBAN).errors).toEqual(['a plugin called kanban-test already exists']);
  });

  it('removes one, from the registry and from storage', () => {
    library.add(KANBAN);
    library.remove('kanban-test');
    expect(PLUGIN_REGISTRY.has('kanban-test')).toBeFalse();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });

  it('keeps a stored plugin that no longer loads, rather than dropping it on the next save', () => {
    const clash = 'id: explanation\nname: Mine\n';
    localStorage.setItem(KEY, JSON.stringify([clash]));
    const fresh = TestBed.runInInjectionContext(() => new PluginLibraryService());
    fresh.add(KANBAN);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([KANBAN, clash]);
    fresh.remove('kanban-test');
  });

  it('lets its menu set its tags, through the core tags.set command', () => {
    library.add(KANBAN);
    const applied: GraphOperation[][] = [];
    const statuses: string[] = [];
    const host: PluginHost = {
      diagramType: () => 'kanban-test',
      identity: () => resolveIdentity('kanban-test'),
      targetNodes: () => [{id: 'n1', label: 'card', tags: ['column/done', 'keep'], shape: 'box' as NodeShape}],
      apply: (_label, operations) => { applied.push(operations); return null; },
      status: message => statuses.push(message),
    };
    const entry = resolveIdentity('kanban-test').menu![0];
    new PluginCommands(host, [TAGS_PLUGIN]).run(entry.call);
    expect(applied[0]).toEqual([{op: 'update_node', id: 'n1', before: {tags: ['column/done', 'keep']}, after: {tags: ['keep', 'column/doing']}}]);
    expect(statuses).toEqual(['Column: DOING']);
  });
});
