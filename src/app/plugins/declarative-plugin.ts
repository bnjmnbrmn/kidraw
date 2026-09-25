/**
 * Plugins written as data — YAML — rather than code (notes/design-plugins.md).
 *
 * What a user can add without a rebuild, share as a file, or an agent can
 * write (define_plugin): a diagram type's node defaults, its label format, its tag
 * groups, node kinds and edge kinds, what it requires and uses, and a menu
 * for root `t` whose entries set its tags. Nothing in it runs: a menu entry
 * names a tag, and the core `tags.set` command does the setting.
 *
 *     id: kanban
 *     name: Kanban
 *     tagGroups:
 *       - id: column
 *         name: Column
 *         choices:
 *           - {tag: column/todo, label: TO DO, color: '#64748b'}
 *           - {tag: column/done, label: DONE, color: '#16a34a', dims: true}
 *     menu:
 *       - {label: To Do, set: column/todo}
 *       - {label: Done, set: column/done, key: l}
 *       - {label: No Column, clear: column}
 *
 * Checked strictly — unknown fields, bad colors and tags that no group has
 * are errors, all of them reported at once — because the file comes from
 * outside the build.
 */
import * as yaml from 'js-yaml';
import type { NodeShape, TextOverflowMode } from '../drawing-area/command.model';
import {
  KidrawPlugin, PluginEdgeKind, PluginMenuEntry, PluginNodeDefaults, PluginNodeKind, PluginTagChoice, PluginTagGroup,
} from './plugin.model';

export type DefinitionResult = {plugin: KidrawPlugin; errors?: never} | {plugin?: never; errors: string[]};

const FIELDS = ['id', 'name', 'description', 'requires', 'uses', 'labels', 'nodes', 'tagGroups', 'edgeKinds', 'nodeKinds', 'menu'];
const ID = /^[a-z][a-z0-9-]{1,39}$/;
const TAG = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SHAPES: NodeShape[] = ['box', 'circle', 'diamond'];
const OVERFLOWS: TextOverflowMode[] = ['clip', 'shrink-font', 'ellipsis', 'widen-h', 'widen-v', 'widen-both', 'fit'];

/** Read a plugin from its YAML source, or say everything wrong with it. */
export function parsePluginDefinition(source: string): DefinitionResult {
  let raw: unknown;
  try {
    raw = yaml.load(source);
  } catch (error) {
    return {errors: [`not valid YAML: ${(error as Error).message.split('\n')[0]}`]};
  }
  const errors: string[] = [];
  const plugin = readPlugin(raw, errors);
  return errors.length > 0 || !plugin ? {errors} : {plugin};
}

/** A reader that records what is wrong, where, and carries on. */
class Reader {
  constructor(private readonly errors: string[], private readonly at: string) {}

  fail(message: string): undefined {
    this.errors.push(`${this.at}: ${message}`);
    return undefined;
  }

  child(at: string | number): Reader {
    return new Reader(this.errors, typeof at === 'number' ? `${this.at}[${at}]` : `${this.at}.${at}`);
  }

  object(value: unknown, fields: readonly string[]): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return this.fail('should be a mapping');
    const record = value as Record<string, unknown>;
    Object.keys(record).filter(key => !fields.includes(key)).forEach(key => this.child(key).fail('is not a field here'));
    return record;
  }

  list(value: unknown): unknown[] | undefined {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : this.fail('should be a list');
  }

  text(value: unknown, {required = false, max = 200, pattern}: {required?: boolean; max?: number; pattern?: RegExp} = {}): string | undefined {
    if (value === undefined) return required ? this.fail('is required') : undefined;
    if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
      return this.fail(`should be text of at most ${max} characters`);
    }
    return !pattern || pattern.test(value) ? value : this.fail(`"${value}" is not allowed here`);
  }

  number(value: unknown, min: number, max: number): number | undefined {
    if (value === undefined) return undefined;
    return typeof value === 'number' && value >= min && value <= max ? value : this.fail(`should be a number from ${min} to ${max}`);
  }

  flag(value: unknown): boolean | undefined {
    if (value === undefined) return undefined;
    return typeof value === 'boolean' ? value : this.fail('should be true or false');
  }

  oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
    if (value === undefined) return undefined;
    return allowed.includes(value as T) ? value as T : this.fail(`should be one of ${allowed.join(', ')}`);
  }
}

function readPlugin(raw: unknown, errors: string[]): KidrawPlugin | undefined {
  const at = new Reader(errors, 'plugin');
  const record = at.object(raw, FIELDS);
  if (!record) return undefined;
  return withoutEmpty({...readIdentity(record, at), ...readContributions(record, at)});
}

/** What the plugin is: its name, what it depends on, how its labels are
 *  written and how its nodes start out. */
function readIdentity(record: Record<string, unknown>, at: Reader): Omit<KidrawPlugin, keyof Contributions> {
  return {
    id: at.child('id').text(record['id'], {required: true, max: 40, pattern: ID}) ?? '',
    name: at.child('name').text(record['name'], {required: true, max: 40}) ?? '',
    description: at.child('description').text(record['description']),
    requires: readIds(record['requires'], at.child('requires')),
    uses: readIds(record['uses'], at.child('uses')),
    labelFormat: at.child('labels').oneOf(record['labels'], ['plain', 'markdown'] as const),
    nodeDefaults: readNodeDefaults(record['nodes'], at.child('nodes')),
  };
}

type Contributions = Pick<KidrawPlugin, 'tagGroups' | 'edgeKinds' | 'nodeKinds' | 'menu'>;

/** What the plugin adds to its graphs: tag groups, kinds, and a menu that
 *  sets its own tags. */
