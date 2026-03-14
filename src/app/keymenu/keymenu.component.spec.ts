import {TestBed} from '@angular/core/testing';
import {
  KeymenuComponent,
} from './keymenu.component';
import {
  DEFAULT_KEYMENU_KEY_ASSIGNMENTS,
  KeymenuKeyAssignments,
} from './config/key-assignments';
import {LabeledAction} from '../lib/keymenu/keys/labeledAction';
import {LabeledSubmenuConfig} from '../lib/keymenu/keys/labeledSubmenuConfig';
import {LabeledActionSubmenuConfig} from '../lib/keymenu/layouts/us-qwerty/submenuConfig';
import {DACommandType} from '../drawing-area/command.model';

describe('KeymenuComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeymenuComponent],
    }).compileComponents();
  });

  it('should expose profile hints', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;

    expect(component.activeProfileHints.length).toBeGreaterThan(0);
    expect(component.activeProfileHints.some((hint) => hint.action.includes('Move'))).toBeTrue();
  });

  it('should include zoom actions in drag submenu config', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const dragConfig = (component as any).dragSubmenuConfig as Record<string, unknown>;
    const zoomInAction = dragConfig['i'] as LabeledAction;

    expect(zoomInAction instanceof LabeledAction).toBeTrue();
    expect(zoomInAction.actionLabel).toBe('Zoom In');

    zoomInAction.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.ZOOM_IN});
  });

  it('should not include Add Select action in select submenu config', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;

    const selectConfig = (component as any).buildSelectSubmenuConfig() as Record<string, unknown>;

    expect(selectConfig['n']).toBeUndefined();
  });

  it('should include delete action in select submenu config', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const selectConfig = (component as any).buildSelectSubmenuConfig() as Record<string, unknown>;
    const deleteAction = selectConfig['x'] as LabeledAction;

    expect(deleteAction instanceof LabeledAction).toBeTrue();
    expect(deleteAction.actionLabel).toBe('Delete');

    deleteAction.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.DELETE});
  });

  it('should use hold-select root action to enter drag selection without second select key', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const rootConfig = buildRootConfig(component);
    const selectDrag = rootConfig['v'] as LabeledActionSubmenuConfig;

    expect(selectDrag instanceof LabeledActionSubmenuConfig).toBeTrue();
    selectDrag.action();

    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.MULTI_ITEM_SELECT});
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.ENTER_DRAG_MODE});
  });

  it('should have nav submenu on r with zoom inside, not at root level', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const rootConfig = buildRootConfig(component);
    const clearSelection = rootConfig['c'] as LabeledAction;

    // Zoom keys should NOT be at root level
    expect(rootConfig['p']).toBeUndefined();
    expect(rootConfig['y']).toBeUndefined();

    expect(clearSelection.actionLabel).toBe('Clear Selection');
    const panSubmenu = rootConfig['r'] as LabeledSubmenuConfig;
    expect(panSubmenu instanceof LabeledSubmenuConfig).toBeTrue();

    // 'i' is Edit (LabeledSubmenuConfig), 'f' is Insert submenu (vim profile)
    const editAction = rootConfig['i'] as LabeledSubmenuConfig;
    expect(editAction).toBeDefined();
    expect(editAction instanceof LabeledSubmenuConfig).toBeTrue();
    const insertSubmenu = rootConfig['f'] as LabeledSubmenuConfig;
    expect(insertSubmenu instanceof LabeledSubmenuConfig).toBeTrue();

    // 'h' is Move Left in vim profile
    const moveLeft = rootConfig['h'] as LabeledAction;
    expect(moveLeft).toBeDefined();
    expect(moveLeft.actionLabel).toBe('Move Left');

    clearSelection.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.UNSELECT_ALL});

    // Move-by-node submenu at 't'
    const moveByNodeSubmenu = rootConfig['t'] as LabeledSubmenuConfig;
    expect(moveByNodeSubmenu instanceof LabeledSubmenuConfig).toBeTrue();
    const toggleWaypoints = moveByNodeSubmenu.submenuConfig['d'] as LabeledAction;
    expect(toggleWaypoints.actionLabel).toBe('Toggle Waypoints');
    toggleWaypoints.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.TOGGLE_WAYPOINT_VISIBILITY});

    const nodeLeft = moveByNodeSubmenu.submenuConfig['h'] as LabeledAction;
    expect(nodeLeft.actionLabel).toBe('Node Left');

    // Move-by-graph submenu at 'g'
    const moveByGraphSubmenu = rootConfig['g'] as LabeledSubmenuConfig;
    expect(moveByGraphSubmenu instanceof LabeledSubmenuConfig).toBeTrue();
    const nextEdge = moveByGraphSubmenu.submenuConfig['n'] as LabeledAction;
    expect(nextEdge.actionLabel).toBe('Next Edge');
  });

  it('should build root bindings and hints from configurable key assignments', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;

    const customAssignments: KeymenuKeyAssignments = {
      ...DEFAULT_KEYMENU_KEY_ASSIGNMENTS,
      movement: {up: 'u', left: 'y', down: 'o', right: 'p'},
      drag: {up: 'u', left: 'y', down: 'o', right: 'p'},
      zoom: {out: 'i', in: 'j'},
      root: {
        ...DEFAULT_KEYMENU_KEY_ASSIGNMENTS.root,
        editSubmenu: 'j',
        insertSubmenu: 'k',
        selectDragSubmenu: 'l',
      },
      shared: {
        ...DEFAULT_KEYMENU_KEY_ASSIGNMENTS.shared,
        undo: 'n',
      },
    };

    component.keyAssignments = customAssignments;

    const rootConfig = buildRootConfig(component);
    expect((rootConfig['u'] as LabeledAction).actionLabel).toBe('Move Up');
    // Zoom keys no longer at root level
    expect(rootConfig['i']).toBeUndefined();
    expect(rootConfig['j'] instanceof LabeledSubmenuConfig).toBeTrue(); // Edit is submenu (tap fires on keyup)
    expect(rootConfig['k'] instanceof LabeledSubmenuConfig).toBeTrue(); // Insert is a submenu
    expect(rootConfig['l'] instanceof LabeledActionSubmenuConfig).toBeTrue();

    const hints = component.activeProfileHints;
    expect(hints[0].key).toBe('u/y/o/p');
  });
});

function buildRootConfig(component: KeymenuComponent): Record<string, unknown> {
  return (component as any).buildRootSubmenuConfig() as Record<string, unknown>;
}
