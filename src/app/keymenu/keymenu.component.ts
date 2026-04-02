import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import {Subscription} from 'rxjs';
import {DACommand, DACommandType, LayoutType, NodeShape, TextOverflowMode} from '../drawing-area/command.model';
import {KeyMenu} from '../lib/keymenu/keyMenu';
import {USQwertyMode, USQwertyModeConfig} from '../lib/keymenu/modes/us-qwerty';
import {LabeledSubmenuConfig} from '../lib/keymenu/keys/labeledSubmenuConfig';
import {LabeledAction} from '../lib/keymenu/keys/labeledAction';
import {
  LabeledActionSubmenuConfig,
  SubmenuConfig,
} from '../lib/keymenu/layouts/us-qwerty/submenuConfig';
import {KeyString} from '../lib/keymenu/layouts/us-qwerty';
import {
  DEFAULT_KEYMENU_KEY_ASSIGNMENTS,
  DirectionalKeyAssignments,
  KeymenuKeyAssignments,
  VIM_KEYMENU_KEY_ASSIGNMENTS,
} from './config/key-assignments';
import {DebugLogService} from '../services/debug-log.service';
import {ThemeService} from '../services/theme.service';
import {KeyboardConfigService} from '../services/keyboard-config.service';
import {VisualConfigService} from '../services/visual-config.service';

import {DoublePressTracker} from '../lib/keymenu/help/doublePressTracker';

interface ProfileHint {
  readonly key: string;
  readonly action: string;
}

