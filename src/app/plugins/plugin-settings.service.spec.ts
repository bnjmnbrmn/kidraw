import {KidrawPlugin} from './plugin.model';
import {diagramTypes, PLUGIN_REGISTRY, registryProblems, resolveIdentity} from './plugin-registry';
import {dependencyHint, describePluginChange, PluginSettingsService} from './plugin-settings.service';

const KEY = 'kidraw-plugins-disabled';

describe('PluginSettingsService', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it('starts with every plugin on', () => {
    const settings = new PluginSettingsService();
    expect(settings.isEnabled('todo-graph')).toBeTrue();
    expect(settings.isEnabled('explanation')).toBeTrue();
  });

  it('turns a plugin off and on, says when it changed, and remembers', () => {
    const settings = new PluginSettingsService();
    const changed = jasmine.createSpy('changed');
    settings.changed$.subscribe(changed);

    settings.setEnabled('explanation', false);
    expect(settings.isEnabled('explanation')).toBeFalse();
    expect(new PluginSettingsService().isEnabled('explanation')).toBeFalse();

    settings.setEnabled('explanation', true);
    expect(new PluginSettingsService().isEnabled('explanation')).toBeTrue();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('keeps core plugins on, and does not list them', () => {
    const settings = new PluginSettingsService();
    settings.setEnabled('default', false);
    expect(settings.isEnabled('default')).toBeTrue();
    expect(settings.optionalPlugins().map(plugin => plugin.id)).not.toContain('default');
    expect(settings.optionalPlugins().map(plugin => plugin.id)).toContain('explanation');
  });

  it('ignores storage it cannot read', () => {
    localStorage.setItem(KEY, 'not json');
    expect(new PluginSettingsService().isEnabled('explanation')).toBeTrue();
  });
});

describe('PluginSettingsService dependencies', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  const names = (change: {alsoSwitched: {name: string}[]} | null) => change?.alsoSwitched.map(p => p.name).sort();

  it('switches off what requires a plugin, and says so', () => {
    const settings = new PluginSettingsService();
    const change = settings.setEnabled('markdown', false);
    expect(names(change)).toEqual(['Explanation', 'Math']);
    expect(settings.isEnabled('explanation')).toBeFalse();
    expect(settings.isEnabled('math')).toBeFalse();
    expect(describePluginChange(change!)).toBe('Markdown: off — and Explanation and Math, which need it');
  });

  it('switches on what a plugin requires, and says so — but not what it only uses', () => {
    const settings = new PluginSettingsService();
    settings.setEnabled('markdown', false);
    const change = settings.setEnabled('explanation', true);
    expect(names(change)).toEqual(['Markdown']);
    expect(settings.isEnabled('markdown')).toBeTrue();
    expect(settings.isEnabled('math')).toBeFalse();
    expect(describePluginChange(change!)).toBe('Explanation: on — and Markdown, which it needs');
  });

  it('counts a plugin as off while something it requires is off', () => {
    localStorage.setItem(KEY, JSON.stringify(['markdown']));
    const settings = new PluginSettingsService();
    expect(settings.isEnabled('explanation')).toBeFalse();
  });

  it('describes what a plugin needs and uses', () => {
    const settings = new PluginSettingsService();
    const explanation = settings.optionalPlugins().find(p => p.id === 'explanation')!;
    expect(dependencyHint(explanation)).toBe('needs Markdown · uses Math');
  });
});

describe('the plugin registry', () => {
  const plugin = (id: string, extra: Partial<KidrawPlugin> = {}): KidrawPlugin => ({id, name: id, nodeDefaults: {}, ...extra});
  const registry = (...plugins: KidrawPlugin[]) => new Map(plugins.map(p => [p.id, p]));

  it('is sound', () => {
    expect(registryProblems(PLUGIN_REGISTRY)).toEqual([]);
  });

  it('catches an unknown dependency, a core plugin needing an optional one, and a circle', () => {
    expect(registryProblems(registry(plugin('a', {uses: ['ghost']})))).toEqual(['a depends on unknown plugin ghost']);
    expect(registryProblems(registry(plugin('a', {core: true, requires: ['b']}), plugin('b'))))
      .toEqual(['core plugin a requires non-core b']);
    expect(registryProblems(registry(plugin('a', {requires: ['b']}), plugin('b', {requires: ['a']}))).length).toBe(2);
  });

  it('never resolves a feature as a graph\'s type', () => {
    expect(resolveIdentity('markdown').id).toBe('default');
    expect(diagramTypes().map(p => p.id)).not.toContain('math');
  });
});
