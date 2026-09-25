import {DrawingLayer} from './drawing.layer';
import {HistoryController, HistoryHost} from './history-controller';
import {DANodeSnapshot} from './graph-snapshot';
import {UndoRedoService} from './undo-redo.service';

function nodeSnapshot(id: string, text: string): DANodeSnapshot {
  return {id, x: 0, y: 0, text, width: 120, height: 60, fontSize: 14, isSelected: false, nodeShape: 'box'};
}

describe('HistoryController', () => {
  let layer: DrawingLayer;
  let undoRedo: UndoRedoService;
  let statuses: string[];
  let saves: number;
  let history: HistoryController;

  beforeEach(() => {
    layer = new DrawingLayer();
    undoRedo = new UndoRedoService();
    statuses = [];
    saves = 0;
    const host: HistoryHost = {
      drawingLayer: layer,
      undoRedo,
      targetNodes: () => [],
      isPluginEnabled: () => true,
      updateEdgesForResizedNodes: () => {},
      autoRouteNewEdge: () => {},
      finishTweens: () => {},
      checkAndEmitEditState: () => {},
      scheduleVaultAutoSave: () => saves++,
      emitStatus: message => statuses.push(message),
      beforeGraphReplaced: () => {},
      afterGraphReplaced: () => {},
    };
    history = new HistoryController(host);
  });

  const texts = () => layer.getDANodes().map(node => node.label.text());

  it('applies a group, records it and saves; undo and redo replay it', () => {
    expect(history.apply({author: 'user', label: 'add A', ops: [{op: 'add_node', node: nodeSnapshot('n1', 'A')}]}))
      .toBeNull();
    expect(texts()).toEqual(['A']);
    expect(saves).toBe(1);

    history.undo();
    expect(texts()).toEqual([]);
    expect(statuses.pop()).toBe('Undid: add A');
    history.redo();
    expect(texts()).toEqual(['A']);
    expect(statuses.pop()).toBe('Redid: add A');
  });

  it('changes nothing and records nothing when a group conflicts', () => {
    const conflict = history.apply({author: 'user', label: 'remove ghost',
      ops: [{op: 'remove_node', node: nodeSnapshot('missing', 'Ghost')}]});
    expect(conflict).not.toBeNull();
    expect(undoRedo.canUndo).toBeFalse();
    expect(saves).toBe(0);
  });

  it('reverts a change set as one new group', () => {
    history.apply({author: 'agent', label: 'Agent: add two', changeSetId: 'turn-1',
      ops: [{op: 'add_node', node: nodeSnapshot('n1', 'A')}, {op: 'add_node', node: nodeSnapshot('n2', 'B')}]});
    expect(history.revertChangeSet('turn-1')).toBeNull();
    expect(texts()).toEqual([]);
    expect(history.revertChangeSet('turn-9')).toBe('Nothing left to revert in turn-9');
  });

  it('restores a snapshot entry through the host', () => {
    undoRedo.pushSnapshot(layer.serializeGraph());
    history.apply({author: 'user', label: 'add A', ops: [{op: 'add_node', node: nodeSnapshot('n1', 'A')}]});
    history.undo();
    history.undo();
    expect(texts()).toEqual([]);
  });
});