@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() movementSpeed = 20;
  @Input() canEdit = false;
  @Input() keyAssignments: KeymenuKeyAssignments = VIM_KEYMENU_KEY_ASSIGNMENTS;
  @Output() keyMenuOut = new EventEmitter<DACommand>();

  private keyMenu!: KeyMenu<DACommand>;
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private log = inject(DebugLogService);
  private themeService = inject(ThemeService);
  private keyboardConfig = inject(KeyboardConfigService);
  private visualConfig = inject(VisualConfigService);
  private themeSub?: Subscription;
  private configSub?: Subscription;
  private visualSub?: Subscription;

  // State: when true, releasing the insert submenu key switches to labelEdit
  private insertDragActive = false;
  // Pending-action-on-release: set when a node type key is pressed, cleared by directional action or type key release
  private insertNodePending = false;
  // When true, releasing the edit submenu key without selecting a child fires EDIT_SELECTED
  private editPending = false;
  private pendingNodeShape: NodeShape | undefined = undefined;
  private pendingInsertTypeKey: string | undefined = undefined;
  private selectDragHoldActive = false;
  private directedEdgeActive = false;
  private lastShiftPressedAt = 0;

  private readonly DOUBLE_SHIFT_INTERVAL_MS = 325;

  // Help mode state
  private helpModeState: 'inactive' | 'held' | 'sticky' = 'inactive';
  private spacebarDoublePress = new DoublePressTracker(325);
  private spacebarHoldTimer?: number;
  private readonly SPACEBAR_HOLD_THRESHOLD_MS = 300;

  /** Normalize event.key so CapsLock uppercase letters match lowercase key assignments. */
  private static normalizeEventKey(event: KeyboardEvent): string {
    const k = event.key;
    if (k.length === 1 && k >= 'A' && k <= 'Z') return k.toLowerCase();
    return k;
  }

  readonly MIN_STEERING_SPEED = 20;
  readonly MAX_STEERING_SPEED = 200;
  activeKeyPath: string[] = [];

  private get dragSubmenuConfig(): SubmenuConfig {
    const drag = this.keyAssignments.drag;
    const pz = this.keyAssignments.panZoom;

    return {
      [drag.up]: new LabeledAction('Drag Up', () => {
        this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_UP});
      }),
      [drag.left]: new LabeledAction('Drag Left', () => {
        this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_LEFT});
      }),
      [drag.down]: new LabeledAction('Drag Down', () => {
        this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_DOWN});
      }),
      [drag.right]: new LabeledAction('Drag Right', () => {
        this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_RIGHT});
      }),
      [pz.zoomIn]: new LabeledAction('Zoom In', () => {
        this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
      }),
      [pz.zoomOut]: new LabeledAction('Zoom Out', () => {
        this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
      }),
    } as SubmenuConfig;
  }

  get activeProfileHints(): readonly ProfileHint[] {
    const movementKeys = this.getDirectionalKeyHint(this.keyAssignments.movement);
    const root = this.keyAssignments.root;
    const shared = this.keyAssignments.shared;

    return [
      {key: movementKeys, action: 'Move up/left/down/right'},
      {key: root.insertSubmenu, action: 'Insert submenu'},
      {key: `${root.selectDragSubmenu} (hold)`, action: 'Select + drag'},
      {key: this.keyAssignments.moveSpeed.bigger, action: 'Bigger move'},
      {key: this.keyAssignments.panZoom.submenu, action: 'Pan/Zoom'},
      {key: this.keyAssignments.moveByNode.submenu, action: 'Move by node'},
      {key: this.keyAssignments.moveByGraph.submenu, action: 'Move by graph'},
      {key: shared.select, action: 'Clear selection'},
      {key: shared.delete, action: 'Delete'},
    ];
  }

  private getDirectionalKeyHint(bindings: DirectionalKeyAssignments): string {
    return `${bindings.up}/${bindings.left}/${bindings.down}/${bindings.right}`;
  }

  private getPairKeyHint(first: KeyString, second: KeyString): string {
    return `${first}/${second}`;
  }

  get movementSpeedDialPercent(): number {
    const range = this.MAX_STEERING_SPEED - this.MIN_STEERING_SPEED;
    if (range <= 0) {
      return 0;
    }

    const normalized = (this.movementSpeed - this.MIN_STEERING_SPEED) / range;
    return Math.max(0, Math.min(1, normalized));
  }

  ngAfterViewInit(): void {
    this.rebuildKeyMenu();
    this.themeSub = this.themeService.themeChanged$.subscribe(() => {
      this.rebuildKeyMenu();
    });
    this.configSub = this.keyboardConfig.configChanged$.subscribe(() => {
      this.rebuildKeyMenu();
    });
    this.visualSub = this.visualConfig.configChanged$.subscribe(() => {
      this.rebuildKeyMenu();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['keyAssignments'] && this.keyMenu) {
      this.rebuildKeyMenu();
    }
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.configSub?.unsubscribe();
    this.visualSub?.unsubscribe();
    if (this.keyMenu) {
      this.keyMenu.destroy();
    }
  }

  private rebuildKeyMenu() {
    if (this.keyMenu) {
      this.keyMenu.destroy();
    }

    this.resetInteractionState();
    this.helpModeState = 'inactive';
    this.clearSpacebarHoldTimer();
    this.spacebarDoublePress.reset();
    this.keyMenu = new KeyMenu<DACommand>({
      containerId: 'keyMenu',
      containingHTMLElement: this.componentNE,
      initialModeName: 'normal',
      stageBackground: this.visualConfig.getEffectivePalette(this.themeService.theme).keymenuStageBackground,
      modes: {
        normal: new USQwertyModeConfig(this.buildRootSubmenuConfig(), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        normalCaps: new USQwertyModeConfig(this.buildNormalCapsSubmenuConfig(), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        labelEdit: new USQwertyModeConfig(this.buildLabelEditSubmenuConfig(false), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        labelEditCaps: new USQwertyModeConfig(this.buildLabelEditSubmenuConfig(true), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
      },
      onModeSwitch: () => this.refreshActiveKeyPath(),
    });
    this.refreshActiveKeyPath();
  }


  private static readonly SHIFTED_NUMBERS: Record<string, string> = {
    '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
    '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
  };

  private static readonly SHIFTED_PUNCT: Record<string, string> = {
    '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|',
    ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '`': '~',
  };

  private buildLabelEditSubmenuConfig(capsMode: boolean): SubmenuConfig {
    const insertChar = (ch: string) => new LabeledAction(ch, () =>
      this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: ch}));
    const cursor = this.visualConfig.config.cursor;

    const config: SubmenuConfig = {
      _repeatConfig: { initialDelayMs: cursor.labelEditInitialDelayMs, intervalMs: cursor.labelEditIntervalMs },
    } as SubmenuConfig;

    // Letter keys
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      const ch = capsMode ? letter.toUpperCase() : letter;
      (config as any)[letter] = insertChar(ch);
    }

    // Number keys
    for (const digit of '1234567890') {
      (config as any)[digit] = insertChar(digit);
    }

    // Punctuation keys
    for (const ch of [';', "'", ',', '.', '/', '[', ']', '\\', '`', '-', '=']) {
      (config as any)[ch] = insertChar(ch);
    }

    // Special keys
    (config as any)['Backspace'] = new LabeledAction('Delete', () =>
      this.keyMenuOut.emit({kind: DACommandType.DELETE_LAST_CHAR}));
    (config as any)['Enter'] = new LabeledAction('Newline', () =>
      this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: '\n'}));
    (config as any)['Tab'] = new LabeledAction('Tab', () =>
      this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: '\t'}));
    (config as any)[' '] = new LabeledAction('Space', () =>
      this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: ' '}));

    // Shift submenu for shifted characters
    (config as any)['Shift'] = new LabeledSubmenuConfig('Shift...', this.buildShiftSubmenuConfig(capsMode));
    (config as any)['RShift'] = new LabeledSubmenuConfig('Shift...', this.buildShiftSubmenuConfig(capsMode));

    // CapsLock toggles uppercase/lowercase mode
    // With capsLockCtrlSwap: physical CapsLock sends 'Control', physical Ctrl sends 'CapsLock'
    // Bind based on physical position so CapsLock always toggles caps
    const capsLabel = capsMode ? 'lowercase' : 'UPPERCASE';
    const capsTarget = capsMode ? 'labelEdit' : 'labelEditCaps';
    const capsKey = this.keyboardConfig.capsLockCtrlSwap ? 'Control' : 'CapsLock';
    const ctrlKey = this.keyboardConfig.capsLockCtrlSwap ? 'CapsLock' : 'Control';
    (config as any)[capsKey] = new LabeledAction(capsLabel, () => {
      this.switchMode(capsTarget);
    });
    (config as any)[ctrlKey] = new LabeledSubmenuConfig('More Ctrl', this.buildCtrlSubmenuConfig());
    // Right Control always opens Ctrl submenu regardless of swap setting
    (config as any)['RControl'] = new LabeledSubmenuConfig('More Ctrl', this.buildCtrlSubmenuConfig());

    return config;
  }

  private buildShiftSubmenuConfig(capsMode: boolean): SubmenuConfig {
    const insertChar = (ch: string) => new LabeledAction(ch, () =>
      this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: ch}));
    const cursor = this.visualConfig.config.cursor;

    const config: SubmenuConfig = {
      _repeatConfig: { initialDelayMs: cursor.labelEditInitialDelayMs, intervalMs: cursor.labelEditIntervalMs },
    } as SubmenuConfig;

    // Shifted letters (opposite of current caps mode)
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      const ch = capsMode ? letter.toLowerCase() : letter.toUpperCase();
      (config as any)[letter] = insertChar(ch);
    }

    // Shifted numbers
    for (const [key, val] of Object.entries(KeymenuComponent.SHIFTED_NUMBERS)) {
      (config as any)[key] = insertChar(val);
    }

    // Shifted punctuation
    for (const [key, val] of Object.entries(KeymenuComponent.SHIFTED_PUNCT)) {
      (config as any)[key] = insertChar(val);
    }

    // Special keys still work in shift submenu
    (config as any)['Backspace'] = new LabeledAction('Delete', () =>
      this.keyMenuOut.emit({kind: DACommandType.DELETE_LAST_CHAR}));
    (config as any)['Tab'] = new LabeledAction('Tab', () =>
      this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: '\t'}));
    (config as any)[' '] = new LabeledAction('Space', () =>
      this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: ' '}));
    // Shift+Enter handled by component interceptor as exit — don't bind Enter here

    return config;
  }

  private resetInteractionState(): void {
    this.insertDragActive = false;
    this.insertNodePending = false;
    this.editPending = false;
    this.pendingNodeShape = undefined;
    this.pendingInsertTypeKey = undefined;
    this.selectDragHoldActive = false;
  }

  private buildRootSubmenuConfig(): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const root = this.keyAssignments.root;

    return {
      [movement.up]: new LabeledAction('Move Up', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP})),
      [movement.left]: new LabeledAction('Move Left', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT})),
      [movement.down]: new LabeledAction('Move Down', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN})),
      [movement.right]: new LabeledAction('Move Right', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT})),

      [root.editSubmenu]: new LabeledSubmenuConfig('Edit...', this.buildEditSubmenuConfig()),
      [root.insertSubmenu]: new LabeledSubmenuConfig('Insert...', this.buildInsertSubmenuConfig()),
      [root.selectDragSubmenu]: this.buildSelectDragSubmenuRootAction(),
      [root.nodeTypeSubmenu]: new LabeledSubmenuConfig('Shape...', this.buildNodeTypeShapeSubmenuConfig()),
      ...this.buildSharedUtilityBindings(),
    } as SubmenuConfig;
  }

  private buildNormalCapsSubmenuConfig(): SubmenuConfig {
    // CapsLock normal mode: nothing works except CapsLock to return to normal mode.
    // With capsLockCtrlSwap: physical CapsLock sends 'Control', physical Ctrl sends 'CapsLock'
    const capsKey = this.keyboardConfig.capsLockCtrlSwap ? 'Control' : 'CapsLock';
    return {
      [capsKey]: new LabeledAction('normal mode', () => {
        this.switchMode('normal');
      }),
    } as SubmenuConfig;
  }


  private buildEditSubmenuConfig(): SubmenuConfig {
    const edit = this.keyAssignments.edit;
    return {
      [edit.overflowSubmenu]: new LabeledSubmenuConfig('Overflow...', this.buildOverflowModeSubmenuConfig()),
      [edit.layoutSubmenu]: new LabeledSubmenuConfig('Layout...', this.buildLayoutSubmenuConfig()),
      [edit.togglePin]: new LabeledAction('Toggle Pin', () => this.keyMenuOut.emit({kind: DACommandType.TOGGLE_PIN_SELECTED})),
    } as SubmenuConfig;
  }

  private buildOverflowModeSubmenuConfig(): SubmenuConfig {
    const overflow = this.keyAssignments.overflow;
    const emit = (mode: TextOverflowMode) => () => this.keyMenuOut.emit({kind: DACommandType.SET_TEXT_OVERFLOW_MODE, mode});
    return {
      [overflow.clip]:       new LabeledAction('No Overflow',  emit('clip')),
      [overflow.shrinkFont]: new LabeledAction('Shrink Font',  emit('shrink-font')),
      [overflow.ellipsis]:   new LabeledAction('Ellipsis',     emit('ellipsis')),
      [overflow.widenH]:     new LabeledAction('Widen →',      emit('widen-h')),
      [overflow.widenV]:     new LabeledAction('Widen ↓',      emit('widen-v')),
      [overflow.widenBoth]:  new LabeledAction('Auto Size',    emit('widen-both')),
    } as SubmenuConfig;
  }

  private buildLayoutSubmenuConfig(): SubmenuConfig {
    const layout = this.keyAssignments.layout;
    const emit = (l: LayoutType) => () => this.keyMenuOut.emit({kind: DACommandType.APPLY_LAYOUT, layout: l});
    return {
      [layout.forceDirected]: new LabeledAction('Force Layout', emit('force-directed')),
      [layout.treeDown]:      new LabeledAction('Tree Down',    emit('tree-down')),
      [layout.treeRight]:     new LabeledAction('Tree Right',   emit('tree-right')),
      [layout.grid]:          new LabeledAction('Grid',         emit('grid')),
    } as SubmenuConfig;
  }

  private buildInsertSubmenuConfig(): SubmenuConfig {
    const insert = this.keyAssignments.insert;

    return {
      [insert.node]: new LabeledActionSubmenuConfig('Node', this.buildDirectionalInsertSubmenuConfig(), () => {
        if (this.insertDragActive) return;
        this.pendingNodeShape = undefined;
        this.pendingInsertTypeKey = insert.node;
        this.insertNodePending = true;
      }),
      [insert.waypoint]: new LabeledAction('...Waypoint', () => {
        this.keyMenuOut.emit({kind: DACommandType.ADD_WAYPOINT});
      }),
      [insert.edge]: new LabeledActionSubmenuConfig('...Edge', this.buildDirectionalEdgeSubmenuConfig(), () => {
        this.directedEdgeActive = true;
        this.keyMenuOut.emit({kind: DACommandType.BEGIN_DIRECTED_EDGE});
      }),
      [insert.label]: new LabeledAction('...Label', () => {
        this.keyMenuOut.emit({kind: DACommandType.ADD_LABEL});
      }),
    } as SubmenuConfig;
  }

  private buildDirectionalInsertSubmenuConfig(): SubmenuConfig {
    const movement = this.keyAssignments.movement;

    const createDirected = (direction: 'up' | 'down' | 'left' | 'right') => () => {
      this.insertNodePending = false;
      this.insertDragActive = true;
      this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE_DIRECTED, direction, nodeShape: this.pendingNodeShape});
      const mode = this.keyMenu.currentMode as USQwertyMode<DACommand>;
      mode.actionSchedulingEnabled = false;
      mode.replaceTopSubmenu(this.dragSubmenuConfig);
      queueMicrotask(() => { mode.actionSchedulingEnabled = true; });
    };

    return {
      _repeatConfig: { initialDelayMs: 300, intervalMs: 200 },
      [movement.up]: new LabeledAction('Above', createDirected('up')),
      [movement.down]: new LabeledAction('Below', createDirected('down')),
      [movement.left]: new LabeledAction('Left', createDirected('left')),
      [movement.right]: new LabeledAction('Right', createDirected('right')),
    } as SubmenuConfig;
  }

  private buildNodeTypeShapeSubmenuConfig(): SubmenuConfig {
    const types = this.keyAssignments.nodeTypes;
    const emit = (shape: NodeShape) => () => this.keyMenuOut.emit({kind: DACommandType.SET_NODE_SHAPE, shape});
    return {
      [types.box]:      new LabeledAction('Box',      emit('box')),
      [types.circle]:   new LabeledAction('Circle',   emit('circle')),
      [types.diamond]:  new LabeledAction('Diamond',  emit('diamond')),
      [types.junction]: new LabeledAction('Junction', emit('junction')),
    } as SubmenuConfig;
  }

  private buildDirectionalEdgeSubmenuConfig(): SubmenuConfig {
    const nodeJump = this.keyAssignments.moveByNode.nodeJump;

    const setDestination = (direction: 'up' | 'down' | 'left' | 'right') => () => {
      this.keyMenuOut.emit({kind: DACommandType.SET_EDGE_DESTINATION, direction});
    };

    return {
      _repeatConfig: { initialDelayMs: 300, intervalMs: 200 },
      [nodeJump.up]: new LabeledAction('Above', setDestination('up')),
      [nodeJump.down]: new LabeledAction('Below', setDestination('down')),
      [nodeJump.left]: new LabeledAction('Left', setDestination('left')),
      [nodeJump.right]: new LabeledAction('Right', setDestination('right')),
    } as SubmenuConfig;
  }

  private buildSelectDragSubmenuRootAction(): LabeledActionSubmenuConfig {
    return new LabeledActionSubmenuConfig(
      'Select+Drag...',
      this.buildSelectSubmenuConfig(),
      () => {
        this.selectDragHoldActive = true;
        this.keyMenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT});
        this.keyMenuOut.emit({kind: DACommandType.ENTER_DRAG_MODE});
      },
    );
  }

  private buildSelectSubmenuConfig(): SubmenuConfig {
    const drag = this.keyAssignments.drag;
    const pz = this.keyAssignments.panZoom;
    const ds = this.keyAssignments.dragSpeed;
    const root = this.keyAssignments.root;

    return {
      [drag.up]: new LabeledAction('Drag Up', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_UP})),
      [drag.left]: new LabeledAction('Drag Left', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_LEFT})),
      [drag.down]: new LabeledAction('Drag Down', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_DOWN})),
      [drag.right]: new LabeledAction('Drag Right', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_RIGHT})),
      [pz.zoomIn]: new LabeledAction('Zoom In', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN})),
      [pz.zoomOut]: new LabeledAction('Zoom Out', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT})),
      [ds.bigger]: new LabeledSubmenuConfig('Bigger Drag...', this.buildDragSpeedSubmenu('medium')),
      [ds.smaller]: new LabeledSubmenuConfig('Smaller Drag...', this.buildDragSpeedSubmenu('fine')),
      [root.insertSubmenu]: new LabeledAction('Edit Item', () => this.keyMenuOut.emit({kind: DACommandType.EDIT_SELECTED})),
    } as SubmenuConfig;
  }

  private buildSharedUtilityBindings(): SubmenuConfig {
    const shared = this.keyAssignments.shared;
    const moveSpeed = this.keyAssignments.moveSpeed;
    const panZoom = this.keyAssignments.panZoom;
    const mbn = this.keyAssignments.moveByNode;
    const mbg = this.keyAssignments.moveByGraph;
    const misc = this.keyAssignments.misc;

    return {
      [shared.delete]: new LabeledAction('Delete', () => this.keyMenuOut.emit({kind: DACommandType.DELETE})),
      [shared.select]: new LabeledAction('Clear Selection', () => this.keyMenuOut.emit({kind: DACommandType.UNSELECT_ALL})),
      [shared.undo]: new LabeledAction('Undo', () => this.keyMenuOut.emit({kind: DACommandType.UNDO})),
      [moveSpeed.bigger]: new LabeledSubmenuConfig('Bigger Move...', this.buildMoveSpeedSubmenu('medium')),
      [moveSpeed.smaller]: new LabeledSubmenuConfig('Smaller Move...', this.buildMoveSpeedSubmenu('fine')),
      [panZoom.submenu]: new LabeledSubmenuConfig('Pan/Zoom...', this.buildPanZoomSubmenuConfig()),
      [mbn.submenu]: new LabeledSubmenuConfig('Move by node...', this.buildMoveByNodeSubmenuConfig()),
      [mbg.submenu]: new LabeledSubmenuConfig('Move by graph...', this.buildMoveByGraphSubmenuConfig()),
      [misc.submenu]: new LabeledSubmenuConfig('Misc...', this.buildMiscSubmenuConfig()),
      // With capsLockCtrlSwap: physical Ctrl sends 'CapsLock', physical CapsLock sends 'Control'
      // Bind "More Ctrl" to the physical Ctrl position
      [this.keyboardConfig.capsLockCtrlSwap ? 'CapsLock' : 'Control']: new LabeledSubmenuConfig('More Ctrl', this.buildCtrlSubmenuConfig()),
      'RControl': new LabeledSubmenuConfig('More Ctrl', this.buildCtrlSubmenuConfig()),
      // CapsLock (physical CapsLock position) → NORMAL mode
      [this.keyboardConfig.capsLockCtrlSwap ? 'Control' : 'CapsLock']: new LabeledAction('NORMAL', () => {
        this.switchMode('normalCaps');
      }),
    } as SubmenuConfig;
  }

  private getSpeedDistance(tier: 'fine' | 'normal' | 'medium' | 'large'): number {
    const cursor = this.visualConfig.config.cursor;
    switch (tier) {
      case 'fine': return cursor.fineDistance;
      case 'normal': return cursor.movementDistance;
      case 'medium': return cursor.mediumDistance;
      case 'large': return cursor.largeDistance;
    }
  }

  private buildMoveSpeedSubmenu(tier: 'fine' | 'medium' | 'large'): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const speed = this.keyAssignments.moveSpeed;
    const d = this.getSpeedDistance(tier);
    const moveWithDistance = (kind: DACommandType.MOVE_CROSSHAIRS_UP | DACommandType.MOVE_CROSSHAIRS_DOWN | DACommandType.MOVE_CROSSHAIRS_LEFT | DACommandType.MOVE_CROSSHAIRS_RIGHT) =>
      () => this.keyMenuOut.emit({kind, distance: d});

    const config: SubmenuConfig = {
      [movement.up]: new LabeledAction('Move Up', moveWithDistance(DACommandType.MOVE_CROSSHAIRS_UP)),
      [movement.left]: new LabeledAction('Move Left', moveWithDistance(DACommandType.MOVE_CROSSHAIRS_LEFT)),
      [movement.down]: new LabeledAction('Move Down', moveWithDistance(DACommandType.MOVE_CROSSHAIRS_DOWN)),
      [movement.right]: new LabeledAction('Move Right', moveWithDistance(DACommandType.MOVE_CROSSHAIRS_RIGHT)),
    } as SubmenuConfig;

    if (tier === 'medium') {
      (config as any)[speed.biggest] = new LabeledSubmenuConfig('Biggest...', this.buildMoveSpeedSubmenu('large'));
    }

    return config;
  }

  private buildPanZoomSubmenuConfig(): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const pz = this.keyAssignments.panZoom;
    const d = this.getSpeedDistance('normal');
    const panCmd = (kind: DACommandType.PAN_UP | DACommandType.PAN_DOWN | DACommandType.PAN_LEFT | DACommandType.PAN_RIGHT) =>
      () => this.keyMenuOut.emit({kind, distance: d});

    return {
      _repeatConfig: { initialDelayMs: 300, intervalMs: 200 },
      [movement.up]: new LabeledAction('Pan Up', panCmd(DACommandType.PAN_UP)),
      [movement.left]: new LabeledAction('Pan Left', panCmd(DACommandType.PAN_LEFT)),
      [movement.down]: new LabeledAction('Pan Down', panCmd(DACommandType.PAN_DOWN)),
      [movement.right]: new LabeledAction('Pan Right', panCmd(DACommandType.PAN_RIGHT)),
      [pz.zoomIn]: new LabeledAction('Zoom In', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN})),
      [pz.zoomOut]: new LabeledAction('Zoom Out', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT})),
      [pz.recenterView]: new LabeledAction('Recenter View', () => this.keyMenuOut.emit({kind: DACommandType.RECENTER_VIEW})),
      [pz.recenterCrosshairs]: new LabeledAction('Recenter Xhairs', () => this.keyMenuOut.emit({kind: DACommandType.RECENTER_CROSSHAIRS})),
      [pz.speed.bigger]: new LabeledSubmenuConfig('Bigger Pan...', this.buildPanSpeedSubmenu('medium')),
      [pz.speed.smaller]: new LabeledSubmenuConfig('Smaller Pan...', this.buildPanSpeedSubmenu('fine')),
    } as SubmenuConfig;
  }

  private buildPanSpeedSubmenu(tier: 'fine' | 'medium' | 'large'): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const speed = this.keyAssignments.panZoom.speed;
    const d = this.getSpeedDistance(tier);
    const panCmd = (kind: DACommandType.PAN_UP | DACommandType.PAN_DOWN | DACommandType.PAN_LEFT | DACommandType.PAN_RIGHT) =>
      () => this.keyMenuOut.emit({kind, distance: d});

    const config: SubmenuConfig = {
      [movement.up]: new LabeledAction('Pan Up', panCmd(DACommandType.PAN_UP)),
      [movement.left]: new LabeledAction('Pan Left', panCmd(DACommandType.PAN_LEFT)),
      [movement.down]: new LabeledAction('Pan Down', panCmd(DACommandType.PAN_DOWN)),
      [movement.right]: new LabeledAction('Pan Right', panCmd(DACommandType.PAN_RIGHT)),
    } as SubmenuConfig;

    if (tier === 'medium') {
      (config as any)[speed.biggest] = new LabeledSubmenuConfig('Biggest...', this.buildPanSpeedSubmenu('large'));
    }

    return config;
  }

  private buildDragSpeedSubmenu(tier: 'fine' | 'medium' | 'large'): SubmenuConfig {
    const drag = this.keyAssignments.drag;
    const speed = this.keyAssignments.dragSpeed;
    const d = this.getSpeedDistance(tier);
    const dragCmd = (kind: DACommandType.DRAG_SELECTED_UP | DACommandType.DRAG_SELECTED_DOWN | DACommandType.DRAG_SELECTED_LEFT | DACommandType.DRAG_SELECTED_RIGHT) =>
      () => this.keyMenuOut.emit({kind, distance: d});

    const config: SubmenuConfig = {
      [drag.up]: new LabeledAction('Drag Up', dragCmd(DACommandType.DRAG_SELECTED_UP)),
      [drag.left]: new LabeledAction('Drag Left', dragCmd(DACommandType.DRAG_SELECTED_LEFT)),
      [drag.down]: new LabeledAction('Drag Down', dragCmd(DACommandType.DRAG_SELECTED_DOWN)),
      [drag.right]: new LabeledAction('Drag Right', dragCmd(DACommandType.DRAG_SELECTED_RIGHT)),
    } as SubmenuConfig;

    if (tier === 'medium') {
      (config as any)[speed.biggest] = new LabeledSubmenuConfig('Biggest...', this.buildDragSpeedSubmenu('large'));
    }

    return config;
  }

  private buildMoveByNodeSubmenuConfig(): SubmenuConfig {
    const mbn = this.keyAssignments.moveByNode;

    return {
      _repeatConfig: { initialDelayMs: 300, intervalMs: 200 },
      [mbn.nodeJump.left]: new LabeledAction('Node Left', () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_LEFT})),
      [mbn.nodeJump.down]: new LabeledAction('Node Down', () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_DOWN})),
      [mbn.nodeJump.up]: new LabeledAction('Node Up', () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_UP})),
      [mbn.nodeJump.right]: new LabeledAction('Node Right', () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_RIGHT})),
      [mbn.toggleWaypoints]: new LabeledAction('Toggle Waypoints', () => this.keyMenuOut.emit({kind: DACommandType.TOGGLE_WAYPOINT_VISIBILITY})),
    } as SubmenuConfig;
  }

  private buildMiscSubmenuConfig(): SubmenuConfig {
    const misc = this.keyAssignments.misc;

    return {
      [misc.reload]: new LabeledAction('Reload Page', () => window.location.reload()),
    } as SubmenuConfig;
  }

  private buildCtrlSubmenuConfig(): SubmenuConfig {
    return {
      _repeatConfig: { initialDelayMs: 300, intervalMs: 200 },
      'z': new LabeledAction('Undo', () => this.keyMenuOut.emit({kind: DACommandType.UNDO})),
      'r': new LabeledAction('Redo', () => this.keyMenuOut.emit({kind: DACommandType.REDO})),
      '[': new LabeledAction('Escape', () => this.keyMenuOut.emit({kind: DACommandType.UNSELECT_ALL})),
    } as SubmenuConfig;
  }

  private buildMoveByGraphSubmenuConfig(): SubmenuConfig {
    const mbg = this.keyAssignments.moveByGraph;
    const movement = this.keyAssignments.movement;

    return {
      _repeatConfig: { initialDelayMs: 300, intervalMs: 200 },
      [mbg.outgoingNext]: new LabeledAction('Next Out Edge', () => this.keyMenuOut.emit({kind: DACommandType.SELECT_NEXT_EDGE, direction: 'outgoing'})),
      [mbg.outgoingPrev]: new LabeledAction('Next In Edge', () => this.keyMenuOut.emit({kind: DACommandType.SELECT_NEXT_EDGE, direction: 'incoming'})),
      [movement.up]: new LabeledAction('Follow Edge', () => this.keyMenuOut.emit({kind: DACommandType.FOLLOW_SELECTED_EDGE})),
      [movement.left]: new LabeledAction('Follow Edge', () => this.keyMenuOut.emit({kind: DACommandType.FOLLOW_SELECTED_EDGE})),
      [movement.down]: new LabeledAction('Follow Edge', () => this.keyMenuOut.emit({kind: DACommandType.FOLLOW_SELECTED_EDGE})),
      [movement.right]: new LabeledAction('Follow Edge', () => this.keyMenuOut.emit({kind: DACommandType.FOLLOW_SELECTED_EDGE})),
    } as SubmenuConfig;
  }

  /** Switch keymenu mode and update the mode label. Called by AppComponent. */
  switchMode(modeName: string): void {
    this.keyMenu.switchMode(modeName);
  }

  /** Whether the keymenu is currently in a CapsLock mode. */
  get isCapsMode(): boolean {
    const name = this.keyMenu.currentMode.name;
    return name === 'normalCaps' || name === 'labelEditCaps';
  }

  /** Enter label-edit mode, choosing caps variant if currently in a caps mode. */
  enterLabelEditMode(): void {
    this.switchMode(this.isCapsMode ? 'labelEditCaps' : 'labelEdit');
  }

  /** Exit to normal mode, choosing caps variant if currently in a caps mode. */
  exitToNormalMode(): void {
    this.switchMode(this.isCapsMode ? 'normalCaps' : 'normal');
  }

  private refreshActiveKeyPath() {
    const currentMode = this.keyMenu.currentMode;
    if (!(currentMode instanceof USQwertyMode)) {
      this.activeKeyPath = [];
      return;
    }

    this.activeKeyPath = currentMode.submenuKeyStringStack.filter((key) => key.length > 0);
    this.updateModeLabel();
  }

  /** Mode label color mapping — readable on both light and dark themes. */
  private static readonly MODE_LABEL_COLORS: Record<string, string> = {
    normal: '#5b9bd5',      // blue
    normalCaps: '#ed7d31',  // orange
    labelEdit: '#70ad47',   // green
    labelEditCaps: '#ed7d31', // orange
  };

  private updateModeLabel() {
    const modeName = this.keyMenu.currentMode.name;
    const color = KeymenuComponent.MODE_LABEL_COLORS[modeName] ?? '#888888';

    // Build display: mode name with "/" separator for parent/child modes
    let displayName: string;
    if (modeName === 'labelEdit') {
      displayName = 'edit';
    } else if (modeName === 'labelEditCaps') {
      displayName = 'capslock / edit';
    } else if (modeName === 'normalCaps') {
      displayName = 'capslock / normal';
    } else {
      displayName = modeName;
    }

    // Append submenu breadcrumb if we're deeper than root
    if (this.activeKeyPath.length > 0) {
      const currentMode = this.keyMenu.currentMode;
      if (currentMode instanceof USQwertyMode) {
        // Get the label of each submenu key from the stack
        const labels: string[] = [];
        for (let i = 0; i < currentMode.stack.length - 1; i++) {
          const submenu = currentMode.stack[i];
          const nextKey = currentMode.submenuKeyStringStack[i + 1] as KeyString;
          if (nextKey && submenu.keys[nextKey]) {
            const keyObj = submenu.keys[nextKey]!
            labels.push(keyObj.label);
          }
        }
        if (labels.length > 0) {
          displayName += ' > ' + labels.join(' > ');
        }
      }
    }

    this.keyMenu.updateModeLabel(displayName, color);
  }

  private handleDoubleShiftReturnToNormal(event: KeyboardEvent): boolean {
    if (event.key !== 'Shift' || event.repeat) {
      return false;
    }

    const now = Date.now();
    const isDoubleShift = now - this.lastShiftPressedAt <= this.DOUBLE_SHIFT_INTERVAL_MS;
    this.lastShiftPressedAt = now;

    if (!isDoubleShift) {
      return false;
    }

    const modeName = this.keyMenu.currentMode.name;
    if (modeName === 'labelEdit' || modeName === 'labelEditCaps') {
      this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
    }

    const targetMode = modeName === 'labelEditCaps' ? 'normalCaps' : 'normal';
    this.switchMode(targetMode);
    this.resetInteractionState();
    this.resetHelpMode();
    return true;
  }

  private handleSpacebarDown(): void {
    const isDoublePress = this.spacebarDoublePress.onPress();

    if (isDoublePress) {
      // Double-press toggles sticky mode
      this.clearSpacebarHoldTimer();
      if (this.helpModeState === 'sticky') {
        this.setHelpMode('inactive');
      } else {
        this.setHelpMode('sticky');
      }
      return;
    }

    // Start hold timer
    this.spacebarHoldTimer = window.setTimeout(() => {
      if (this.helpModeState === 'inactive') {
        this.setHelpMode('held');
      }
    }, this.SPACEBAR_HOLD_THRESHOLD_MS);
  }

  private handleSpacebarUp(): void {
    this.spacebarDoublePress.onRelease();
    this.clearSpacebarHoldTimer();

    if (this.helpModeState === 'held') {
      this.setHelpMode('inactive');
    }
    // sticky stays active on release
  }

  private setHelpMode(state: 'inactive' | 'held' | 'sticky'): void {
    this.helpModeState = state;
    const active = state !== 'inactive';
    const mode = this.keyMenu.currentMode;
    if (mode instanceof USQwertyMode) {
      mode.helpModeActive = active;
    }
  }

  private clearSpacebarHoldTimer(): void {
    if (this.spacebarHoldTimer !== undefined) {
      window.clearTimeout(this.spacebarHoldTimer);
      this.spacebarHoldTimer = undefined;
    }
  }

  private resetHelpMode(): void {
    this.clearSpacebarHoldTimer();
    this.spacebarDoublePress.reset();
    if (this.helpModeState !== 'inactive') {
      this.setHelpMode('inactive');
    }
  }

  @HostListener('window:blur')
  @HostListener('document:visibilitychange')
  handleWindowBlur() {
    if (!this.keyMenu) return;
    const mode = this.keyMenu.currentMode;
    if (mode instanceof USQwertyMode) {
      // Cancel any in-flight slide animations first
      mode.cancelAllTweensAndReset();
      // Pop all submenus back to root and clear all state
      while (mode.stack.length > 1) {
        mode.stackTop.hideAllKeys();
        mode.stackTop.unhighlightAllKeys();
        mode.stackTop.stopAllScheduledActions();
        mode.stack.pop();
      }
      mode.submenuKeyStringStack.splice(1);
      mode.stackTop.showAllKeys();
      mode.stackTop.unhighlightAllKeys();
      mode.stackTop.stopAllScheduledActions();
    }
    this.resetInteractionState();
    this.directedEdgeActive = false;
    this.resetHelpMode();
  }

  private remapEvent(event: KeyboardEvent): KeyboardEvent {
    if (!this.keyboardConfig.capsLockCtrlSwap) return event;
    const code = event.code;
    if (code === 'CapsLock' || code === 'ControlLeft') {
      const swappedCode = code === 'CapsLock' ? 'ControlLeft' : 'CapsLock';
      const swappedKey = code === 'CapsLock' ? 'Control' : 'CapsLock';
      const swappedCtrl = code === 'CapsLock' ? true : event.ctrlKey;
      return new KeyboardEvent(event.type, {
        key: swappedKey,
        code: swappedCode,
        ctrlKey: swappedCtrl,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        repeat: event.repeat,
        bubbles: event.bubbles,
      });
    }
    return event;
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.keyMenu) {
      return;
    }
    event = this.remapEvent(event);

    // Ctrl+Z = Undo, Ctrl+Shift+Z / Ctrl+R = Redo (works in all modes)
    // Skip interception when the Ctrl submenu is active so keymenu handles it with visual feedback
    const ctrlSubmenuActive = this.keyMenu.currentMode instanceof USQwertyMode &&
      (this.keyMenu.currentMode as USQwertyMode<DACommand>).submenuKeyStringStack.includes('Control' as KeyString);
    if (event.ctrlKey && !ctrlSubmenuActive && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.keyMenuOut.emit({kind: DACommandType.REDO});
      } else {
        this.keyMenuOut.emit({kind: DACommandType.UNDO});
      }
      return;
    }
    if (event.ctrlKey && !ctrlSubmenuActive && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      this.keyMenuOut.emit({kind: DACommandType.REDO});
      return;
    }

    if (this.handleDoubleShiftReturnToNormal(event)) {
      return;
    }

    // Spacebar help mode interception (only in normal mode)
    if (event.key === ' ' && this.keyMenu.currentMode.name === 'normal' && !event.repeat) {
      event.preventDefault();
      this.handleSpacebarDown();
      return;
    }

    const inLabelEdit = this.keyMenu.currentMode.name === 'labelEdit' ||
      this.keyMenu.currentMode.name === 'labelEditCaps';

    if (inLabelEdit) {
      const capsExit = this.keyMenu.currentMode.name === 'labelEditCaps';
      const exitTarget = capsExit ? 'normalCaps' : 'normal';
      if (event.key === 'Escape' || (event.key === '[' && event.ctrlKey && !ctrlSubmenuActive)) {
        this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
        this.switchMode(exitTarget);
        return;
      }
      if (event.key === 'Enter' && event.shiftKey) {
        this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
        this.switchMode(exitTarget);
        return;
      }
    }

    if (this.keyMenu.currentMode.name === 'normal') {
      if (event.key === 'Escape' || (event.key === '[' && event.ctrlKey && !ctrlSubmenuActive)) {
        this.keyMenuOut.emit({kind: DACommandType.UNSELECT_ALL});
        return;
      }

      // Shift+N / Shift+P for incoming edge traversal (inside nav submenu context)
      if (event.shiftKey && event.key === 'N') {
        this.keyMenuOut.emit({kind: DACommandType.TRAVERSE_INCOMING_NEXT});
        return;
      }
      if (event.shiftKey && event.key === 'P') {
        this.keyMenuOut.emit({kind: DACommandType.TRAVERSE_INCOMING_PREV});
        return;
      }
    }

    // Track when the edit submenu key is pressed so tap-to-edit works on keyup
    // Only at root level — if we're inside a submenu, 'i' may be zoom or something else
    const currentMode = this.keyMenu.currentMode;
    const atRootLevel = currentMode instanceof USQwertyMode && currentMode.stack.length === 1;
    const eventKey = KeymenuComponent.normalizeEventKey(event);
    if (currentMode.name === 'normal' && !event.repeat && atRootLevel &&
        eventKey === this.keyAssignments.root.editSubmenu) {
      this.editPending = true;
    } else if (this.editPending && eventKey !== this.keyAssignments.root.editSubmenu) {
      // Any child key press cancels tap-to-edit (user is using the submenu)
      this.editPending = false;
    }

    this.keyMenu.handleKeyDown(event);
    this.refreshActiveKeyPath();
  }

  @HostListener('document:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    if (!this.keyMenu) {
      return;
    }
    event = this.remapEvent(event);

    // Spacebar help mode release
    if (event.key === ' ' && this.keyMenu.currentMode.name === 'normal') {
      this.handleSpacebarUp();
      return;
    }

    this.keyMenu.handleKeyUp(event);
    this.refreshActiveKeyPath();

    const eventKey = KeymenuComponent.normalizeEventKey(event);

    // Tap edit submenu key (e) without selecting a child → fire EDIT_SELECTED
    if (eventKey === this.keyAssignments.root.editSubmenu && this.editPending) {
      this.editPending = false;
      this.keyMenuOut.emit({kind: DACommandType.EDIT_SELECTED});
      return;
    }

    // If insert submenu key (f) is released, handle pending/drag states
    if (eventKey === this.keyAssignments.root.insertSubmenu) {
      this.log.log('[keymenu] insert key released, insertNodePending:', this.insertNodePending, 'insertDragActive:', this.insertDragActive);
      // If node creation was pending (type key pressed but not released), create the node now
      if (this.insertNodePending) {
        this.log.log('[keymenu] f released before type key — creating node at crosshairs');
        this.insertNodePending = false;
        this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE, nodeShape: this.pendingNodeShape});
        if (this.pendingNodeShape !== 'junction') {
          this.switchMode('labelEdit');
        }
        return;
      }
      if (this.insertDragActive) {
        this.insertDragActive = false;
        if (this.pendingNodeShape !== 'junction') {
          this.switchMode('labelEdit');
        }
      }
      return;
    }

    // Pending node insert: releasing type key without pressing a direction creates node at crosshairs.
    // Only fires if insert submenu key (f) is still held (we're still in the insert context).
    if (this.insertNodePending && eventKey === this.pendingInsertTypeKey) {
      this.log.log('[keymenu] type key released with pending — creating node at crosshairs');
      this.insertNodePending = false;
      this.insertDragActive = true;
      this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE, nodeShape: this.pendingNodeShape});
      const mode = this.keyMenu.currentMode as USQwertyMode<DACommand>;
      mode.actionSchedulingEnabled = false;
      mode.replaceTopSubmenu(this.dragSubmenuConfig);
      queueMicrotask(() => { mode.actionSchedulingEnabled = true; });
    }

    if (this.directedEdgeActive && eventKey === this.keyAssignments.insert.edge) {
      this.directedEdgeActive = false;
      this.keyMenuOut.emit({kind: DACommandType.FINALIZE_DIRECTED_EDGE});
    }

    if (this.selectDragHoldActive && eventKey === this.keyAssignments.root.selectDragSubmenu) {
      this.selectDragHoldActive = false;
      this.keyMenuOut.emit({kind: DACommandType.EXIT_DRAG_MODE});
    }
  }
}
