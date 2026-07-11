import { KidrawPlugin } from './plugin.model';
import { TODO_GRAPH_PLUGIN } from './todo-graph.plugin';

export const PLUGIN_REGISTRY: ReadonlyMap<string, KidrawPlugin> = new Map(
  [TODO_GRAPH_PLUGIN].map(p => [p.id, p] as const),
);

export function getPlugin(id: string): KidrawPlugin | undefined {
  return PLUGIN_REGISTRY.get(id);
}
