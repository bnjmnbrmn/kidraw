import { KidrawPlugin } from './plugin.model';
import { TODO_GRAPH_PLUGIN } from './todo-graph.plugin';
import { EXPLANATION_PLUGIN } from './explanation.plugin';

/** The implicit identity of every graph that doesn't declare a `type`.
 *  Its (empty) defaults resolve to the app defaults, so binding it is
 *  equivalent to plain-graph behavior. */
export const DEFAULT_PLUGIN: KidrawPlugin = {
  id: 'default',
  name: 'Default',
  nodeDefaults: {},
  core: true,
};

export const PLUGIN_REGISTRY: ReadonlyMap<string, KidrawPlugin> = new Map(
  [DEFAULT_PLUGIN, TODO_GRAPH_PLUGIN, EXPLANATION_PLUGIN].map(plugin => [plugin.id, plugin] as const),
);

export function getPlugin(id: string): KidrawPlugin | undefined {
  return PLUGIN_REGISTRY.get(id);
}

/** Resolve a graph's declared type to its identity plugin; unknown or
 *  absent types fall back to the default identity. */
export function resolveIdentity(typeId: string | undefined): KidrawPlugin {
  return (typeId !== undefined ? PLUGIN_REGISTRY.get(typeId) : undefined) ?? DEFAULT_PLUGIN;
}
