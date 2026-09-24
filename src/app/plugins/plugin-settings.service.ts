import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { KidrawPlugin } from './plugin.model';
import { onRegistryChange, PLUGIN_REGISTRY } from './plugin-registry';

const DISABLED_KEY = 'kidraw-plugins-disabled';

/** What one change in Settings did: the plugin asked for, and any others
 *  switched with it because of what requires what. */
export interface PluginChange {
  plugin: KidrawPlugin;
  enabled: boolean;
  /** Switched too: on because the plugin needs them, or off because they
   *  need the plugin. */
  alsoSwitched: KidrawPlugin[];
}

/**
 * Which plugins are on for this user (notes/design-plugins.md).
 *
 * Core plugins are always on; the rest can be turned off in Settings (Ben,
 * 2026-09-23). A plugin that is off keeps its data working — a graph of its
 * type still opens, renders and saves losslessly — but its behaviour stops:
 * its commands say it is off, its menu goes, and `:type` stops offering it.
 *
 * Dependencies are followed automatically, with a notice (Ben, 2026-09-23):
 * switching a plugin on switches on what it requires, and switching one off
 * switches off what requires it. A plugin is only ever on when everything it
 * requires is. Kept in this browser; a plugin never mentioned is on.
 */
@Injectable({ providedIn: 'root' })
export class PluginSettingsService {
  private readonly disabled = new Set<string>(readDisabled());
  private readonly changed = new Subject<void>();
  readonly changed$ = this.changed.asObservable();

  /** The plugins it knows; a spec may give it others. */
  private readonly plugins: ReadonlyMap<string, KidrawPlugin> = PLUGIN_REGISTRY;

  constructor() {
    // A plugin added or taken out changes what is on, as far as anyone
    // listening is concerned.
    onRegistryChange(() => this.changed.next());
  }

  isEnabled(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (plugin?.core) return true;
    return !this.disabled.has(id) && (plugin?.requires ?? []).every(required => this.isEnabled(required));
  }

  /** Turn a plugin on or off, and whatever that takes. Returns what changed,
   *  or null when nothing did (already so, core, or unknown). */
  setEnabled(id: string, enabled: boolean): PluginChange | null {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.core || enabled === this.isEnabled(id)) return null;
    const affected = (enabled ? this.requirementsOf(id) : this.dependentsOf(id))
      .filter(other => this.isEnabled(other.id) !== enabled);
    for (const target of [plugin, ...affected]) {
      if (enabled) this.disabled.delete(target.id); else this.disabled.add(target.id);
    }
    writeDisabled([...this.disabled]);
    this.changed.next();
    return {plugin, enabled, alsoSwitched: affected};
  }

  /** The plugins that can be turned off, for the settings list. */
  optionalPlugins(): KidrawPlugin[] {
    return [...this.plugins.values()].filter(plugin => !plugin.core);
  }

  /** Everything `id` requires, directly or through what it requires. */
  private requirementsOf(id: string): KidrawPlugin[] {
    return this.closure(id, plugin => plugin.requires ?? []);
  }

  /** Everything that requires `id`, directly or through what requires it. */
  private dependentsOf(id: string): KidrawPlugin[] {
    const dependents = (plugin: KidrawPlugin) => [...this.plugins.values()]
      .filter(other => other.requires?.includes(plugin.id)).map(other => other.id);
    return this.closure(id, dependents);
  }

  private closure(id: string, next: (plugin: KidrawPlugin) => string[]): KidrawPlugin[] {
    const found = new Map<string, KidrawPlugin>();
    const visit = (from: string) => {
      const plugin = this.plugins.get(from);
      for (const to of plugin ? next(plugin) : []) {
        const other = this.plugins.get(to);
        if (other && to !== id && !found.has(to)) { found.set(to, other); visit(to); }
      }
    };
    visit(id);
    return [...found.values()];
  }
}

function readDisabled(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(DISABLED_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeDisabled(ids: string[]): void {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable: the choice lasts until the tab closes.
  }
}

/** The notice for a change in Settings: "Markdown: off — and Explanation and
 *  Math, which need it." */
export function describePluginChange({plugin, enabled, alsoSwitched}: PluginChange): string {
  const said = `${plugin.name}: ${enabled ? 'on' : 'off'}`;
  if (alsoSwitched.length === 0) return said;
  const others = listOf(alsoSwitched.map(other => other.name));
  return enabled
    ? `${said} — and ${others}, which it needs`
    : `${said} — and ${others}, which ${alsoSwitched.length === 1 ? 'needs' : 'need'} it`;
}

/** What a plugin depends on, for its line in Settings: "needs Markdown · uses Math". */
export function dependencyHint(plugin: KidrawPlugin, plugins: ReadonlyMap<string, KidrawPlugin> = PLUGIN_REGISTRY): string {
  const names = (ids: string[] | undefined) => listOf((ids ?? []).map(id => plugins.get(id)?.name ?? id));
  const parts = [
    plugin.requires?.length ? `needs ${names(plugin.requires)}` : '',
    plugin.uses?.length ? `uses ${names(plugin.uses)}` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

function listOf(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
