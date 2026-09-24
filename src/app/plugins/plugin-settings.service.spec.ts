import {PluginSettingsService} from './plugin-settings.service';

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
