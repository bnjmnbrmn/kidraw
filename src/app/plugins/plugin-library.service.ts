import { Injectable, inject } from '@angular/core';
import { DebugLogService } from '../services/debug-log.service';
import { parsePluginDefinition } from './declarative-plugin';
import { KidrawPlugin } from './plugin.model';
import { isBuiltIn, PLUGIN_REGISTRY, registerPlugin, unregisterPlugin } from './plugin-registry';

const LIBRARY_KEY = 'kidraw-user-plugins';

export type AddResult = {plugin: KidrawPlugin; errors?: never} | {plugin?: never; errors: string[]};

/**
 * The plugins a user added — written as data (declarative-plugin.ts) and
 * kept, as their YAML source, in this browser. Registered when the app
 * starts, so a graph of their type opens as that type (Ben, 2026-09-23:
 * adding plugins without a rebuild, sharing them, agents authoring them).
 */
@Injectable({ providedIn: 'root' })
export class PluginLibraryService {
  private readonly log = inject(DebugLogService);
  private readonly sources = new Map<string, string>();

  constructor() {
    for (const source of readLibrary()) {
      const result = this.register(source);
      if (result.errors) this.log.log('[plugins] a stored plugin no longer loads:', result.errors.join('; '));
    }
  }

  /** Add a plugin from its YAML source. Refuses one that does not parse or
   *  whose id is taken, saying why. */
  add(source: string): AddResult {
    const result = this.register(source);
    if (result.plugin) writeLibrary([...this.sources.values()]);
    return result;
  }

  /** Take out a plugin the user added. */
  remove(id: string): void {
    if (!this.sources.delete(id)) return;
    unregisterPlugin(id);
    writeLibrary([...this.sources.values()]);
  }

  /** Whether the user added this plugin (and so may remove it). */
  isAdded(id: string): boolean {
    return this.sources.has(id);
  }

  /** The YAML a user added, to share it again. */
  sourceOf(id: string): string | undefined {
    return this.sources.get(id);
  }

  private register(source: string): AddResult {
    const parsed = parsePluginDefinition(source);
    if (parsed.errors) return parsed;
    const {plugin} = parsed;
    if (isBuiltIn(plugin.id) || PLUGIN_REGISTRY.has(plugin.id)) return {errors: [`a plugin called ${plugin.id} already exists`]};
    try {
      registerPlugin(plugin);
    } catch (error) {
      return {errors: [(error as Error).message]};
    }
    this.sources.set(plugin.id, source);
    return {plugin};
  }
}

function readLibrary(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((source): source is string => typeof source === 'string') : [];
  } catch {
    return [];
  }
}

function writeLibrary(sources: string[]): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(sources));
  } catch {
    // Storage unavailable: the plugin lasts until the tab closes.
  }
}
