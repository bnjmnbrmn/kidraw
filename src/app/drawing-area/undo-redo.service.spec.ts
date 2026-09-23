import {GraphSnapshot} from './graph-snapshot';
import {UndoGroup} from './graph-operations';
import {UndoRedoService} from './undo-redo.service';

const EMPTY: GraphSnapshot = {nodes: [], edges: []};
const node = (id: string, isSelected = false) =>
  ({id, x: 0, y: 0, text: id, width: 100, height: 50, fontSize: 14, isSelected});
const graphOf = (...ids: string[]): GraphSnapshot => ({nodes: ids.map(id => node(id)), edges: []});
const group = (label: string, changeSetId?: string): UndoGroup => ({author: 'agent:test', label, ops: [], changeSetId});

describe('UndoRedoService', () => {
  it('undoes snapshots and groups in order, keeping groups intact for redo', () => {
    const service = new UndoRedoService();
    const before = graphOf('a');
    service.pushSnapshot(before);
    service.pushGroup(group('agent step'));

    const first = service.undo(EMPTY)!;
    expect(first.kind).toBe('group');
    const second = service.undo(EMPTY)!;
    expect(second.kind).toBe('snapshot');
    expect(service.canUndo).toBeFalse();

    expect(service.redo(before)!.kind).toBe('snapshot');
    const redone = service.redo(EMPTY)!;
    expect(redone.kind === 'group' && redone.group.label).toBe('agent step');
  });

  it('puts a group back when its undo could not be applied', () => {
    const service = new UndoRedoService();
    service.pushGroup(group('g'));
    service.undo(EMPTY);
    service.cancelUndo();
    expect(service.canUndo).toBeTrue();
    expect(service.canRedo).toBeFalse();
  });

  it('finds the groups of a change set', () => {
    const service = new UndoRedoService();
    service.pushGroup(group('turn 1, step 1', 'turn-1'));
    service.pushSnapshot(EMPTY);
    service.pushGroup(group('turn 2', 'turn-2'));
    service.pushGroup(group('turn 1, step 2', 'turn-1'));
    expect(service.changeSetGroups('turn-1').map(g => g.label)).toEqual(['turn 1, step 1', 'turn 1, step 2']);
  });

  describe('steps that would change nothing', () => {
    // A refused command still took a snapshot: the graph as it already is.
    it('are dropped, so one undo reverts the last real change', () => {
      const service = new UndoRedoService();
      const withB = graphOf('a', 'b');
      const withoutB = graphOf('a');
      service.pushSnapshot(withB);      // before deleting b
      service.pushSnapshot(withoutB);   // before a refused command
      service.pushSnapshot(withoutB);   // and another
      const entry = service.undo(withoutB);
      expect(entry?.kind === 'snapshot' && entry.snapshot).toEqual(withB);
      expect(service.canUndo).toBeFalse();
    });

    it('are all that is left: undo does nothing', () => {
      const service = new UndoRedoService();
      service.pushSnapshot(graphOf('a'));
      expect(service.undo(graphOf('a'))).toBeNull();
      expect(service.canRedo).toBeFalse();
    });

    it('do not include a change of selection, which undo restores', () => {
      const service = new UndoRedoService();
      const unselected: GraphSnapshot = {nodes: [node('a')], edges: []};
      service.pushSnapshot(unselected);
      const entry = service.undo({nodes: [node('a', true)], edges: []});
      expect(entry?.kind === 'snapshot' && entry.snapshot).toEqual(unselected);
    });

    it('never include a group, whose operations always change something', () => {
      const service = new UndoRedoService();
      service.pushGroup(group('agent step'));
      expect(service.undo(EMPTY)?.kind).toBe('group');
    });

    it('are dropped from redo too', () => {
      const service = new UndoRedoService();
      service.pushSnapshot(graphOf('a'));
      service.undo(graphOf('a', 'b'));             // redo now holds a+b
      expect(service.redo(graphOf('a', 'b'))).toBeNull();
    });
  });
});
