import { PluginTagChoice, PluginTagGroup, KidrawPlugin } from './plugin.model';

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

/** The first tag-group choice of `plugin` present in `tags`, or null.
 *  Drives badge rendering: at most one badge per node. */
/** The numbers in a node's numbered tags (`step/3`, `step/7` for prefix
 *  `step/`), ascending. Anything else after the prefix is ignored. */
export function numberedTags(tags: readonly string[], prefix: string): number[] {
  return tags
    .filter(tag => tag.startsWith(prefix) && /^\d+$/.test(tag.slice(prefix.length)))
    .map(tag => Number(tag.slice(prefix.length)))
    .filter(step => step > 0)
    .sort((a, b) => a - b);
}

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
