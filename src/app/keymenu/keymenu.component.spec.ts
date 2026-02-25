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

  it('should include delete action in drag submenu config', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const dragConfig = (component as any).dragSubmenuConfig as Record<string, unknown>;
    const deleteAction = dragConfig['x'] as LabeledAction;

    expect(deleteAction instanceof LabeledAction).toBeTrue();
    expect(deleteAction.actionLabel).toBe('Delete');

    deleteAction.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.DELETE});
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

  it('should map zoom keys to p/y and move view controls under z submenu', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const rootConfig = buildRootConfig(component);
    const zoomOut = rootConfig['p'] as LabeledAction;
    const zoomIn = rootConfig['y'] as LabeledAction;
    const clearSelection = rootConfig['c'] as LabeledAction;

    expect(zoomOut.actionLabel).toBe('Zoom Out');
    expect(zoomIn.actionLabel).toBe('Zoom In');
    expect(clearSelection.actionLabel).toBe('Clear Selection');
    const viewSubmenu = rootConfig['z'] as LabeledSubmenuConfig;
    expect(viewSubmenu instanceof LabeledSubmenuConfig).toBeTrue();
    
    // 'd' is Connect
    const connectAction = rootConfig['d'] as LabeledAction;
    expect(connectAction).toBeDefined();
    expect(connectAction.actionLabel).toBe('Connect');

    // 'e' is Edit, 'f' is Insert submenu
    const editAction = rootConfig['e'] as LabeledAction;
    expect(editAction).toBeDefined();
    expect(editAction.actionLabel).toBe('Edit');
    const insertSubmenu = rootConfig['f'] as LabeledSubmenuConfig;
    expect(insertSubmenu instanceof LabeledSubmenuConfig).toBeTrue();

    expect(rootConfig['h']).toBeUndefined();

    clearSelection.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.UNSELECT_ALL});

    const toggleWaypoints = viewSubmenu.submenuConfig['w'] as LabeledAction;
    expect(toggleWaypoints.actionLabel).toBe('Toggle Waypoints');
    toggleWaypoints.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.TOGGLE_WAYPOINT_VISIBILITY});
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
    };

    component.keyAssignments = customAssignments;

    const rootConfig = buildRootConfig(component);
    expect((rootConfig['u'] as LabeledAction).actionLabel).toBe('Move Up');
    expect((rootConfig['i'] as LabeledAction).actionLabel).toBe('Zoom Out');
    expect(rootConfig['j'] instanceof LabeledAction).toBeTrue(); // Edit is a simple action
    expect(rootConfig['k'] instanceof LabeledSubmenuConfig).toBeTrue(); // Insert is a submenu
    expect(rootConfig['l'] instanceof LabeledActionSubmenuConfig).toBeTrue();

    const hints = component.activeProfileHints;
    expect(hints[0].key).toBe('u/y/o/p');
    expect(hints[1].key).toBe('i/j');
  });
});

function buildRootConfig(component: KeymenuComponent): Record<string, unknown> {
  return (component as any).buildRootSubmenuConfig() as Record<string, unknown>;
}
