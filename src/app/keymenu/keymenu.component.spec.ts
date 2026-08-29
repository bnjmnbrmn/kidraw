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
import {VisualConfigService} from '../services/visual-config.service';

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
    expect(toggleVisibility.actionLabel).toBe('Cycle Menu View');
    expect(toggleVisibility.repeat).toBeFalse();

    toggleVisibility.action();
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the configured repeat timing for normal movement', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const visualConfig = TestBed.inject(VisualConfigService);
    const previous = {...visualConfig.config.cursor};

    visualConfig.updateConfig({cursor: {
      ...visualConfig.config.cursor,
      initialRepeatDelayMs: 620,
      repeatIntervalMs: 170,
    }});

    const rootConfig = buildRootConfig(component);

    expect(rootConfig['_repeatConfig']).toEqual({
      initialDelayMs: 620,
      intervalMs: 170,
    });

    visualConfig.updateConfig({cursor: previous});
  });

  it('keeps edit mode and applies new repeat timing when Settings changes', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const visualConfig = TestBed.inject(VisualConfigService);
    const previous = {...visualConfig.config.cursor};

    component.enterLabelEditMode('vimNormal');
    visualConfig.updateConfig({cursor: {
      ...visualConfig.config.cursor,
      labelEditInitialDelayMs: 750,
      labelEditIntervalMs: 180,
    }});

    const keyMenu = (component as any).keyMenu;
    expect(keyMenu.currentMode.name).toBe('labelEditVimNormal');
    const mode = keyMenu.currentMode as any;
    expect(mode.stack[0].config._repeatConfig).toEqual({
      initialDelayMs: 750,
      intervalMs: 180,
    });

    visualConfig.updateConfig({cursor: previous});
  });

  it('uses the Settings delays and intervals in the live repeat timers', () => {
    jasmine.clock().install();
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const visualConfig = TestBed.inject(VisualConfigService);
    const previous = {...visualConfig.config.cursor};
    const emitSpy = spyOn(component.keyMenuOut, 'emit');
    try {
      fixture.detectChanges();
      visualConfig.updateConfig({cursor: {
        ...visualConfig.config.cursor,
        initialRepeatDelayMs: 600,
        repeatIntervalMs: 200,
        labelEditInitialDelayMs: 700,
        labelEditIntervalMs: 150,
      }});

      const movementKey = component.keyAssignments.movement.left;
      component.handleKeyDown(new KeyboardEvent('keydown', {key: movementKey}));
      expect(emitSpy.calls.allArgs().filter(([command]) =>
        command?.kind === DACommandType.MOVE_CROSSHAIRS_LEFT).length).toBe(1);
      jasmine.clock().tick(599);
      expect(emitSpy.calls.allArgs().filter(([command]) =>
        command?.kind === DACommandType.MOVE_CROSSHAIRS_LEFT).length).toBe(1);
      jasmine.clock().tick(1);
      expect(emitSpy.calls.allArgs().filter(([command]) =>
        command?.kind === DACommandType.MOVE_CROSSHAIRS_LEFT).length).toBe(2);
      jasmine.clock().tick(200);
      expect(emitSpy.calls.allArgs().filter(([command]) =>
        command?.kind === DACommandType.MOVE_CROSSHAIRS_LEFT).length).toBe(3);
      component.handleKeyUp(new KeyboardEvent('keyup', {key: movementKey}));

      component.enterLabelEditMode('insert');
      component.handleKeyDown(new KeyboardEvent('keydown', {key: 'q'}));
      expect(emitSpy.calls.allArgs().filter(([command]) =>
        command?.kind === DACommandType.INSERT_CHAR && command.value === 'q').length).toBe(1);
      jasmine.clock().tick(699);
      expect(emitSpy.calls.allArgs().filter(([command]) =>
        command?.kind === DACommandType.INSERT_CHAR && command.value === 'q').length).toBe(1);
      jasmine.clock().tick(1);
      expect(emitSpy.calls.allArgs().filter(([command]) =>
        command?.kind === DACommandType.INSERT_CHAR && command.value === 'q').length).toBe(2);
      jasmine.clock().tick(150);
      expect(emitSpy.calls.allArgs().filter(([command]) =>
        command?.kind === DACommandType.INSERT_CHAR && command.value === 'q').length).toBe(3);
      component.handleKeyUp(new KeyboardEvent('keyup', {key: 'q'}));
    } finally {
      visualConfig.updateConfig({cursor: previous});
      fixture.destroy();
      jasmine.clock().uninstall();
    }
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

  it('should restore a hidden keyboard from any command mode', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.visibilityToggle, 'emit');
    component.visible = false;
    component.enterLabelEditMode('vimNormal');

    component.handleKeyDown(new KeyboardEvent('keydown', {key: 'z', code: 'KeyZ'}));
    component.handleKeyDown(new KeyboardEvent('keydown', {key: 'z', code: 'KeyZ', repeat: true}));

    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves the toggle key to the label while free-typing', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.visibilityToggle, 'emit');
    component.visible = false;
    component.enterLabelEditMode('insert');

    component.handleKeyDown(new KeyboardEvent('keydown', {key: 'z', code: 'KeyZ'}));

    // Otherwise a label could never contain the letter; Escape first, then
    // the toggle key works again from the vim label mode.
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('shows the active popup/grow controls while command handling is suspended', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const keyMenu = (component as any).keyMenu;

    component.setSuspended(true, 'grow-empty');
    expect(keyMenu.currentMode.name).toBe('surfaceGrowEmpty');
    expect(keyMenu.currentMode.stackTop.keys['f'].label).toBe('Choose Node Type');
    expect(keyMenu.currentMode.stackTop.keys['s'].label).toBe('Edge... (selected node)');

    component.setSuspended(true, 'grow-targeting');
    expect(keyMenu.currentMode.name).toBe('surfaceGrowTargeting');
    expect(keyMenu.currentMode.stackTop.keys['s'].label).toBe('Edge...');
    expect(keyMenu.currentMode.stackTop.keys['l'].label)
      .toContain('nodes + ghosts');
    expect(keyMenu.currentMode.stackTop.keys['a'].label)
      .toContain('Self Loop');

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

  it('should tier root movement when the action fires, not when it is bound', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const moveLeft = buildRootConfig(component)['h'] as LabeledAction;
    moveLeft.action();
    expect(emitSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({gridTier: 'normal'}) as any);

    // With the coarse speed key on the held stack, the SAME bound action
    // must now emit coarse — that is what lets a speed key tapped mid-move
    // re-tier the running repeat (da-182).
    spyOn(component as any, 'heldTierFor').and.returnValue('coarse');
    emitSpy.calls.reset();
    moveLeft.action();
    expect(emitSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({gridTier: 'coarse'}) as any);
  });

  it('should put copy/cut/paste under the held y key on distinct keys', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;

    const clipboard = buildRootConfig(component)['y'] as LabeledSubmenuConfig;
    expect(clipboard.submenuLabel).toBe('Copy/Paste...');

    const labels = ['Copy', 'Cut', 'Paste'].map(label =>
      Object.entries(clipboard.submenuConfig).find(
        ([, v]) => v instanceof LabeledAction && v.actionLabel === label)?.[0]);
    expect(labels.every(key => key !== undefined)).toBeTrue();
    // A child sharing the hub's own key could never be chorded: holding y
    // already has that physical key down, so its tap is swallowed.
    expect(labels).not.toContain('y');
    expect(new Set(labels).size).toBe(3);
  });

  it('should have pan/zoom submenu on t with zoom inside, not at root level', () => {
    const fixture = TestBed.createComponent(KeymenuComponent);
    const component = fixture.componentInstance;
    const emitSpy = spyOn(component.keyMenuOut, 'emit');

    const rootConfig = buildRootConfig(component);
    const clearSelection = rootConfig['c'] as LabeledAction;

    // Zoom keys should NOT be at root level ('p' belongs to search Prev
    // Match, not Zoom Out; 'y' is Copy/Paste — vim's yank key.)
    // Since da-265, p is Paste (vim) and Prev Match is Shift+n, intercepted
    // in handleKeyDown rather than bound here.
    expect((rootConfig['p'] as LabeledAction).actionLabel).toBe('Paste');
    expect((rootConfig['y'] as LabeledSubmenuConfig).submenuLabel).toBe('Copy/Paste...');
    // Status left the menu with da-438: it is a todo-graph concept, so it
    // comes back when that identity is a plugin. `t` is free again.
    expect(rootConfig['t']).toBeUndefined();

    expect(clearSelection.actionLabel).toBe('Clear Selection');
    // 2026-07-18 rebinds (final): Pan/Zoom back on r, Move by node → g.
    // Since da-257 it is an action-submenu: holding it also un-fades the
    // crosshairs, so the hold has a side effect as well as children.
    const panZoomSubmenu = rootConfig['r'] as LabeledActionSubmenuConfig;
    expect(panZoomSubmenu instanceof LabeledActionSubmenuConfig).toBeTrue();
    panZoomSubmenu.action();
    expect(emitSpy).toHaveBeenCalledWith({kind: DACommandType.SHOW_CROSSHAIRS});
    expect((rootConfig['g'] as LabeledSubmenuConfig).submenuLabel).toBe('Move by node...');
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

    // 'a' = add (held hub / contextual tap); 'i' = insert text (tap) —
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
    // 2026-08-15: z now cycles keyboard → compact tree → hidden (da-200).
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
    expect((rootConfig['z'] as LabeledAction).actionLabel).toBe('Cycle Menu View');

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
    expect((rootConfig['q'] as LabeledAction).actionLabel).toBe('Cycle Menu View');

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
