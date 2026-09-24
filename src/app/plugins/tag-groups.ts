import type { GraphOperation } from '../drawing-area/graph-operations';
import { PluginTagChoice, PluginTagGroup, KidrawPlugin } from './plugin.model';
import type { PluginNode } from './plugin-host';

/** Tags with every choice of `group` removed, then `choice` (if any) added.
 *  Pure — returns a new array; order of unrelated tags is preserved. */
export function applyExclusiveTag(
  tags: string[],
  group: PluginTagGroup,
  choice: PluginTagChoice | null,
): string[] {
  const groupTags = new Set(group.choices.map(c => c.tag));
  const kept = tags.filter(t => !groupTags.has(t));
  return choice ? [...kept, choice.tag] : kept;
}

/** The numbers in a node's numbered tags (`step/3`, `step/7` for prefix
 *  `step/`), ascending. Anything else after the prefix is ignored. */
export function numberedTags(tags: readonly string[], prefix: string): number[] {
  return tags
    .filter(tag => tag.startsWith(prefix) && /^\d+$/.test(tag.slice(prefix.length)))
    .map(tag => Number(tag.slice(prefix.length)))
    .filter(step => step > 0)
    .sort((a, b) => a - b);
}

/** The first tag-group choice of `plugin` present in `tags`, or null.
 *  Drives badge rendering: at most one badge per node. */
export function activeTagChoice(
  plugin: KidrawPlugin,
  tags: string[],
): PluginTagChoice | null {
  for (const group of plugin.tagGroups ?? []) {
    const choice = group.choices.find(c => tags.includes(c.tag));
    if (choice) return choice;
  }
  return null;
}

/** Junctions and invisible nodes carry no text, so no tags either. */
export function carriesTags(node: PluginNode): boolean {
  return node.shape !== 'junction' && node.shape !== 'invisible';
}

/** The operations that give each node `choice` from `group` (or clear the
 *  group, for null), leaving out nodes that already have it: no undo step
 *  for nothing. */
export function exclusiveTagOperations(
  nodes: readonly PluginNode[],
  group: PluginTagGroup,
  choice: PluginTagChoice | null,
): GraphOperation[] {
  return nodes
    .map(node => ({node, after: applyExclusiveTag([...node.tags], group, choice)}))
    .filter(({node, after}) => after.join('\n') !== node.tags.join('\n'))
    .map(({node, after}): GraphOperation => ({op: 'update_node', id: node.id, before: {tags: [...node.tags]}, after: {tags: after}}));
}

/** " (3 nodes)" after a status message, when there was more than one. */
export function countSuffix(nodes: readonly unknown[]): string {
  return nodes.length > 1 ? ` (${nodes.length} nodes)` : '';
}
