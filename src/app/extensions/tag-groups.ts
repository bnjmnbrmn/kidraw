import { ExtensionTagChoice, ExtensionTagGroup, KidrawExtension } from './extension.model';

/** Tags with every choice of `group` removed, then `choice` (if any) added.
 *  Pure — returns a new array; order of unrelated tags is preserved. */
export function applyExclusiveTag(
  tags: string[],
  group: ExtensionTagGroup,
  choice: ExtensionTagChoice | null,
): string[] {
  const groupTags = new Set(group.choices.map(c => c.tag));
  const kept = tags.filter(t => !groupTags.has(t));
  return choice ? [...kept, choice.tag] : kept;
}

/** The first tag-group choice of `extension` present in `tags`, or null.
 *  Drives badge rendering: at most one badge per node. */
export function activeTagChoice(
  extension: KidrawExtension,
  tags: string[],
): ExtensionTagChoice | null {
  for (const group of extension.tagGroups ?? []) {
    const choice = group.choices.find(c => tags.includes(c.tag));
    if (choice) return choice;
  }
  return null;
}
