import { KidrawPlugin } from './plugin.model';
import type { PluginHost } from './plugin-host';
import { carriesTags, countSuffix, exclusiveTagOperations } from './tag-groups';

declare module './plugin-commands' {
  interface PluginCommandArgs {
    /** Give the target nodes one tag from a tag group of the graph's type,
     *  replacing its siblings — or clear the group, with tag null. */
    'tags.set': {group: string; tag: string | null};
  }
}

/**
 * The core command behind menus written as data (declarative-plugin.ts): a
 * plugin with no code of its own can still offer "set this tag" on root `t`,
 * for any tag group it declares.
 */
export const TAGS_PLUGIN: KidrawPlugin = {
  id: 'tags',
  name: 'Tags',
  description: 'Sets a tag from a tag group of the graph\'s type — what menus written as data call',
  core: true,
  feature: true,
  nodeDefaults: {},
  commands: host => ({
    'tags.set': ({group, tag}) => setGroupTag(host, group, tag),
  }),
};

function setGroupTag(host: PluginHost, groupId: string, tag: string | null): void {
  const type = host.identity();
  const group = type.tagGroups?.find(candidate => candidate.id === groupId);
  if (!group) return host.status(`⚠ ${type.name} has no tag group "${groupId}"`);
  const choice = tag === null ? null : group.choices.find(candidate => candidate.tag === tag);
  if (choice === undefined) return host.status(`⚠ ${group.name} has no choice "${tag}"`);
  const targets = host.targetNodes().filter(carriesTags);
  if (targets.length === 0) return host.status('⚠ Select or hover a node first');
  const said = choice ? `${group.name}: ${choice.label}` : `${group.name} cleared`;
  const operations = exclusiveTagOperations(targets, group, choice);
  const conflict = operations.length > 0 ? host.apply(said, operations) : null;
  host.status(conflict ?? said + countSuffix(targets));
}
