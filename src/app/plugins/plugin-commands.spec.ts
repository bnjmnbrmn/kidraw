import {NodeShape} from '../drawing-area/command.model';
import {GraphOperation} from '../drawing-area/graph-operations';
import {KidrawPlugin} from './plugin.model';
import {PluginCommandCall, PluginCommands} from './plugin-commands';
import {PluginHost, PluginNode} from './plugin-host';
import {TaskStatus, TODO_GRAPH_PLUGIN} from './todo-graph.plugin';

/** A host with a scripted graph, recording what a plugin asks of it. */
function fakeHost(options: {type?: string; targets?: Partial<PluginNode>[]; conflict?: string} = {}) {
  const applied: {label: string; operations: GraphOperation[]}[] = [];
  const statuses: string[] = [];
  const host: PluginHost = {
    diagramType: () => options.type ?? 'todo-graph',
    targetNodes: () => (options.targets ?? [{}]).map((node, i) =>
      ({id: `n${i}`, label: `node ${i}`, tags: [], shape: 'box' as NodeShape, ...node})),
    apply: (label, operations) => {
      applied.push({label, operations});
      return options.conflict ?? null;
    },
    status: message => statuses.push(message),
  };
  return {host, applied, statuses};
}

const setStatus = (host: PluginHost, status: TaskStatus) =>
  new PluginCommands(host, [TODO_GRAPH_PLUGIN]).run({id: 'todo.setStatus', args: {status}});

const tagsAfter = (operation: GraphOperation) => operation.op === 'update_node' ? operation.after.tags : undefined;

describe('plugin commands', () => {
  // A plugin of the test's own, bringing a command through the same
  // declaration merging the real ones use.
  const echo = (run: jasmine.Spy): KidrawPlugin =>
    ({id: 'echo', name: 'Echo', nodeDefaults: {}, commands: () => ({'todo.setStatus': run})});

  it('runs a call on the plugin that brought the command, with its arguments', () => {
    const run = jasmine.createSpy('run');
    const commands = new PluginCommands(fakeHost().host, [echo(run)]);
    expect(commands.run({id: 'todo.setStatus', args: {status: 'done'}})).toBeTrue();
    expect(run).toHaveBeenCalledOnceWith({status: 'done'});
  });

  it('says so when no plugin brought the command', () => {
    const commands = new PluginCommands(fakeHost().host, []);
    expect(commands.has('todo.setStatus')).toBeFalse();
    expect(commands.run({id: 'todo.setStatus', args: {status: 'done'}} as PluginCommandCall)).toBeFalse();
  });

  it('refuses two plugins bringing the same command', () => {
    const run = jasmine.createSpy('run');
    expect(() => new PluginCommands(fakeHost().host, [echo(run), {...echo(run), id: 'echo-2'}]))
      .toThrowError(/Two plugins claim todo.setStatus/);
  });
});

describe('the todo plugin', () => {
  it('sets a status through one undo group of operations, and says so', () => {
    const {host, applied, statuses} = fakeHost({targets: [{tags: ['keep']}]});
    setStatus(host, 'done');
    expect(applied.length).toBe(1);
    expect(applied[0].operations).toEqual([
      {op: 'update_node', id: 'n0', before: {tags: ['keep']}, after: {tags: ['keep', 'status/done']}},
    ]);
    expect(statuses).toEqual(['Status: DONE']);
  });

  it('replaces the status a node already has, and clears it with none', () => {
    const replaced = fakeHost({targets: [{tags: ['status/todo']}]});
    setStatus(replaced.host, 'blocked');
    expect(tagsAfter(replaced.applied[0].operations[0])).toEqual(['status/blocked']);

    const cleared = fakeHost({targets: [{tags: ['status/todo']}]});
    setStatus(cleared.host, 'none');
    expect(tagsAfter(cleared.applied[0].operations[0])).toEqual([]);
    expect(cleared.statuses).toEqual(['Status cleared']);
  });

  it('takes no undo step for a status a node already has', () => {
    const {host, applied, statuses} = fakeHost({targets: [{tags: ['status/done']}]});
    setStatus(host, 'done');
    expect(applied).toEqual([]);
    expect(statuses).toEqual(['Status: DONE']);
  });

  it('marks nodes that carry text, and counts them', () => {
    const {host, applied, statuses} = fakeHost({targets: [{}, {shape: 'junction'}, {}]});
    setStatus(host, 'todo');
    expect(applied[0].operations.length).toBe(2);
    expect(statuses).toEqual(['Status: TO DO (2 nodes)']);
  });

  it('refuses outside a todo graph, and with nothing to mark', () => {
    const plain = fakeHost({type: 'default'});
    setStatus(plain.host, 'done');
    expect(plain.applied).toEqual([]);
    expect(plain.statuses[0]).toContain('Todo Graph');

    const markers = fakeHost({targets: [{shape: 'junction'}, {shape: 'invisible'}]});
    setStatus(markers.host, 'done');
    expect(markers.applied).toEqual([]);
    expect(markers.statuses[0]).toContain('Select or hover a node');
  });

  it('reports a conflict instead of the status', () => {
    const {host, statuses} = fakeHost({conflict: 'n0 changed underneath'});
    setStatus(host, 'done');
    expect(statuses).toEqual(['n0 changed underneath']);
  });
});
