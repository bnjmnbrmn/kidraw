import type { GraphOperation } from '../drawing-area/graph-operations';
import { KidrawPlugin, PluginMenuEntry, PluginTagChoice, PluginTagGroup } from './plugin.model';
import type { PluginHost, PluginNode } from './plugin-host';
import { applyExclusiveTag } from './tag-groups';

const TODO_GRAPH_ID = 'todo-graph';

/** Task statuses on todo graphs; 'none' clears the status. The tag on the
 *  node is `status/<value>`. */
export type TaskStatus = 'draft' | 'todo' | 'in-progress' | 'blocked' | 'done' | 'none';

declare module './plugin-commands' {
  interface PluginCommandArgs {
    /** Set the status of the selected nodes (else the one under the
     *  crosshairs), or clear it with 'none'. */
    'todo.setStatus': {status: TaskStatus};
  }
}

/** Task status: at most one per node, drawn as a badge. */
const STATUS_GROUP: PluginTagGroup = {
  id: 'status',
  name: 'Status',
  choices: [
    { tag: 'status/draft',       label: 'DRAFT',       color: '#7c3aed' },
    { tag: 'status/todo',        label: 'TO DO',       color: '#64748b' },
    { tag: 'status/in-progress', label: 'IN PROGRESS', color: '#d97706' },
    { tag: 'status/blocked',     label: 'BLOCKED',     color: '#dc2626' },
    { tag: 'status/done',        label: 'DONE',        color: '#16a34a', dims: true },
  ],
};

/** The menu on root `t`, in workflow order. Suggested keys only where the
 *  word gives a right-hand letter: In progress, No status. */
const MENU: PluginMenuEntry[] = ([
  ['Draft', 'draft'], ['To Do', 'todo'], ['In Progress', 'in-progress', 'i'],
  ['Blocked', 'blocked'], ['Done', 'done'], ['No Status', 'none', 'n'],
] as [string, TaskStatus, string?][]).map(([label, status, key]) =>
  ({label, key, call: {id: 'todo.setStatus', args: {status}}}));

/** Identity plugin for todo/planning graphs: cards sized to their text —
 *  short items get small cards, long items wrap at the max width and grow
 *  downward. width/height here are the fit mode's max width and baseline,
 *  not a fixed card size; they are cascade defaults, so per-node values only
 *  reach the file when a card deviates (e.g. manually resized). */
export const TODO_GRAPH_PLUGIN: KidrawPlugin = {
  id: TODO_GRAPH_ID,
  name: 'Todo Graph',
  nodeDefaults: {
    shape: 'box',
    width: 280,
    height: 70,
    fontSize: 14,
    textOverflow: 'fit',
  },
  tagGroups: [STATUS_GROUP],
  commands: host => ({
    'todo.setStatus': ({status}) => setTaskStatus(host, status),
  }),
  menu: MENU,
};

/** Set the status of what the command acts on, or clear it with 'none'.
 *  Checks the status before the targets, so a selection of only junctions
 *  reports that it has nothing to mark (notes/bug-node-target-filter-order.md). */
function setTaskStatus(host: PluginHost, status: TaskStatus): void {
  if (host.diagramType() !== TODO_GRAPH_ID) return host.status('⚠ Task statuses need a Todo Graph (:type todo-graph)');
  const choice = status === 'none' ? null : STATUS_GROUP.choices.find(c => c.tag === `status/${status}`);
  if (choice === undefined) return host.status(`⚠ Unknown task status: ${status}`);
  const targets = host.targetNodes().filter(carriesStatus);
  if (targets.length === 0) return host.status('⚠ Select or hover a node to set its status');
  const operations = targets.map(node => statusOperation(node, choice)).filter(changesTags);
  const conflict = operations.length > 0 ? host.apply(statusText(choice), operations) : null;
  host.status(conflict ?? statusText(choice) + (targets.length > 1 ? ` (${targets.length} nodes)` : ''));
}

/** Junctions and invisible nodes carry no text, so no status either. */
const carriesStatus = (node: PluginNode) => node.shape !== 'junction' && node.shape !== 'invisible';

const statusText = (choice: PluginTagChoice | null) => choice ? `Status: ${choice.label}` : 'Status cleared';

function statusOperation(node: PluginNode, choice: PluginTagChoice | null): GraphOperation {
  const tags = [...node.tags];
  return {op: 'update_node', id: node.id, before: {tags}, after: {tags: applyExclusiveTag(tags, STATUS_GROUP, choice)}};
}

/** False for a status a node already has: no undo step for nothing. */
function changesTags(operation: GraphOperation): boolean {
  return operation.op !== 'update_node' || operation.before.tags?.join('\n') !== operation.after.tags?.join('\n');
}
