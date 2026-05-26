import {TestBed} from '@angular/core/testing';
import {
  KeymenuComponent,
} from './keymenu.component';
import {
  IJKL_KEYMENU_KEY_ASSIGNMENTS,
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

  it('should include drag speed submenu in select submenu config', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;

    const selectConfig = (component as any).buildSelectSubmenuConfig() as Record<string, unknown>;
    // dragSpeed.bigger = 'x' in vim layout
    const biggerDrag = selectConfig['x'] as LabeledSubmenuConfig;

    expect(biggerDrag instanceof LabeledSubmenuConfig).toBeTrue();
    expect(biggerDrag.submenuLabel).toBe('Coarse Drag...');
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
    const panZoomSubmenu = rootConfig['r'] as LabeledSubmenuConfig;
    expect(panZoomSubmenu instanceof LabeledSubmenuConfig).toBeTrue();
    // Zoom should be inside the pan/zoom submenu
    const zoomIn = panZoomSubmenu.submenuConfig['i'] as LabeledAction;
    expect(zoomIn instanceof LabeledAction).toBeTrue();
    expect(zoomIn.actionLabel).toBe('Zoom In');

    // Misc submenu at 'm'
    const miscSubmenu = rootConfig['m'] as LabeledSubmenuConfig;
    expect(miscSubmenu instanceof LabeledSubmenuConfig).toBeTrue();

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
    const nodeLeft = moveByNodeSubmenu.submenuConfig['h'] as LabeledAction;
    expect(nodeLeft.actionLabel).toBe('Node Left');

    // Move-by-graph submenu at 'g'
    const moveByGraphSubmenu = rootConfig['g'] as LabeledSubmenuConfig;
    expect(moveByGraphSubmenu instanceof LabeledSubmenuConfig).toBeTrue();
    const nextEdge = moveByGraphSubmenu.submenuConfig['n'] as LabeledAction;
    expect(nextEdge.actionLabel).toBe('Jump Outgoing');
  });

  it('should build a sticky insert-mode submenu config (Proposal B prototype)', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    // The sticky insertMode root submenu must:
    //  - bind movement keys to MOVE_CROSSHAIRS_* (vim: h j k l)
    //  - bind node-shape leaves to CREATE_NEW_NODE without leaving the mode
    //  - bind the insert-submenu key (vim: f) to a self-exit
    const insertModeRoot = (component as any).buildInsertModeRootSubmenuConfig() as Record<string, unknown>;

    const moveLeft = insertModeRoot['h'] as LabeledAction;
    expect(moveLeft instanceof LabeledAction).toBeTrue();
    expect(moveLeft.actionLabel).toBe('Move Left');
    moveLeft.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.MOVE_CROSSHAIRS_LEFT});

    // vim profile: insert.node = 'd' (Box)
    const dropBox = insertModeRoot['d'] as LabeledAction;
    expect(dropBox instanceof LabeledAction).toBeTrue();
    expect(dropBox.actionLabel).toBe('+ Box');
    dropBox.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.CREATE_NEW_NODE, nodeShape: undefined});

    // 'f' (insertSubmenu in vim) becomes the exit toggle in this mode
    const exit = insertModeRoot['f'] as LabeledAction;
    expect(exit instanceof LabeledAction).toBeTrue();
    expect(exit.actionLabel).toBe('Exit Insert');
  });

  it('should build root bindings and hints from configurable key assignments', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;

    const customAssignments: KeymenuKeyAssignments = {
      ...IJKL_KEYMENU_KEY_ASSIGNMENTS,
      movement: {up: 'u', left: 'y', down: 'o', right: 'p'},
      drag: {up: 'u', left: 'y', down: 'o', right: 'p'},
      zoom: {out: 'i', in: 'j'},
      root: {
        ...IJKL_KEYMENU_KEY_ASSIGNMENTS.root,
        editSubmenu: 'j',
        insertSubmenu: 'k',
        selectDragSubmenu: 'l',
      },
      shared: {
        ...IJKL_KEYMENU_KEY_ASSIGNMENTS.shared,
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
