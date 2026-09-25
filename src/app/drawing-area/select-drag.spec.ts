import {Axis} from './axis';
import {DACommandType} from './command.model';
import {SelectDrag, SelectDragHost} from './select-drag';

describe('SelectDrag', () => {
  function setUp(options: {item?: any; corner?: any} = {}) {
    const item = options.item ?? null;
    const node = options.corner ?? null;
    const areaSelect = {active: false, begin: jasmine.createSpy('begin').and.callFake(() => { areaSelect.active = true; }),
      step: jasmine.createSpy('step'), finish: jasmine.createSpy('finish').and.callFake(() => { areaSelect.active = false; })};
    const host = {
      drawingLayer: {
        batchDraw: () => {}, unselectAll: jasmine.createSpy('unselectAll'),
        getDANodes: () => node ? [node] : [],
        getSelectedDANodes: () => [item, node].filter(n => n?.isSelected && n.resizeBy),
        getSelectedDAWaypoints: () => [], getSelectedDAEdges: () => [],
      },
      crosshairsLayer: {crosshairs: {x: 0, y: 0}},
      camera: {toLayer: (p: any) => p},
      resizeStep: 20,
      areaSelect,
      dragStep: jasmine.createSpy('dragStep'),
      topItemUnderCrosshairs: () => item,
      getSelectedLabels: () => [],
      updateEdgesForResizedNodes: () => {},
      rerouteIncidentEdges: jasmine.createSpy('rerouteIncidentEdges'),
      unselectAll: jasmine.createSpy('unselectAll'),
      finishTweens: () => {},
      checkAndEmitEditState: () => {},
    } as unknown as SelectDragHost;
    const drag = new SelectDrag(host);
    const run = (kind: DACommandType, extra: object = {}) =>
      (drag.commands() as any)[kind]({kind, ...extra});
    return {drag, host: host as any, run, areaSelect};
  }

  it('selects what is under the crosshairs, drags it, and clears the selection on release', () => {
    const item = {isSelected: false};
    const {run, host} = setUp({item});
    run(DACommandType.MULTI_ITEM_SELECT);
    run(DACommandType.ENTER_DRAG_MODE);
    run(DACommandType.DRAG_SELECTED_RIGHT, {gridTier: 'coarse'});
    expect(item.isSelected).toBeTrue();
    expect(host.dragStep).toHaveBeenCalledWith(Axis.X, 1, 'coarse');
    run(DACommandType.EXIT_DRAG_MODE);
    expect(host.unselectAll).toHaveBeenCalled();
  });

  it('a quick tap on something already selected deselects it', () => {
    const item = {isSelected: true};
    const {run} = setUp({item});
    run(DACommandType.MULTI_ITEM_SELECT);
    run(DACommandType.ENTER_DRAG_MODE);
    run(DACommandType.EXIT_DRAG_MODE);
    expect(item.isSelected).toBeFalse();
  });

  it('over empty canvas the drag keys grow an area select, which takes no undo snapshot', () => {
    const {run, drag, areaSelect, host} = setUp();
    run(DACommandType.ENTER_DRAG_MODE);
    expect(drag.takesUndoSnapshot()).toBeFalse();
    run(DACommandType.DRAG_SELECTED_DOWN, {});
    expect(areaSelect.step).toHaveBeenCalledWith(Axis.Y, 1, undefined);
    expect(host.dragStep).not.toHaveBeenCalled();
    run(DACommandType.EXIT_DRAG_MODE);
    expect(areaSelect.finish).toHaveBeenCalled();
  });

  it('takes one undo snapshot per hold', () => {
    const {run, drag} = setUp({item: {isSelected: false}});
    run(DACommandType.ENTER_DRAG_MODE);
    expect(drag.takesUndoSnapshot()).toBeTrue();
    expect(drag.takesUndoSnapshot()).toBeFalse();
    run(DACommandType.EXIT_DRAG_MODE);
    run(DACommandType.ENTER_DRAG_MODE);
    expect(drag.takesUndoSnapshot()).toBeTrue();
  });

  it('near a corner with nothing to drag, resizes through the handle', () => {
    const node = {nodeShape: 'box', isSelected: false, getBottomRightAbsolute: () => ({x: 10, y: 0}),
      showResizeHandle: jasmine.createSpy('show'), hideResizeHandle: jasmine.createSpy('hide'),
      resizeBy: jasmine.createSpy('resizeBy')};
    const {run, drag} = setUp({corner: node});
    drag.refreshResizeHandle();
    expect(node.showResizeHandle).toHaveBeenCalled();
    run(DACommandType.ENTER_DRAG_MODE);
    run(DACommandType.DRAG_SELECTED_RIGHT, {});
    expect(node.resizeBy).toHaveBeenCalledWith(20);
    run(DACommandType.EXIT_DRAG_MODE);
    expect(node.hideResizeHandle).toHaveBeenCalled();
  });

  it('offers no handle when something is under the crosshairs', () => {
    const node = {nodeShape: 'box', getBottomRightAbsolute: () => ({x: 10, y: 0}),
      showResizeHandle: jasmine.createSpy('show'), hideResizeHandle: () => {}};
    const {drag} = setUp({item: {isSelected: false}, corner: node});
    drag.refreshResizeHandle();
    expect(node.showResizeHandle).not.toHaveBeenCalled();
  });
});
