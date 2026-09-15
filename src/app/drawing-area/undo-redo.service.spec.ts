import {GraphSnapshot} from './graph-snapshot';
import {UndoGroup} from './graph-operations';
import {UndoRedoService} from './undo-redo.service';

const EMPTY: GraphSnapshot = {nodes: [], edges: []};
const group = (label: string, changeSetId?: string): UndoGroup => ({author: 'agent:test', label, ops: [], changeSetId});

describe('UndoRedoService', () => {
  it('undoes snapshots and groups in order, keeping groups intact for redo', () => {
    const service = new UndoRedoService();
    service.pushSnapshot(EMPTY);
    service.pushGroup(group('agent step'));

    const first = service.undo(EMPTY)!;
    expect(first.kind).toBe('group');
    const second = service.undo(EMPTY)!;
    expect(second.kind).toBe('snapshot');
    expect(service.canUndo).toBeFalse();

    expect(service.redo(EMPTY)!.kind).toBe('snapshot');
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
});
