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

  it('uses a 250 ms pause and 100 ms target cadence for normal movement', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;

    const rootConfig = buildRootConfig(component);

    expect(rootConfig['_repeatConfig']).toEqual({
      initialDelayMs: 250,
      intervalMs: 100,
    });
  });

  it('binds vim-normal e to move to the word end', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');
    const config = (component as any).buildLabelEditVimNormalSubmenuConfig(false) as Record<string, unknown>;
    const wordEnd = config['e'] as LabeledAction;

    expect(wordEnd.actionLabel).toBe('word end');
    wordEnd.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.CURSOR_WORD_END});
  });

  it('enters visual mode with v and exposes selection motions', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const modeSpy = spyOn(component.labelEditModeOut, 'emit');
    const emitSpy = spyOn(component.keyMenuOut, 'emit');
    const normal = (component as any).buildLabelEditVimNormalSubmenuConfig(false) as Record<string, unknown>;

    (normal['v'] as LabeledAction).action();
    expect(modeSpy).toHaveBeenCalledWith('vimVisual');

    const visual = (component as any).buildLabelEditVimVisualSubmenuConfig(false) as Record<string, unknown>;
    expect((visual['h'] as LabeledAction).actionLabel).toBe('← extend');
    (visual['h'] as LabeledAction).action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.CURSOR_LEFT});
    (visual['x'] as LabeledAction).action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.DELETE_CHAR_AT_CURSOR});
    expect(modeSpy).toHaveBeenCalledWith('vimNormal');
  });

  it('implements visual iw as a sequential inner-word text object', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');
    component.switchMode('labelEditVimVisual');
    const visual = (component as any)
      .buildLabelEditVimVisualSubmenuConfig(false) as Record<string, unknown>;

    expect((visual['i'] as LabeledAction).actionLabel).toBe('inner…');
    (visual['i'] as LabeledAction).action();
    component.handleKeyDown(new KeyboardEvent('keydown', {key: 'w', code: 'KeyW'}));

    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.SELECT_INNER_WORD});
    expect((component as any).vimTextObjectPending).toBeFalse();
  });

  it('implements sequential Vim r replacement', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');
    component.switchMode('labelEditVimNormal');
    const normal = (component as any).buildLabelEditVimNormalSubmenuConfig(false) as Record<string, unknown>;

    (normal['r'] as LabeledAction).action();
    component.handleKeyDown(new KeyboardEvent('keydown', {key: 'Z', code: 'KeyZ'}));

    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.REPLACE_CHAR_AT_CURSOR, value: 'Z'});
    expect((component as any).vimReplacePending).toBeFalse();
  });

  it('implements the Vim c operator and enters insert mode after its motion', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');
    const modeSpy = spyOn(component.labelEditModeOut, 'emit');
    component.switchMode('labelEditVimNormal');
    const normal = (component as any).buildLabelEditVimNormalSubmenuConfig(false) as Record<string, unknown>;

    (normal['c'] as LabeledAction).action();
    component.handleKeyDown(new KeyboardEvent('keydown', {key: 'w', code: 'KeyW'}));

    expect(emitSpy).toHaveBeenCalledWith({
      kind: DACommandType.CHANGE_TEXT_AT_CURSOR,
      motion: 'word-forward',
    });
    expect(modeSpy).toHaveBeenCalledWith('insert');
    expect((component as any).vimChangePending).toBeFalse();
  });

  it('changes a Vim visual selection and enters insert mode', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');
    const modeSpy = spyOn(component.labelEditModeOut, 'emit');
    const visual = (component as any).buildLabelEditVimVisualSubmenuConfig(false) as Record<string, unknown>;

    (visual['c'] as LabeledAction).action();

    expect(emitSpy).toHaveBeenCalledWith({
      kind: DACommandType.CHANGE_TEXT_AT_CURSOR,
      motion: 'selection',
    });
    expect(modeSpy).toHaveBeenCalledWith('insert');
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

    component.setSuspended(true, 'grow-targeting');
    expect(keyMenu.currentMode.name).toBe('surfaceGrowTargeting');
    expect(keyMenu.currentMode.stackTop.keys['s'].label).toBe('Edge...');

    component.setSuspended(true, 'grow-edge');
    expect(keyMenu.currentMode.name).toBe('surfaceGrowEdge');
    expect(keyMenu.currentMode.stackTop.keys['l'].label).toBe('Self Loop');

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

  it('enters existing-text editing in Vim normal while preserving caps state', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const keyMenu = (component as any).keyMenu;

    component.enterLabelEditMode('vimNormal');
    expect(keyMenu.currentMode.name).toBe('labelEditVimNormal');

    component.switchMode('normalCaps');
    component.enterLabelEditMode('vimNormal');
    expect(keyMenu.currentMode.name).toBe('labelEditVimNormalCaps');
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

    // 2026-07-18 rebinds: Move by node → g, Hide Keyboard → z, r unbound.
    // 2026-07-21: default jump steps between nodes + labels ("Stop Left"),
    // with coarse (nodes only) / fine (+waypoints) tier sub-submenus. The
    // submenu is hold-aware (shows the grid overlay) — LabeledActionSubmenuConfig.
    const moveByNodeSubmenu = rootConfig['g'] as LabeledActionSubmenuConfig;
    expect(moveByNodeSubmenu instanceof LabeledActionSubmenuConfig).toBeTrue();
    moveByNodeSubmenu.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.SHOW_NODE_GRID, targets: 'labels'});
    const stopLeft = moveByNodeSubmenu.submenuConfig['h'] as LabeledAction;
    expect(stopLeft.actionLabel).toBe('Stop Left');
    // 2026-07-22: the known-good adaptive grid is an explicit strategy on g→e,
    // ready to remain available alongside later navigation experiments.
    const adaptiveGrid = moveByNodeSubmenu.submenuConfig['e'] as LabeledAction;
    expect(adaptiveGrid.actionLabel).toBe('Use adaptive band grid');
    expect(adaptiveGrid.repeat).toBeFalse();
    adaptiveGrid.action();
    expect(emitSpy).toHaveBeenCalledWith({
      kind: DACommandType.SET_GRAPH_ITEM_NAVIGATION_STRATEGY,
      strategy: 'adaptive-band-grid',
    });
    const quadrantGrid = moveByNodeSubmenu.submenuConfig['o'] as LabeledAction;
    expect(quadrantGrid.actionLabel).toBe('Use adaptive quadrant grid');
    quadrantGrid.action();
    expect(emitSpy).toHaveBeenCalledWith({
      kind: DACommandType.SET_GRAPH_ITEM_NAVIGATION_STRATEGY,
      strategy: 'adaptive-quadrant-grid',
    });
    const quadrantRings = moveByNodeSubmenu.submenuConfig['r'] as LabeledAction;
    expect(quadrantRings.actionLabel).toBe('Use adaptive quadrant rings');
    expect(quadrantRings.repeat).toBeFalse();
    quadrantRings.action();
    expect(emitSpy).toHaveBeenCalledWith({
      kind: DACommandType.SET_GRAPH_ITEM_NAVIGATION_STRATEGY,
      strategy: 'adaptive-quadrant-rings',
    });
    const goalSouth = moveByNodeSubmenu.submenuConfig['n'] as LabeledAction;
    const goalNorth = moveByNodeSubmenu.submenuConfig['p'] as LabeledAction;
    expect(goalSouth.actionLabel).toBe('Goal ray south');
    expect(goalNorth.actionLabel).toBe('Goal ray north');
    goalSouth.action();
    goalNorth.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.ADJUST_GRAPH_ITEM_GOAL_SOUTH, targets: 'labels'});
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.ADJUST_GRAPH_ITEM_GOAL_NORTH, targets: 'labels'});
    // coarse (moveSpeed.bigger = 's') = nodes only
    const coarse = moveByNodeSubmenu.submenuConfig['s'] as LabeledActionSubmenuConfig;
    expect(coarse instanceof LabeledActionSubmenuConfig).toBeTrue();
    coarse.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.SHOW_NODE_GRID, targets: 'nodes'});
    expect((coarse.submenuConfig['h'] as LabeledAction).actionLabel).toBe('Node Left');
    expect((rootConfig['z'] as LabeledAction).actionLabel).toBe('Hide Keyboard');

    // Move by Link at 'f': held NSEW edge navigator, with no popup.
    const go = rootConfig['f'] as LabeledActionSubmenuConfig;
    expect(go instanceof LabeledActionSubmenuConfig).toBeTrue();
    expect(go.submenuLabel).toBe('Move by Link...');
    go.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.ENTER_LINK_NAV});
    (go.submenuConfig['h'] as LabeledAction).action();
    (go.submenuConfig['j'] as LabeledAction).action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.MOVE_LINK_LEFT});
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.MOVE_LINK_DOWN});
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

  describe('add hub (held a)', () => {
    function buildHub(component: KeymenuComponent): Record<string, any> {
      return (component as any).buildEditSubmenuConfig();
    }

    it('carries node kinds, an Edge submenu, and label/waypoint (vim)', () => {
      const fixture = TestBed.createComponent(KeymenuComponent);
      const component = fixture.componentInstance;
      const emitSpy = spyOn(component.keyMenuOut, 'emit');
      const hub = buildHub(component);
      expect((hub['d'] as LabeledAction).actionLabel).toBe('Box');
      expect((hub['c'] as LabeledAction).actionLabel).toBe('Circle');
      expect((hub['e'] as LabeledAction).actionLabel).toBe('Diamond');
      expect((hub['g'] as LabeledAction).actionLabel).toBe('Junction');
      expect((hub['x'] as LabeledAction).actionLabel).toBe('Invisible');
      expect((hub['f'] as LabeledAction).actionLabel).toBe('Add Label');
      expect((hub['w'] as LabeledAction).actionLabel).toBe('Add Waypoint');
      const edge = hub['s'] as LabeledSubmenuConfig;
      expect(edge.submenuLabel).toBe('Edge...');
      const selfLoop = edge.submenuConfig['l'] as LabeledAction;
      expect(selfLoop.actionLabel).toBe('Self Loop');
      selfLoop.action();
      expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.ADD_SELF_EDGE});
      // The old directional picker and u/o connect modifiers remain retired;
      // grow mode handles ordinary node-to-node edges.
      expect(hub['u']).toBeUndefined();
      expect(hub['o']).toBeUndefined();
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

    it('focuses the inserted node before labelEdit when the held add key is released', () => {
      const fixture = TestBed.createComponent(KeymenuComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const emitSpy = spyOn(component.keyMenuOut, 'emit');
      component.notifyNodeInserted(true);

      component.handleKeyUp(new KeyboardEvent('keyup', {
        key: 'a',
        code: 'KeyA',
      }));

      expect(emitSpy).toHaveBeenCalledWith({
        kind: DACommandType.BEGIN_NEW_NODE_LABEL_EDIT,
      });
      expect((component as any).insertViaEditActive).toBeFalse();
    });

  });
});

function buildRootConfig(component: KeymenuComponent): Record<string, unknown> {
  return (component as any).buildRootSubmenuConfig() as Record<string, unknown>;
}
