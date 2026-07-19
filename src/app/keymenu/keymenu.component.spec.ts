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

  it('should expose a one-shot root action for toggling keyboard visibility', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.visibilityToggle, 'emit');

    const toggleVisibility = buildRootConfig(component)['z'] as LabeledAction;

    expect(toggleVisibility instanceof LabeledAction).toBeTrue();
    expect(toggleVisibility.actionLabel).toBe('Hide Keyboard');
    expect(toggleVisibility.repeat).toBeFalse();

    toggleVisibility.action();
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('should restore a hidden keyboard from any keymenu mode', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.visibilityToggle, 'emit');
    component.visible = false;
    component.enterLabelEditMode();

    component.handleKeyDown(new KeyboardEvent('keydown', {key: 'z', code: 'KeyZ'}));
    component.handleKeyDown(new KeyboardEvent('keydown', {key: 'z', code: 'KeyZ', repeat: true}));

    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the active popup/grow controls while command handling is suspended', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const keyMenu = (component as any).keyMenu;

    component.setSuspended(true, 'grow-empty');
    expect(keyMenu.currentMode.name).toBe('surfaceGrowEmpty');
    expect(keyMenu.currentMode.stackTop.keys['f'].label).toBe('Choose Node Type');

    component.setSuspended(true, 'grow-type-popup');
    expect(keyMenu.currentMode.name).toBe('surfaceGrowTypePopup');
    expect(keyMenu.currentMode.stackTop.keys['j'].label).toBe('Next Type');

    component.setSuspended(true, 'grow-placement');
    expect(keyMenu.currentMode.name).toBe('surfaceGrowPlacement');
    expect(keyMenu.currentMode.stackTop.keys['h'].label).toBe('Place Left');

    component.setSuspended(false);
    expect(keyMenu.currentMode.name).toBe('normal');
  });

  it('restores a mode change requested while a popup surface owns input', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const keyMenu = (component as any).keyMenu;

    component.setSuspended(true, 'grow-type-popup');
    component.enterLabelEditMode();
    expect(keyMenu.currentMode.name).toBe('surfaceGrowTypePopup');

    component.setSuspended(false);
    expect(keyMenu.currentMode.name).toBe('labelEdit');
  });

  it('should have pan/zoom submenu on t with zoom inside, not at root level', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const rootConfig = buildRootConfig(component);
    const clearSelection = rootConfig['c'] as LabeledAction;

    // Zoom keys should NOT be at root level ('p' belongs to search Prev
    // Match, not Zoom Out; 'y' is the Status submenu)
    expect((rootConfig['p'] as LabeledAction).actionLabel).toBe('Prev Match');
    expect((rootConfig['y'] as LabeledSubmenuConfig).submenuLabel).toBe('Status...');

    expect(clearSelection.actionLabel).toBe('Clear Selection');
    // 2026-07-18 rebinds (final): Pan/Zoom back on r, Move by node → g, t unbound.
    const panZoomSubmenu = rootConfig['r'] as LabeledSubmenuConfig;
    expect(panZoomSubmenu instanceof LabeledSubmenuConfig).toBeTrue();
    expect((rootConfig['g'] as LabeledSubmenuConfig).submenuLabel).toBe('Move by node...');
    expect(rootConfig['t']).toBeUndefined();
    // Zoom should be inside the pan/zoom submenu, recenters on p/y/u
    const zoomIn = panZoomSubmenu.submenuConfig['i'] as LabeledAction;
    expect(zoomIn instanceof LabeledAction).toBeTrue();
    expect(zoomIn.actionLabel).toBe('Zoom In');
    expect((panZoomSubmenu.submenuConfig['p'] as LabeledAction).actionLabel).toBe('Recenter View');
    expect((panZoomSubmenu.submenuConfig['y'] as LabeledAction).actionLabel).toBe('Recenter Xhairs');
    expect((panZoomSubmenu.submenuConfig['u'] as LabeledAction).actionLabel).toBe('Center on Xhairs');

    // Misc submenu at 'm'
    const miscSubmenu = rootConfig['m'] as LabeledSubmenuConfig;
    expect(miscSubmenu instanceof LabeledSubmenuConfig).toBeTrue();

    // 'a' = add (held hub / tap quick-add); 'i' = insert text (tap) —
    // the a=add / i=insert model, 2026-07-19
    const editAction = rootConfig['a'] as LabeledSubmenuConfig;
    expect(editAction).toBeDefined();
    expect(editAction instanceof LabeledSubmenuConfig).toBeTrue();
    expect(editAction.submenuLabel).toBe('Add...');
    expect((rootConfig['i'] as LabeledAction).actionLabel).toBe('Edit Text');

    // 'h' is Move Left in vim profile
    const moveLeft = rootConfig['h'] as LabeledAction;
    expect(moveLeft).toBeDefined();
    expect(moveLeft.actionLabel).toBe('Move Left');

    clearSelection.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.UNSELECT_ALL});

    // 2026-07-18 rebinds: Move by node → g, Hide Keyboard → z, r unbound
    const moveByNodeSubmenu = rootConfig['g'] as LabeledSubmenuConfig;
    expect(moveByNodeSubmenu instanceof LabeledSubmenuConfig).toBeTrue();
    const nodeLeft = moveByNodeSubmenu.submenuConfig['h'] as LabeledAction;
    expect(nodeLeft.actionLabel).toBe('Node Left');
    expect((rootConfig['z'] as LabeledAction).actionLabel).toBe('Hide Keyboard');

    // Go at 'f': one-shot tap emitting the smart traverse (the nav popup
    // handles everything the old move-by-graph submenu did).
    const go = rootConfig['f'] as LabeledAction;
    expect(go instanceof LabeledAction).toBeTrue();
    expect(go.actionLabel).toBe('Go');
    expect(go.repeat).toBeFalse();
    go.action();
    // holdKey rides along so the popup can watch for the Go key's release.
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.TRAVERSE_SMART, holdKey: 'f'});
  });

  it('should build root bindings and hints from configurable key assignments', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;

    const customAssignments: KeymenuKeyAssignments = {
      ...IJKL_KEYMENU_KEY_ASSIGNMENTS,
      movement: {up: 'u', left: 'y', down: 'o', right: 'p'},
      drag: {up: 'u', left: 'y', down: 'o', right: 'p'},
      root: {
        ...IJKL_KEYMENU_KEY_ASSIGNMENTS.root,
        editSubmenu: 'j',
        selectDragSubmenu: 'l',
        toggleVisibility: 'q',
        // keep clear of the custom movement keys (y is Move Left here)
        statusSubmenu: 'z',
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
    expect(rootConfig['j'] instanceof LabeledSubmenuConfig).toBeTrue(); // Edit/insert hub (tap fires on keyup)
    expect(rootConfig['l'] instanceof LabeledActionSubmenuConfig).toBeTrue();
    expect((rootConfig['q'] as LabeledAction).actionLabel).toBe('Hide Keyboard');

    const hints = component.activeProfileHints;
    expect(hints[0].key).toBe('u/y/o/p');
  });

  describe('unified insert/connect hub (held i)', () => {
    function buildHub(component: KeymenuComponent): Record<string, any> {
      return (component as any).buildEditSubmenuConfig();
    }

    it('carries the left-hand kinds, edge/label/waypoint, and u/o connect submenus (vim)', () => {
      const fixture = TestBed.createComponent(KeymenuComponent);
      const hub = buildHub(fixture.componentInstance);
      expect((hub['d'] as LabeledAction).actionLabel).toBe('Box');
      expect((hub['c'] as LabeledAction).actionLabel).toBe('Circle');
      expect((hub['e'] as LabeledAction).actionLabel).toBe('Diamond');
      expect((hub['g'] as LabeledAction).actionLabel).toBe('Junction');
      expect((hub['x'] as LabeledAction).actionLabel).toBe('Invisible');
      expect(hub['s'] instanceof LabeledActionSubmenuConfig).toBeTrue(); // ...Edge
      expect((hub['f'] as LabeledAction).actionLabel).toBe('Add Label');
      expect((hub['w'] as LabeledAction).actionLabel).toBe('Add Waypoint');
      expect((hub['u'] as LabeledSubmenuConfig).submenuLabel).toBe('Connect →...');
      expect((hub['o'] as LabeledSubmenuConfig).submenuLabel).toBe('Connect ←...');
    });

    it('Box emits CREATE_NEW_NODE once per hold; labelEdit arms via node-inserted', () => {
      const fixture = TestBed.createComponent(KeymenuComponent);
      const component = fixture.componentInstance;
      const emitSpy = spyOn(component.keyMenuOut, 'emit');
      const hub = buildHub(component);

      (hub['d'] as LabeledAction).action();
      expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.CREATE_NEW_NODE, nodeShape: undefined});
      // arming is confirmation-driven: the drawing area answers node-inserted
      expect((component as any).insertViaEditActive).toBeFalse();
      component.notifyNodeInserted(true);
      expect((component as any).insertViaEditActive).toBeTrue();

      // A second fire (key repeat) must not create another node
      (hub['d'] as LabeledAction).action();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('a non-labelable insert (junction) does not arm the labelEdit transition', () => {
      const fixture = TestBed.createComponent(KeymenuComponent);
      const component = fixture.componentInstance;
      spyOn(component.keyMenuOut, 'emit');
      (buildHub(component)['g'] as LabeledAction).action();
      component.notifyNodeInserted(false);
      expect((component as any).insertViaEditActive).toBeFalse();
    });

    it('connect submenus emit CREATE_NEW_NODE_CONNECTED with their direction', () => {
      const fixture = TestBed.createComponent(KeymenuComponent);
      const component = fixture.componentInstance;
      const emitSpy = spyOn(component.keyMenuOut, 'emit');
      const hub = buildHub(component);

      const out = (hub['u'] as LabeledSubmenuConfig).submenuConfig;
      (out['c'] as LabeledAction).action();
      expect(emitSpy).toHaveBeenCalledWith(
        {kind: DACommandType.CREATE_NEW_NODE_CONNECTED, direction: 'out', nodeShape: 'circle'});
      // an anchorless attempt sends no confirmation, so nothing arms
      expect((component as any).insertViaEditActive).toBeFalse();
      component.notifyNodeInserted(true);
      expect((component as any).insertViaEditActive).toBeTrue();

      (component as any).editContextActionFired = false;
      const inn = (hub['o'] as LabeledSubmenuConfig).submenuConfig;
      (inn['d'] as LabeledAction).action();
      expect(emitSpy).toHaveBeenCalledWith(
        {kind: DACommandType.CREATE_NEW_NODE_CONNECTED, direction: 'in', nodeShape: undefined});
    });
  });
});

function buildRootConfig(component: KeymenuComponent): Record<string, unknown> {
  return (component as any).buildRootSubmenuConfig() as Record<string, unknown>;
}
