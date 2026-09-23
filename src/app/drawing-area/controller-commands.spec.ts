import { DACommandType } from './command.model';
import { LinkNavController, LinkNavHost } from './link-nav-controller';
import { NavigationGridController, NavigationGridHost } from './navigation-grid-controller';
import { TextEditingController, TextEditingHost } from './text-editing-controller';

/** The controllers that bring their own slice of the command table route
 *  each command, with its payload, to their own methods. */
describe('controller command slices', () => {
  it('Move by Link: hold, step toward a quadrant, release', () => {
    const linkNav = new LinkNavController({} as LinkNavHost);
    const move = spyOn(linkNav, 'move');
    const enter = spyOn(linkNav, 'enter');
    const commands = linkNav.commands();
    commands[DACommandType.ENTER_LINK_NAV]();
    commands[DACommandType.MOVE_LINK_UP]();
    commands[DACommandType.MOVE_LINK_LEFT]();
    expect(enter).toHaveBeenCalled();
    expect(move.calls.allArgs()).toEqual([['north'], ['west']]);
  });

  it('move by node: steps default to nodes and labels', () => {
    const navGrid = new NavigationGridController({} as NavigationGridHost);
    const snap = spyOn(navGrid, 'snapToNodeInDirection');
    const commands = navGrid.commands();
    commands[DACommandType.SNAP_TO_NODE_LEFT]({kind: DACommandType.SNAP_TO_NODE_LEFT});
    commands[DACommandType.SNAP_TO_NODE_DOWN]({kind: DACommandType.SNAP_TO_NODE_DOWN, targets: 'all'});
    expect(snap.calls.allArgs()).toEqual([['left', 'labels'], ['down', 'all']]);
  });

  it('text editing: caret commands reach every caret being edited', () => {
    const node = jasmine.createSpyObj('node', ['moveCursorH', 'setCursorMode']);
    const label = jasmine.createSpyObj('label', ['moveCursorH', 'setCursorMode']);
    const textEditor = new TextEditingController({
      drawingLayer: {getSelectedDANodes: () => [node], batchDraw: () => undefined},
      getSelectedLabels: () => [label],
      refreshLabelEditGhost: () => undefined,
    } as unknown as TextEditingHost);
    const commands = textEditor.commands();
    commands[DACommandType.CURSOR_LEFT]();
    commands[DACommandType.SET_TEXT_CURSOR_MODE]({kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'vimVisual'});
    expect(node.moveCursorH).toHaveBeenCalledWith(-1);
    expect(label.moveCursorH).toHaveBeenCalledWith(-1);
    expect(node.setCursorMode).toHaveBeenCalledWith('vimVisual');
    expect(label.setCursorMode).toHaveBeenCalledWith('vimVisual');
  });
});
