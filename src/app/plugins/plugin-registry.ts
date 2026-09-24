import { KidrawPlugin } from './plugin.model';
import { TODO_GRAPH_PLUGIN } from './todo-graph.plugin';
import { EXPLANATION_PLUGIN } from './explanation.plugin';
import { MARKDOWN_PLUGIN } from './markdown.plugin';
import { MATH_PLUGIN } from './math.plugin';
import { TAGS_PLUGIN } from './tags.plugin';

/** The implicit identity of every graph that doesn't declare a `type`.
 *  Its (empty) defaults resolve to the app defaults, so binding it is
 *  equivalent to plain-graph behavior. */
export const DEFAULT_PLUGIN: KidrawPlugin = {
  id: 'default',
  name: 'Default',
  nodeDefaults: {},
  core: true,
};

const BUILT_IN: readonly KidrawPlugin[] =
  [DEFAULT_PLUGIN, TAGS_PLUGIN, TODO_GRAPH_PLUGIN, EXPLANATION_PLUGIN, MARKDOWN_PLUGIN, MATH_PLUGIN];

const registry = new Map<string, KidrawPlugin>(BUILT_IN.map(plugin => [plugin.id, plugin] as const));
const listeners = new Set<() => void>();

/** Every plugin: the built-in ones, then any added at runtime. */
export const PLUGIN_REGISTRY: ReadonlyMap<string, KidrawPlugin> = registry;

export function isBuiltIn(id: string): boolean {
  return BUILT_IN.some(plugin => plugin.id === id);
}

/** Add a plugin while the app runs — a declarative one a user or agent added
 *  (declarative-plugin.ts). Refuses an id already taken, or a plugin that
 *  would leave the registry unsound. */
export function registerPlugin(plugin: KidrawPlugin): void {
  if (registry.has(plugin.id)) throw new Error(`A plugin called ${plugin.id} already exists`);
  const problems = registryProblems(new Map([...registry, [plugin.id, plugin]]));
  if (problems.length > 0) throw new Error(problems.join('; '));
  registry.set(plugin.id, plugin);
  listeners.forEach(listener => listener());
}

/** Take out a plugin added at runtime. Built-in plugins stay. */
export function unregisterPlugin(id: string): void {
  if (isBuiltIn(id)) throw new Error(`${id} is built in`);
  if (registry.delete(id)) listeners.forEach(listener => listener());
}

/** Hear about plugins added or taken out. Returns how to stop listening. */
export function onRegistryChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlugin(id: string): KidrawPlugin | undefined {
  return PLUGIN_REGISTRY.get(id);
}

/** Resolve a graph's declared type to its identity plugin; unknown or
 *  absent types — and features, which are not types — fall back to the
 *  default identity. */
export function resolveIdentity(typeId: string | undefined): KidrawPlugin {
  const plugin = typeId !== undefined ? PLUGIN_REGISTRY.get(typeId) : undefined;
  return plugin && !plugin.feature ? plugin : DEFAULT_PLUGIN;
}

/** The plugins a graph can be bound to as its type. */
export function diagramTypes(): KidrawPlugin[] {
  return [...PLUGIN_REGISTRY.values()].filter(plugin => !plugin.feature);
}

/** What is wrong with a set of plugins, if anything: a dependency on a
 *  plugin that does not exist, a core plugin that depends on one that can be
 *  switched off, or plugins that require each other in a circle. */
export function registryProblems(plugins: ReadonlyMap<string, KidrawPlugin>): string[] {
  const problems: string[] = [];
  for (const plugin of plugins.values()) {
    for (const id of [...plugin.requires ?? [], ...plugin.uses ?? []]) {
      if (!plugins.has(id)) problems.push(`${plugin.id} depends on unknown plugin ${id}`);
    }
    for (const id of plugin.requires ?? []) {
      if (plugin.core && plugins.get(id)?.core !== true) problems.push(`core plugin ${plugin.id} requires non-core ${id}`);
    }
    if (requiresItself(plugin.id, plugins)) problems.push(`${plugin.id} requires itself, through its requirements`);
  }
  return problems;
}

function requiresItself(id: string, plugins: ReadonlyMap<string, KidrawPlugin>): boolean {
  const seen = new Set<string>();
  const visit = (from: string): boolean => (plugins.get(from)?.requires ?? []).some(next =>
    next === id || (!seen.has(next) && (seen.add(next), visit(next))));
  return visit(id);
}