function readContributions(record: Record<string, unknown>, at: Reader): Contributions {
  const each = <T>(field: string, read: (value: unknown, at: Reader) => T | undefined) =>
    definedOnly(at.list(record[field])?.map((value, i) => read(value, at.child(field).child(i))));
  const tagGroups = each('tagGroups', readTagGroup);
  return {
    tagGroups,
    edgeKinds: each('edgeKinds', (value, where) => readKind(value, where, true)),
    nodeKinds: each('nodeKinds', (value, where) => readKind(value, where, false)),
    menu: each('menu', (value, where) => readMenuEntry(value, where, tagGroups)),
  };
}

function readIds(value: unknown, at: Reader): string[] | undefined {
  const ids = at.list(value)?.map((id, i) => at.child(i).text(id, {max: 40, pattern: ID}));
  return ids?.length ? definedOnly(ids) : undefined;
}

function readNodeDefaults(value: unknown, at: Reader): PluginNodeDefaults {
  if (value === undefined) return {};
  const record = at.object(value, ['shape', 'width', 'height', 'fontSize', 'textOverflow']) ?? {};
  return {
    shape: at.child('shape').oneOf(record['shape'], SHAPES),
    width: at.child('width').number(record['width'], 20, 1000),
    height: at.child('height').number(record['height'], 20, 1000),
    fontSize: at.child('fontSize').number(record['fontSize'], 6, 72),
    textOverflow: at.child('textOverflow').oneOf(record['textOverflow'], OVERFLOWS),
  };
}

function readTagGroup(value: unknown, at: Reader): PluginTagGroup | undefined {
  const record = at.object(value, ['id', 'name', 'choices']);
  if (!record) return undefined;
  const choices = definedOnly(at.list(record['choices'])?.map((choice, i) => readChoice(choice, at.child('choices').child(i))));
  const id = at.child('id').text(record['id'], {required: true, max: 40, pattern: ID});
  const name = at.child('name').text(record['name'], {required: true, max: 40});
  if (choices.length === 0) at.child('choices').fail('needs at least one choice');
  return id && name && choices.length > 0 ? {id, name, choices} : undefined;
}

function readChoice(value: unknown, at: Reader): PluginTagChoice | undefined {
  const record = at.object(value, ['tag', 'label', 'color', 'dims']);
  if (!record) return undefined;
  const tag = at.child('tag').text(record['tag'], {required: true, max: 80, pattern: TAG});
  const label = at.child('label').text(record['label'], {required: true, max: 30});
  const color = at.child('color').text(record['color'], {required: true, max: 7, pattern: COLOR});
  const dims = at.child('dims').flag(record['dims']);
  return tag && label && color ? {tag, label, color, ...(dims ? {dims} : {})} : undefined;
}

function readKind(value: unknown, at: Reader, edge: boolean): PluginEdgeKind | PluginNodeKind | undefined {
  const record = at.object(value, edge ? ['tag', 'name', 'color', 'description', 'faint'] : ['tag', 'name', 'color', 'description']);
  if (!record) return undefined;
  const tag = at.child('tag').text(record['tag'], {required: true, max: 80, pattern: TAG});
  const name = at.child('name').text(record['name'], {required: true, max: 40});
  const color = at.child('color').text(record['color'], {required: true, max: 7, pattern: COLOR});
  const description = at.child('description').text(record['description'], {required: true, max: 300});
  const faint = edge ? at.child('faint').flag(record['faint']) : undefined;
  return tag && name && color && description ? {tag, name, color, description, ...(faint ? {faint} : {})} : undefined;
}

/** A menu entry sets one tag (`set`) or clears one group (`clear`), both of
 *  this plugin's own groups. */
function readMenuEntry(value: unknown, at: Reader, groups: readonly PluginTagGroup[]): PluginMenuEntry | undefined {
  const record = at.object(value, ['label', 'set', 'clear', 'key']);
  if (!record) return undefined;
  const label = at.child('label').text(record['label'], {required: true, max: 30});
  const key = at.child('key').text(record['key'], {max: 1});
  if ((record['set'] === undefined) === (record['clear'] === undefined)) return at.fail('needs exactly one of set or clear');
  const call = record['set'] !== undefined
    ? setCall(at.child('set').text(record['set'], {max: 80, pattern: TAG}), groups, at.child('set'))
    : clearCall(at.child('clear').text(record['clear'], {max: 40, pattern: ID}), groups, at.child('clear'));
  return label && call ? {label, call, ...(key ? {key} : {})} : undefined;
}

function setCall(tag: string | undefined, groups: readonly PluginTagGroup[], at: Reader): PluginMenuEntry['call'] | undefined {
  if (!tag) return undefined;
  const group = groups.find(candidate => candidate.choices.some(choice => choice.tag === tag));
  return group ? {id: 'tags.set', args: {group: group.id, tag}} : at.fail(`no tag group has the tag ${tag}`);
}

function clearCall(groupId: string | undefined, groups: readonly PluginTagGroup[], at: Reader): PluginMenuEntry['call'] | undefined {
  if (!groupId) return undefined;
  return groups.some(group => group.id === groupId) ? {id: 'tags.set', args: {group: groupId, tag: null}} : at.fail(`no tag group ${groupId}`);
}

function definedOnly<T>(values: (T | undefined)[] | undefined): T[] {
  return (values ?? []).filter((value): value is T => value !== undefined);
}

/** Leave out what the file did not say: empty lists and unset fields. */
function withoutEmpty(plugin: KidrawPlugin): KidrawPlugin {
  const kept = Object.entries(plugin).filter(([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0));
  const nodeDefaults = Object.fromEntries(Object.entries(plugin.nodeDefaults).filter(([, value]) => value !== undefined));
  return {...Object.fromEntries(kept), nodeDefaults} as KidrawPlugin;
}
