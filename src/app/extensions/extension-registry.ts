import { KidrawExtension } from './extension.model';
import { TODO_GRAPH_EXTENSION } from './todo-graph.extension';

/** The implicit identity of every graph that doesn't declare a `type`.
 *  Its (empty) defaults resolve to the app defaults, so binding it is
 *  equivalent to plain-graph behavior. */
export const DEFAULT_EXTENSION: KidrawExtension = {
  id: 'default',
  name: 'Default',
  nodeDefaults: {},
};

export const EXTENSION_REGISTRY: ReadonlyMap<string, KidrawExtension> = new Map(
  [DEFAULT_EXTENSION, TODO_GRAPH_EXTENSION].map(e => [e.id, e] as const),
);

export function getExtension(id: string): KidrawExtension | undefined {
  return EXTENSION_REGISTRY.get(id);
}

/** Resolve a graph's declared type to its identity extension; unknown or
 *  absent types fall back to the default identity. */
export function resolveIdentity(typeId: string | undefined): KidrawExtension {
  return (typeId !== undefined ? EXTENSION_REGISTRY.get(typeId) : undefined) ?? DEFAULT_EXTENSION;
}
