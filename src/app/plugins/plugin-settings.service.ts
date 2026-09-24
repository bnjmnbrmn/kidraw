import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { KidrawPlugin } from './plugin.model';
import { PLUGIN_REGISTRY } from './plugin-registry';

const DISABLED_KEY = 'kidraw-plugins-disabled';

/**
 * Which plugins are on for this user (notes/design-plugins.md).
 *
 * Core plugins are always on; the rest can be turned off in Settings (Ben,
 * 2026-09-23). A plugin that is off keeps its data working — a graph of its
 * type still opens, renders and saves losslessly — but its behaviour stops:
 * its commands say it is off, its menu goes, and `:type` stops offering it.
 * Kept in this browser; a plugin never mentioned is on.
 */
@Injectable({ providedIn: 'root' })
export class PluginSettingsService {
  private readonly disabled = new Set<string>(readDisabled());
  private readonly changed = new Subject<void>();
  readonly changed$ = this.changed.asObservable();

  isEnabled(id: string): boolean {
    return !this.disabled.has(id) || isCore(id);
  }

  /** Turn a plugin on or off. Core plugins stay on whatever is asked. */
  setEnabled(id: string, enabled: boolean): void {
    if (isCore(id) || enabled === this.isEnabled(id)) return;
    if (enabled) this.disabled.delete(id); else this.disabled.add(id);
    writeDisabled([...this.disabled]);
    this.changed.next();
  }

  /** The plugins that can be turned off, for the settings list. */
  optionalPlugins(): KidrawPlugin[] {
    return [...PLUGIN_REGISTRY.values()].filter(plugin => !plugin.core);
  }
}

function isCore(id: string): boolean {
  return PLUGIN_REGISTRY.get(id)?.core === true;
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
