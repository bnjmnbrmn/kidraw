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
import Konva from 'konva';
import {Subscription} from 'rxjs';
import {DACommand, DACommandType, EdgeDirectedness, GridTier, ItemColor, LayoutType, LineStyle, NavTargetKind, NodeShape, RoutingAlgorithm, TaskStatus, TextOverflowMode} from '../drawing-area/command.model';
import {KeyMenu} from '../lib/keymenu/keyMenu';
import {USQwertyMode, USQwertyModeConfig} from '../lib/keymenu/modes/us-qwerty';
import {LabeledSubmenuConfig} from '../lib/keymenu/keys/labeledSubmenuConfig';
import {LabeledAction} from '../lib/keymenu/keys/labeledAction';
import {
  LabeledActionSubmenuConfig,
  SubmenuConfig,
} from '../lib/keymenu/layouts/us-qwerty/submenuConfig';
import {KeyString, KEY_HEIGHT, getKeyWidth} from '../lib/keymenu/layouts/us-qwerty';
import {
  DirectionalKeyAssignments,
  KeymenuKeyAssignments,
  VIM_KEYMENU_KEY_ASSIGNMENTS,
} from './config/key-assignments';
import {DebugLogService} from '../services/debug-log.service';
import {ThemeService} from '../services/theme.service';
import {KeyboardConfigService} from '../services/keyboard-config.service';
import {VisualConfigService} from '../services/visual-config.service';

import {DoublePressTracker} from '../lib/keymenu/help/doublePressTracker';
import {KeyboardSurface} from '../drawing-area/da-notification.model';

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
  @Input() visible = true;
  @Output() keyMenuOut = new EventEmitter<DACommand>();
  @Output() labelEditModeOut = new EventEmitter<'insert' | 'vimNormal'>();
  @Output() visibilityToggle = new EventEmitter<void>();

  private keyMenu!: KeyMenu<DACommand>;
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private log = inject(DebugLogService);
  private themeService = inject(ThemeService);
  private keyboardConfig = inject(KeyboardConfigService);
  private visualConfig = inject(VisualConfigService);
  private themeSub?: Subscription;
  private configSub?: Subscription;
  private visualSub?: Subscription;

  // When true, releasing the add key without selecting a child fires QUICK_ADD.
  private editPending = false;
  /** True while the drawing area or a DOM popup owns the keyboard. Component
   *  key handlers are ignored; ownership was flushed on entry so swallowed
   *  releases cannot leave stale keymenu state. */
  private suspended = false;
  /** The real keymenu mode to restore after a drawing-area/DOM surface gives
   *  keyboard ownership back. */
  private modeBeforeSuspend: string | null = null;
  private activeSurface: KeyboardSurface | null = null;
  // Set when a labelable node was created from the held insert hub (directly,
  // or — via the 'node-inserted' confirmation — a connected insert);
  // releasing the hub key then enters labelEdit.
  private insertViaEditActive = false;

  // Set (via AppComponent) when the drawing area confirms a label was added
  // from a held submenu; releasing the submenu key then enters labelEdit so
  // typing goes straight into the new label. Confirmation-driven so a failed
  // Add Label (no edge under the crosshairs) doesn't strand the user in
  // labelEdit with nothing selected.
  private labelAddActive = false;
  // One-shot guard for the held edit-key submenu: action keys auto-repeat
  // (initialRepeatDelayMs is 0), but insert/label/waypoint must fire once per hold.
  private editContextActionFired = false;
  private selectDragHoldActive = false;
  private moveByNodeHoldActive = false;
  private lastShiftPressedAt = 0;

  private readonly DOUBLE_SHIFT_INTERVAL_MS = 3000;
  private shiftTimingBar: Konva.Rect | null = null;
  private shiftTimingTween: Konva.Tween | null = null;
  private shiftTimingTimeout: number | null = null;

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
      {key: `${root.editSubmenu} (hold)`, action: 'Add / grow'},
      {key: `${root.selectDragSubmenu} (hold)`, action: 'Select + drag'},
      {key: this.keyAssignments.moveSpeed.bigger, action: 'Bigger move'},
      {key: this.keyAssignments.panZoom.submenu, action: 'Pan/Zoom'},
      {key: this.keyAssignments.moveByNode.submenu, action: 'Move by node'},
      {key: this.keyAssignments.root.go, action: 'Go (nav popup)'},
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
        labelEditVimNormal: new USQwertyModeConfig(this.buildLabelEditVimNormalSubmenuConfig(false), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        labelEditVimNormalCaps: new USQwertyModeConfig(this.buildLabelEditVimNormalSubmenuConfig(true), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        surfaceNavPopup: new USQwertyModeConfig(this.buildNavPopupSurfaceConfig(), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        surfaceGrowTargeting: new USQwertyModeConfig(this.buildGrowTargetingSurfaceConfig(), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        surfaceGrowEmpty: new USQwertyModeConfig(this.buildGrowEmptySurfaceConfig(), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        surfaceGrowTargetPopup: new USQwertyModeConfig(this.buildGrowTargetPopupSurfaceConfig(), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        surfaceGrowTypePopup: new USQwertyModeConfig(this.buildGrowTypePopupSurfaceConfig(), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
        surfaceGrowPlacement: new USQwertyModeConfig(this.buildGrowPlacementSurfaceConfig(), this.visualConfig.getEffectivePalette(this.themeService.theme), this.keyboardConfig.hideFingerBlockedKeys, this.keyboardConfig.keyboardLayout, this.keyboardConfig.capsLockCtrlSwap, this.visualConfig.config),
      },
      onModeSwitch: () => this.refreshActiveKeyPath(),
    });
    if (this.suspended && this.activeSurface) {
      this.keyMenu.switchMode(KeymenuComponent.SURFACE_MODES[this.activeSurface]);
    }
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

  private buildLabelEditVimNormalSubmenuConfig(capsMode: boolean): SubmenuConfig {
    const goInsert = () => {
      this.switchMode(capsMode ? 'labelEditCaps' : 'labelEdit');
      this.labelEditModeOut.emit('insert');
    };
    const emit = (kind: DACommandType) => () => this.keyMenuOut.emit({kind} as DACommand);
    const cursor = this.visualConfig.config.cursor;

    const config: SubmenuConfig = {
      // Held motions repeat like held typing does in insert mode.
      _repeatConfig: { initialDelayMs: cursor.labelEditInitialDelayMs, intervalMs: cursor.labelEditIntervalMs },
    } as SubmenuConfig;

    // i → insert at the caret; a → insert after it (vim append).
    (config as any)['i'] = new LabeledAction('insert', goInsert);
    (config as any)['a'] = new LabeledAction('append', () => {
      this.keyMenuOut.emit({kind: DACommandType.CURSOR_RIGHT});
      goInsert();
    });

    // hjkl caret movement — j/k walk the display (wrapped) lines.
    (config as any)['h'] = new LabeledAction('←', emit(DACommandType.CURSOR_LEFT));
    (config as any)['j'] = new LabeledAction('↓', emit(DACommandType.CURSOR_DOWN));
    (config as any)['k'] = new LabeledAction('↑', emit(DACommandType.CURSOR_UP));
    (config as any)['l'] = new LabeledAction('→', emit(DACommandType.CURSOR_RIGHT));
    // Vim-normal Backspace moves left, it does not delete.
    (config as any)['Backspace'] = new LabeledAction('←', emit(DACommandType.CURSOR_LEFT));

    // Word motions and line anchors.
    (config as any)['w'] = new LabeledAction('word →', emit(DACommandType.CURSOR_WORD_FORWARD));
    (config as any)['b'] = new LabeledAction('word ←', emit(DACommandType.CURSOR_WORD_BACK));
    (config as any)['0'] = new LabeledAction('line start', emit(DACommandType.CURSOR_LINE_START));

    // x → delete the char under the caret.
    (config as any)['x'] = new LabeledAction('del char', emit(DACommandType.DELETE_CHAR_AT_CURSOR));

    // Shifted vim commands: $ (line end), A (append at line end), I (insert
    // at line start).
    const shift: SubmenuConfig = {
      _repeatConfig: { initialDelayMs: cursor.labelEditInitialDelayMs, intervalMs: cursor.labelEditIntervalMs },
    } as SubmenuConfig;
    (shift as any)['4'] = new LabeledAction('$ line end', emit(DACommandType.CURSOR_LINE_END));
    (shift as any)['6'] = new LabeledAction('^ line start', emit(DACommandType.CURSOR_LINE_START));
    (shift as any)['a'] = new LabeledAction('Append at end', () => {
      this.keyMenuOut.emit({kind: DACommandType.CURSOR_LINE_END});
      goInsert();
    });
    (shift as any)['i'] = new LabeledAction('Insert at start', () => {
      this.keyMenuOut.emit({kind: DACommandType.CURSOR_LINE_START});
      goInsert();
    });
    (config as any)['Shift'] = new LabeledSubmenuConfig('Shift...', shift);
    (config as any)['RShift'] = new LabeledSubmenuConfig('Shift...', shift);

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
    this.editPending = false;
    this.insertViaEditActive = false;
    this.labelAddActive = false;
    this.editContextActionFired = false;
    this.selectDragHoldActive = false;
    this.moveByNodeHoldActive = false;
  }

  private buildRootSubmenuConfig(): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const root = this.keyAssignments.root;

    return {
      [movement.up]: new LabeledAction('Move Up', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP})),
      [movement.left]: new LabeledAction('Move Left', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT})),
      [movement.down]: new LabeledAction('Move Down', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN})),
      [movement.right]: new LabeledAction('Move Right', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT})),

      [root.editSubmenu]: new LabeledSubmenuConfig('Add...', this.buildEditSubmenuConfig()),
      [root.selectDragSubmenu]: this.buildSelectDragSubmenuRootAction(),
      [root.styleSubmenu]: new LabeledSubmenuConfig('Style...', this.buildStyleSubmenuConfig()),
      [root.layoutSubmenu]: new LabeledSubmenuConfig('Layout...', this.buildLayoutSubmenuConfig()),
      [root.statusSubmenu]: new LabeledSubmenuConfig('Status...', this.buildStatusSubmenuConfig()),
      [root.toggleVisibility]: new LabeledAction('Hide Keyboard', () => this.visibilityToggle.emit(), false),
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


  /** Called by AppComponent when the drawing area confirms a hub insert
   *  created a node (plain or connected). Arms labelEdit-on-release for
   *  labelable shapes, and starts the post-insert drag phase: any connect
   *  child submenu collapses back to the hub level, which is swapped for
   *  the drag submenu — so movement keys reposition the fresh (selected)
   *  node while the hub key stays held; releasing it then enters labelEdit. */
  notifyNodeInserted(labelable: boolean): void {
    if (labelable) this.insertViaEditActive = true;
    if (!this.keyMenu) return;
    const mode = this.keyMenu.currentMode;
    if (!(mode instanceof USQwertyMode) || mode.stack.length <= 1) return;
    if (mode.submenuKeyStringStack[1] !== this.keyAssignments.root.editSubmenu) return;
    if (mode.stack.length > 2) {
      // Pop the u/o connect submenu (and anything deeper). Its opening key
      // may still be physically held; its later keyup finds no matching
      // stack entry and no-ops.
      mode.popSubmenuAndChildren(mode.submenuKeyStringStack[2] as KeyString);
    }
    mode.actionSchedulingEnabled = false;
    mode.replaceTopSubmenu(this.dragSubmenuConfig);
    this.refreshActiveKeyPath();
    queueMicrotask(() => { mode.actionSchedulingEnabled = true; });
  }

  /** Called by AppComponent when the drawing area confirms an ADD_LABEL
   *  succeeded: arm the labelEdit transition for the submenu-key release. */
  notifyLabelAdded(): void {
    this.labelAddActive = true;
  }

  /** One-shot guard shared by the held hub's inserting actions: action keys
   *  auto-repeat, and one hold should insert at most one thing. */
  private hubOnce(fire: () => void): () => void {
    return () => {
      if (this.editContextActionFired) return;
      this.editContextActionFired = true;
      fire();
    };
  }

  /** The unified insert/connect hub under the held edit key: left-hand kind
   *  choices, plus u/o connected-insert modifiers next to the held key. */
  private buildEditSubmenuConfig(): SubmenuConfig {
    const insert = this.keyAssignments.insert;
    // labelEdit arming + the post-insert drag phase are confirmation-driven
    // for every hub insert: the drawing area answers with 'node-inserted'.
    const insertNode = (shape: NodeShape | undefined, label: string) =>
      new LabeledAction(label, this.hubOnce(() =>
        this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE, nodeShape: shape})), false);
    return {
      [insert.box]:       insertNode(undefined,   'Box'),
      [insert.circle]:    insertNode('circle',    'Circle'),
      [insert.diamond]:   insertNode('diamond',   'Diamond'),
      [insert.junction]:  insertNode('junction',  'Junction'),
      [insert.invisible]: insertNode('invisible', 'Invisible'),
      [insert.label]: new LabeledAction('Add Label', this.hubOnce(() =>
        this.keyMenuOut.emit({kind: DACommandType.ADD_LABEL})), false),
      [insert.waypoint]: new LabeledAction('Add Waypoint', this.hubOnce(() =>
        this.keyMenuOut.emit({kind: DACommandType.INSERT_WAYPOINT})), false),
    } as SubmenuConfig;
  }


  private buildStatusSubmenuConfig(): SubmenuConfig {
    const status = this.keyAssignments.status;
    const emit = (s: TaskStatus) => () => this.keyMenuOut.emit({kind: DACommandType.SET_TASK_STATUS, status: s});
    return {
      [status.draft]:      new LabeledAction('Draft',       emit('draft'), false),
      [status.todo]:       new LabeledAction('To Do',       emit('todo'), false),
      [status.inProgress]: new LabeledAction('In Progress', emit('in-progress'), false),
      [status.blocked]:    new LabeledAction('Blocked',     emit('blocked'), false),
      [status.done]:       new LabeledAction('Done',        emit('done'), false),
      [status.clear]:      new LabeledAction('No Status',   emit('none'), false),
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
      [overflow.fit]:        new LabeledAction('Fit Text',     emit('fit')),
    } as SubmenuConfig;
  }

  private buildLayoutSubmenuConfig(): SubmenuConfig {
    const layout = this.keyAssignments.layout;
    const emit = (l: LayoutType) => () => this.keyMenuOut.emit({kind: DACommandType.APPLY_LAYOUT, layout: l});
    const route = (algorithm: RoutingAlgorithm) => () =>
      this.keyMenuOut.emit({kind: DACommandType.APPLY_EDGE_ROUTING, algorithm});
    return {
      [layout.forceDirected]: new LabeledAction('Force',    emit('force-directed')),
      [layout.forceClear]:    new LabeledAction('Force+',   emit('force-clear')),
      [layout.treeDown]:      new LabeledAction('Tree ↓',   emit('tree-down')),
      [layout.treeDownClear]: new LabeledAction('Tree ↓+',  emit('tree-down-clear')),
      [layout.treeRight]:     new LabeledAction('Tree →',   emit('tree-right')),
      [layout.treeRightClear]: new LabeledAction('Tree →+', emit('tree-right-clear')),
      [layout.circular]:      new LabeledAction('Circle',   emit('circular')),
      [layout.radial]:        new LabeledAction('Radial',   emit('radial')),
      [layout.routeBezierFitWeightedChain]: new LabeledAction('Route: BF-WC', route('bezier-fit-weighted-chain')),
      [layout.routeDesiderata]:             new LabeledAction('Route: Desiderata', route('desiderata')),
      [layout.routeIncremental]:            new LabeledAction('Route: Incr v2', route('incremental-desiderata-v2')),
      [layout.routeIncrementalV3]:          new LabeledAction('Route: Incr v3', route('incremental-desiderata-v3')),
      [layout.gather]:   new LabeledAction('Gather', () => this.keyMenuOut.emit({kind: DACommandType.GATHER_CONNECTED_NODES})),
      [layout.ungather]: new LabeledAction('Ungather', () => this.keyMenuOut.emit({kind: DACommandType.UNGATHER})),
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

  private buildStyleSubmenuConfig(): SubmenuConfig {
    const style = this.keyAssignments.style;
    return {
      [style.shapeSubmenu]: new LabeledSubmenuConfig('Shape...', this.buildNodeTypeShapeSubmenuConfig()),
      [style.directednessSubmenu]: new LabeledSubmenuConfig('Directedness...', this.buildDirectednessSubmenuConfig()),
      [style.lineStyleSubmenu]: new LabeledSubmenuConfig('Line Style...', this.buildLineStyleSubmenuConfig()),
      [style.colorSubmenu]: new LabeledSubmenuConfig('Color...', this.buildColorSubmenuConfig()),
      [style.defaultsSubmenu]: new LabeledSubmenuConfig('Defaults...', this.buildDefaultsSubmenuConfig()),
      [style.overflowSubmenu]: new LabeledSubmenuConfig('Overflow...', this.buildOverflowModeSubmenuConfig()),
      [style.togglePin]: new LabeledAction('Toggle Pin', () => this.keyMenuOut.emit({kind: DACommandType.TOGGLE_PIN_SELECTED})),
    } as SubmenuConfig;
  }

  private buildDirectednessSubmenuConfig(): SubmenuConfig {
    const dir = this.keyAssignments.directedness;
    const emit = (directedness: EdgeDirectedness) => () =>
      this.keyMenuOut.emit({kind: DACommandType.SET_EDGE_DIRECTEDNESS, directedness});
    return {
      [dir.directed]: new LabeledAction('Directed →', emit('directed')),
      [dir.undirected]: new LabeledAction('Undirected —', emit('undirected')),
      [dir.bidirectional]: new LabeledAction('Bidirectional ↔', emit('bidirectional')),
    } as SubmenuConfig;
  }

  private buildLineStyleSubmenuConfig(): SubmenuConfig {
    const ls = this.keyAssignments.lineStyles;
    const emit = (lineStyle: LineStyle) => () =>
      this.keyMenuOut.emit({kind: DACommandType.SET_LINE_STYLE, lineStyle});
    return {
      [ls.solid]: new LabeledAction('Solid ———', emit('solid')),
      [ls.dashed]: new LabeledAction('Dashed - - -', emit('dashed')),
      [ls.dotted]: new LabeledAction('Dotted · · ·', emit('dotted')),
    } as SubmenuConfig;
  }

  private buildColorSubmenuConfig(): SubmenuConfig {
    const c = this.keyAssignments.colors;
    const emit = (color: ItemColor) => () =>
      this.keyMenuOut.emit({kind: DACommandType.SET_ITEM_COLOR, color});
    return {
      [c.default]: new LabeledAction('Default', emit('default')),
      [c.red]: new LabeledAction('Red', emit('red')),
      [c.blue]: new LabeledAction('Blue', emit('blue')),
      [c.green]: new LabeledAction('Green', emit('green')),
      [c.orange]: new LabeledAction('Orange', emit('orange')),
      [c.purple]: new LabeledAction('Purple', emit('purple')),
    } as SubmenuConfig;
  }

  private buildDefaultsSubmenuConfig(): SubmenuConfig {
    const style = this.keyAssignments.style;
    return {
      [style.directednessSubmenu]: new LabeledSubmenuConfig('Default Dir...', this.buildDefaultDirectednessSubmenuConfig()),
      [style.lineStyleSubmenu]: new LabeledSubmenuConfig('Default Line...', this.buildDefaultLineStyleSubmenuConfig()),
    } as SubmenuConfig;
  }

  private buildDefaultDirectednessSubmenuConfig(): SubmenuConfig {
    const dir = this.keyAssignments.directedness;
    return {
      [dir.directed]: new LabeledAction('Directed →', () =>
        this.keyMenuOut.emit({kind: DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS, directedness: 'directed'})),
      [dir.undirected]: new LabeledAction('Undirected —', () =>
        this.keyMenuOut.emit({kind: DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS, directedness: 'undirected'})),
      [dir.bidirectional]: new LabeledAction('Bidir ↔', () =>
        this.keyMenuOut.emit({kind: DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS, directedness: 'bidirectional'})),
    } as SubmenuConfig;
  }

  private buildDefaultLineStyleSubmenuConfig(): SubmenuConfig {
    const ls = this.keyAssignments.lineStyles;
    return {
      [ls.solid]: new LabeledAction('Solid ———', () =>
        this.keyMenuOut.emit({kind: DACommandType.SET_DEFAULT_LINE_STYLE, lineStyle: 'solid'})),
      [ls.dashed]: new LabeledAction('Dashed - - -', () =>
        this.keyMenuOut.emit({kind: DACommandType.SET_DEFAULT_LINE_STYLE, lineStyle: 'dashed'})),
      [ls.dotted]: new LabeledAction('Dotted · · ·', () =>
        this.keyMenuOut.emit({kind: DACommandType.SET_DEFAULT_LINE_STYLE, lineStyle: 'dotted'})),
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
    const ds = this.keyAssignments.dragSpeed;
    const select = this.keyAssignments.select;

    return {
      [drag.up]: new LabeledAction('Drag Up', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_UP})),
      [drag.left]: new LabeledAction('Drag Left', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_LEFT})),
      [drag.down]: new LabeledAction('Drag Down', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_DOWN})),
      [drag.right]: new LabeledAction('Drag Right', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_RIGHT})),
      [select.zoomIn]: new LabeledAction('Zoom In', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN})),
      [select.zoomOut]: new LabeledAction('Zoom Out', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT})),
      [select.cycleDirection]: new LabeledAction('Cycle Direction', () =>
        this.keyMenuOut.emit({kind: DACommandType.CYCLE_EDGE_DIRECTEDNESS}), false),
      [ds.bigger]: new LabeledSubmenuConfig('Coarse Drag...', this.buildDragSpeedSubmenu('coarse')),
      [ds.smaller]: new LabeledSubmenuConfig('Fine Drag...', this.buildDragSpeedSubmenu('fine')),
      [select.editItem]: new LabeledAction('Edit Item', () => this.keyMenuOut.emit({kind: DACommandType.EDIT_SELECTED})),
    } as SubmenuConfig;
  }

  private buildSharedUtilityBindings(): SubmenuConfig {
    const shared = this.keyAssignments.shared;
    const moveSpeed = this.keyAssignments.moveSpeed;
    const panZoom = this.keyAssignments.panZoom;
    const mbn = this.keyAssignments.moveByNode;
    const misc = this.keyAssignments.misc;

    const search = this.keyAssignments.search;

    return {
      [shared.delete]: new LabeledAction('Delete', () => this.keyMenuOut.emit({kind: DACommandType.DELETE})),
      [shared.select]: new LabeledAction('Clear Selection', () => this.keyMenuOut.emit({kind: DACommandType.UNSELECT_ALL})),
      [shared.undo]: new LabeledAction('Undo', () => this.keyMenuOut.emit({kind: DACommandType.UNDO})),
      [search.open]: new LabeledAction('Search…', () => this.keyMenuOut.emit({kind: DACommandType.SEARCH_GRAPH}), false),
      [search.next]: new LabeledAction('Next Match', () => this.keyMenuOut.emit({kind: DACommandType.SEARCH_NEXT_MATCH})),
      [search.prev]: new LabeledAction('Prev Match', () => this.keyMenuOut.emit({kind: DACommandType.SEARCH_PREV_MATCH})),
      [moveSpeed.bigger]: new LabeledSubmenuConfig('Coarse Move...', this.buildMoveSpeedSubmenu('coarse')),
      [moveSpeed.smaller]: new LabeledSubmenuConfig('Fine Move...', this.buildMoveSpeedSubmenu('fine')),
      [panZoom.submenu]: new LabeledSubmenuConfig('Pan/Zoom...', this.buildPanZoomSubmenuConfig()),
      [mbn.submenu]: new LabeledActionSubmenuConfig('Move by node...', this.buildMoveByNodeSubmenuConfig(), () => {
        this.moveByNodeHoldActive = true;
        this.keyMenuOut.emit({kind: DACommandType.SHOW_NODE_GRID, targets: 'labels'});
      }),
      // One-shot: the popup takes the keyboard, so auto-repeat must not
      // queue further traversals behind it.
      [this.keyAssignments.root.go]: new LabeledAction('Go',
        () => this.keyMenuOut.emit({kind: DACommandType.TRAVERSE_SMART, holdKey: this.keyAssignments.root.go}), false),
      // Tap: enter text editing on whatever the crosshairs are over.
      [this.keyAssignments.root.editText]: new LabeledAction('Edit Text',
        () => this.keyMenuOut.emit({kind: DACommandType.EDIT_TEXT_AT_CROSSHAIRS}), false),
      [misc.submenu]: new LabeledSubmenuConfig('File...', this.buildMiscSubmenuConfig()),
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

  private buildMoveSpeedSubmenu(tier: GridTier): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const move = (kind: DACommandType.MOVE_CROSSHAIRS_UP | DACommandType.MOVE_CROSSHAIRS_DOWN | DACommandType.MOVE_CROSSHAIRS_LEFT | DACommandType.MOVE_CROSSHAIRS_RIGHT) =>
      () => this.keyMenuOut.emit({kind, gridTier: tier});

    return {
      [movement.up]: new LabeledAction('Move Up', move(DACommandType.MOVE_CROSSHAIRS_UP)),
      [movement.left]: new LabeledAction('Move Left', move(DACommandType.MOVE_CROSSHAIRS_LEFT)),
      [movement.down]: new LabeledAction('Move Down', move(DACommandType.MOVE_CROSSHAIRS_DOWN)),
      [movement.right]: new LabeledAction('Move Right', move(DACommandType.MOVE_CROSSHAIRS_RIGHT)),
    } as SubmenuConfig;
  }

  private buildPanZoomSubmenuConfig(): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const pz = this.keyAssignments.panZoom;
    const g = this.visualConfig.config.cursor.gridSpacing;
    const panCmd = (kind: DACommandType.PAN_UP | DACommandType.PAN_DOWN | DACommandType.PAN_LEFT | DACommandType.PAN_RIGHT) =>
      () => this.keyMenuOut.emit({kind, distance: g});

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
      [pz.centerOnCrosshairs]: new LabeledAction('Center on Xhairs', () => this.keyMenuOut.emit({kind: DACommandType.RECENTER_VIEW_ON_CROSSHAIRS}), false),
      [pz.speed.bigger]: new LabeledSubmenuConfig('Coarse Pan...', this.buildPanSpeedSubmenu('coarse')),
      [pz.speed.smaller]: new LabeledSubmenuConfig('Fine Pan...', this.buildPanSpeedSubmenu('fine')),
    } as SubmenuConfig;
  }

  private buildPanSpeedSubmenu(tier: 'fine' | 'coarse'): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const g = this.visualConfig.config.cursor.gridSpacing;
    const d = tier === 'fine' ? g / 10 : g * 10;
    const panCmd = (kind: DACommandType.PAN_UP | DACommandType.PAN_DOWN | DACommandType.PAN_LEFT | DACommandType.PAN_RIGHT) =>
      () => this.keyMenuOut.emit({kind, distance: d});

    return {
      [movement.up]: new LabeledAction('Pan Up', panCmd(DACommandType.PAN_UP)),
      [movement.left]: new LabeledAction('Pan Left', panCmd(DACommandType.PAN_LEFT)),
      [movement.down]: new LabeledAction('Pan Down', panCmd(DACommandType.PAN_DOWN)),
      [movement.right]: new LabeledAction('Pan Right', panCmd(DACommandType.PAN_RIGHT)),
    } as SubmenuConfig;
  }

  private buildDragSpeedSubmenu(tier: GridTier): SubmenuConfig {
    const drag = this.keyAssignments.drag;
    const dragCmd = (kind: DACommandType.DRAG_SELECTED_UP | DACommandType.DRAG_SELECTED_DOWN | DACommandType.DRAG_SELECTED_LEFT | DACommandType.DRAG_SELECTED_RIGHT) =>
      () => this.keyMenuOut.emit({kind, gridTier: tier});

    return {
      [drag.up]: new LabeledAction('Drag Up', dragCmd(DACommandType.DRAG_SELECTED_UP)),
      [drag.left]: new LabeledAction('Drag Left', dragCmd(DACommandType.DRAG_SELECTED_LEFT)),
      [drag.down]: new LabeledAction('Drag Down', dragCmd(DACommandType.DRAG_SELECTED_DOWN)),
      [drag.right]: new LabeledAction('Drag Right', dragCmd(DACommandType.DRAG_SELECTED_RIGHT)),
    } as SubmenuConfig;
  }

  private buildMoveByNodeSubmenuConfig(): SubmenuConfig {
    const mbn = this.keyAssignments.moveByNode;
    const ms = this.keyAssignments.moveSpeed;
    // Default jumps step between nodes + labels; the coarse modifier narrows
    // to nodes only, the fine modifier widens to include waypoints too.
    return {
      _repeatConfig: { initialDelayMs: 300, intervalMs: 200 },
      ...this.moveByNodeJumpKeys('labels'),
      [ms.bigger]: new LabeledActionSubmenuConfig(
        'Coarse: nodes only...',
        this.buildMoveByNodeTierSubmenu('nodes'),
        () => this.keyMenuOut.emit({kind: DACommandType.SHOW_NODE_GRID, targets: 'nodes'}),
      ),
      [ms.smaller]: new LabeledActionSubmenuConfig(
        'Fine: +waypoints...',
        this.buildMoveByNodeTierSubmenu('all'),
        () => this.keyMenuOut.emit({kind: DACommandType.SHOW_NODE_GRID, targets: 'all'}),
      ),
    } as SubmenuConfig;
  }

  private buildMoveByNodeTierSubmenu(targets: NavTargetKind): SubmenuConfig {
    return {
      _repeatConfig: { initialDelayMs: 300, intervalMs: 200 },
      ...this.moveByNodeJumpKeys(targets),
    } as SubmenuConfig;
  }

  private moveByNodeJumpKeys(targets: NavTargetKind): SubmenuConfig {
    const nj = this.keyAssignments.moveByNode.nodeJump;
    const label = targets === 'nodes' ? 'Node' : targets === 'all' ? 'Stop' : 'Stop';
    return {
      [nj.left]:  new LabeledAction(`${label} Left`,  () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_LEFT, targets})),
      [nj.down]:  new LabeledAction(`${label} Down`,  () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_DOWN, targets})),
      [nj.up]:    new LabeledAction(`${label} Up`,    () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_UP, targets})),
      [nj.right]: new LabeledAction(`${label} Right`, () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_RIGHT, targets})),
    } as SubmenuConfig;
  }

  private buildMiscSubmenuConfig(): SubmenuConfig {
    const misc = this.keyAssignments.misc;
    const otherProfileLabel = this.keyboardConfig.keyProfile === 'vim' ? 'IJKL keys' : 'Vim keys';

    return {
      // File / one-shot actions: never auto-repeat. Blocking dialogs
      // (prompt, native pickers) swallow the keyup, so a repeat timer
      // would keep firing and stack dialogs.
      _repeatConfig: { enabled: false },
      [misc.reload]: new LabeledAction('Reload Page', () => window.location.reload()),
      [misc.newGraph]: new LabeledAction('New Graph', () => this.keyMenuOut.emit({kind: DACommandType.NEW_GRAPH})),
      // Vault flows are the primary Open/Save; the picker/blob flows are
      // explicit interop with files outside the vault (and the non-Chromium
      // fallback), hence Import/Export.
      [misc.openFile]: new LabeledAction('Import File…', () => this.keyMenuOut.emit({kind: DACommandType.OPEN_FILE})),
      [misc.saveFileAs]: new LabeledAction('Export File…', () => this.keyMenuOut.emit({kind: DACommandType.SAVE_FILE_AS})),
      [misc.exportZip]: new LabeledAction('Export Zip…', () => this.keyMenuOut.emit({kind: DACommandType.EXPORT_ZIP})),
      [misc.cycleDisplay]: new LabeledAction('Cycle Display', () => this.keyMenuOut.emit({kind: DACommandType.CYCLE_DISPLAY})),
      [misc.todoGraphType]: new LabeledAction('Todo Graph', () => this.keyMenuOut.emit({kind: DACommandType.SET_DIAGRAM_TYPE, typeId: 'todo-graph'})),
      [misc.connectVault]: new LabeledAction('Vault: Connect…', () => this.keyMenuOut.emit({kind: DACommandType.CONNECT_VAULT})),
      [misc.vaultOpen]: new LabeledAction('Open…', () => this.keyMenuOut.emit({kind: DACommandType.VAULT_OPEN})),
      [misc.vaultSaveAs]: new LabeledAction('Save As…', () => this.keyMenuOut.emit({kind: DACommandType.VAULT_SAVE_AS})),
      [misc.toggleKeyProfile]: new LabeledAction(`→ ${otherProfileLabel}`, () => {
        this.keyboardConfig.keyProfile = this.keyboardConfig.keyProfile === 'vim' ? 'ijkl' : 'vim';
      }),
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

  /** These cards are display-only: the drawing area or DOM popup owns the
   *  actual listeners while `suspended` is true. Keeping them as ordinary
   *  keymenu modes reuses the physical-key layout and visual vocabulary. */
  private surfaceAction(label: string): LabeledAction {
    return new LabeledAction(label, () => undefined, false);
  }

  private buildNavPopupSurfaceConfig(): SubmenuConfig {
    return {
      'j': this.surfaceAction('Next'),
      'k': this.surfaceAction('Previous'),
      'Enter': this.surfaceAction('Jump / Select'),
      'Tab': this.surfaceAction('Walk + Continue'),
      '[': this.surfaceAction('Esc: Back / Close'),
    } as SubmenuConfig;
  }

  private buildGrowTargetingSurfaceConfig(): SubmenuConfig {
    const m = this.keyAssignments.movement;
    return {
      [m.up]: this.surfaceAction('Target Up'),
      [m.left]: this.surfaceAction('Target Left'),
      [m.down]: this.surfaceAction('Target Down'),
      [m.right]: this.surfaceAction('Target Right'),
      [this.keyAssignments.insert.label]: this.surfaceAction('Choose Node Type'),
      [this.keyAssignments.select.cycleDirection]: this.surfaceAction('Cycle Direction'),
      [this.keyAssignments.search.open]: this.surfaceAction('Find Target'),
      [this.keyAssignments.root.editSubmenu]: this.surfaceAction('Release: Commit'),
    } as SubmenuConfig;
  }

  private buildGrowEmptySurfaceConfig(): SubmenuConfig {
    return {
      [this.keyAssignments.insert.label]: this.surfaceAction('Choose Node Type'),
      [this.keyAssignments.root.editSubmenu]: this.surfaceAction('Release: Quick Add'),
    } as SubmenuConfig;
  }

  private buildGrowTargetPopupSurfaceConfig(): SubmenuConfig {
    return {
      'j': this.surfaceAction('Next Result'),
      'k': this.surfaceAction('Previous Result'),
      'Enter': this.surfaceAction('Connect'),
      '[': this.surfaceAction('Esc: Cancel Add'),
    } as SubmenuConfig;
  }

  private buildGrowTypePopupSurfaceConfig(): SubmenuConfig {
    return {
      'j': this.surfaceAction('Next Type'),
      'k': this.surfaceAction('Previous Type'),
      [this.keyAssignments.insert.label]: this.surfaceAction('Release: Select'),
      'Enter': this.surfaceAction('Select Type'),
      '[': this.surfaceAction('Esc: Cancel Add'),
    } as SubmenuConfig;
  }

  private buildGrowPlacementSurfaceConfig(): SubmenuConfig {
    const m = this.keyAssignments.movement;
    return {
      [m.up]: this.surfaceAction('Place Up'),
      [m.left]: this.surfaceAction('Place Left'),
      [m.down]: this.surfaceAction('Place Down'),
      [m.right]: this.surfaceAction('Place Right'),
      [this.keyAssignments.moveSpeed.bigger]: this.surfaceAction('Coarse'),
      [this.keyAssignments.moveSpeed.smaller]: this.surfaceAction('Fine'),
      [this.keyAssignments.root.editSubmenu]: this.surfaceAction('Release: Commit'),
      'Enter': this.surfaceAction('Commit'),
      '[': this.surfaceAction('Esc: Cancel Add'),
    } as SubmenuConfig;
  }

  private static readonly SURFACE_MODES: Record<KeyboardSurface, string> = {
    'nav-popup': 'surfaceNavPopup',
    'grow-targeting': 'surfaceGrowTargeting',
    'grow-empty': 'surfaceGrowEmpty',
    'grow-target-popup': 'surfaceGrowTargetPopup',
    'grow-type-popup': 'surfaceGrowTypePopup',
    'grow-placement': 'surfaceGrowPlacement',
  };

  /** While another interaction surface owns the keyboard, render that
   *  surface's live controls but leave event handling to its owner. On first
   *  suspension, flush held-key bookkeeping so an opener key cannot stick
   *  while its release is swallowed. */
  setSuspended(suspended: boolean, surface?: KeyboardSurface): void {
    if (!this.keyMenu) return;
    if (suspended) {
      if (!surface) return;
      if (!this.suspended) {
        this.modeBeforeSuspend = this.keyMenu.currentMode.name;
        this.keyMenu.cancelAllInputState();
      }
      this.suspended = true;
      this.activeSurface = surface;
      this.keyMenu.switchMode(KeymenuComponent.SURFACE_MODES[surface]);
      return;
    }

    if (!this.suspended) return;
    this.suspended = false;
    const restore = this.modeBeforeSuspend ?? 'normal';
    this.modeBeforeSuspend = null;
    this.activeSurface = null;
    this.keyMenu.switchMode(restore);
  }

  /** Switch keymenu mode and update the mode label. Called by AppComponent. */
  switchMode(modeName: string): void {
    if (this.suspended) {
      this.modeBeforeSuspend = modeName;
      return;
    }
    this.keyMenu.switchMode(modeName);
  }

  /** Whether the keymenu is currently in a CapsLock mode. */
  get isCapsMode(): boolean {
    const name = this.suspended && this.modeBeforeSuspend
      ? this.modeBeforeSuspend
      : this.keyMenu.currentMode.name;
    return name === 'normalCaps' || name === 'labelEditCaps' || name === 'labelEditVimNormalCaps';
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
    normal: '#5b9bd5',              // blue
    normalCaps: '#ed7d31',          // orange
    labelEdit: '#70ad47',           // green
    labelEditCaps: '#ed7d31',       // orange
    labelEditVimNormal: '#ffd966',  // yellow
    labelEditVimNormalCaps: '#ed7d31', // orange
    surfaceNavPopup: '#9b59b6',
    surfaceGrowTargeting: '#00a6a6',
    surfaceGrowEmpty: '#00a6a6',
    surfaceGrowTargetPopup: '#9b59b6',
    surfaceGrowTypePopup: '#9b59b6',
    surfaceGrowPlacement: '#00a6a6',
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
    } else if (modeName === 'labelEditVimNormal') {
      displayName = 'edit: normal';
    } else if (modeName === 'labelEditVimNormalCaps') {
      displayName = 'capslock / edit: normal';
    } else if (modeName === 'normalCaps') {
      displayName = 'capslock / normal';
    } else if (modeName === 'surfaceNavPopup') {
      displayName = 'go > choose destination';
    } else if (modeName === 'surfaceGrowTargeting') {
      displayName = 'add > choose target';
    } else if (modeName === 'surfaceGrowEmpty') {
      displayName = 'add > empty canvas';
    } else if (modeName === 'surfaceGrowTargetPopup') {
      displayName = 'add > find target';
    } else if (modeName === 'surfaceGrowTypePopup') {
      displayName = 'add > choose node type';
    } else if (modeName === 'surfaceGrowPlacement') {
      displayName = 'add > place node';
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
    if (event.key !== 'Shift') {
      if (!event.repeat) {
        this.lastShiftPressedAt = 0;
        this.clearShiftTimingBar();
      }
      return false;
    }
    if (event.repeat) {
      return false;
    }

    const now = Date.now();
    const isDoubleShift = now - this.lastShiftPressedAt <= this.DOUBLE_SHIFT_INTERVAL_MS;
    this.lastShiftPressedAt = now;

    const modeName = this.keyMenu.currentMode.name;
    const inLabelEdit = modeName === 'labelEdit' || modeName === 'labelEditCaps'
      || modeName === 'labelEditVimNormal' || modeName === 'labelEditVimNormalCaps';

    if (!isDoubleShift) {
      // First shift press in edit mode — show the timing bar
      if (inLabelEdit) {
        this.showShiftTimingBar();
      }
      return false;
    }

    // Double-shift detected — clear timing bar and exit
    this.clearShiftTimingBar();

    if (inLabelEdit) {
      this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
    }

    const targetMode = (modeName === 'labelEditCaps' || modeName === 'labelEditVimNormalCaps') ? 'normalCaps' : 'normal';
    this.switchMode(targetMode);
    this.resetInteractionState();
    this.resetHelpMode();
    return true;
  }

  private showShiftTimingBar(): void {
    this.clearShiftTimingBar();

    // Find the Shift key in the active submenu
    const currentMode = this.keyMenu.currentMode;
    if (!(currentMode instanceof USQwertyMode)) return;
    const rootSubmenu = currentMode.stack[0];
    const shiftKey = rootSubmenu.keys['Shift' as KeyString] ?? rootSubmenu.keys['RShift' as KeyString];
    if (!shiftKey) return;

    const keyWidth = getKeyWidth('Shift' as KeyString);
    const barHeight = 4;

    // Create the bar at the bottom of the shift key
    this.shiftTimingBar = new Konva.Rect({
      x: 0,
      y: KEY_HEIGHT - barHeight,
      width: keyWidth,
      height: barHeight,
      fill: '#70ad47',
      cornerRadius: 2,
      listening: false,
    });
    shiftKey.konvaGroup.add(this.shiftTimingBar);

    // Animate shrinking from full width to 0
    this.shiftTimingTween = new Konva.Tween({
      node: this.shiftTimingBar,
      width: 0,
      duration: this.DOUBLE_SHIFT_INTERVAL_MS / 1000,
      easing: Konva.Easings.Linear,
    });
    this.shiftTimingTween.play();

    // Auto-remove after interval
    this.shiftTimingTimeout = window.setTimeout(() => {
      this.clearShiftTimingBar();
    }, this.DOUBLE_SHIFT_INTERVAL_MS);
  }

  private clearShiftTimingBar(): void {
    if (this.shiftTimingTween) {
      this.shiftTimingTween.destroy();
      this.shiftTimingTween = null;
    }
    if (this.shiftTimingBar) {
      this.shiftTimingBar.destroy();
      this.shiftTimingBar = null;
      this.keyMenu.layer.batchDraw();
    }
    if (this.shiftTimingTimeout !== null) {
      clearTimeout(this.shiftTimingTimeout);
      this.shiftTimingTimeout = null;
    }
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
    this.keyMenu.cancelAllInputState();
    this.resetInteractionState();
    this.resetHelpMode();
    this.refreshActiveKeyPath();
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
    if (!this.keyMenu || this.suspended) {
      return;
    }
    event = this.remapEvent(event);

    const eventKey = KeymenuComponent.normalizeEventKey(event);
    if (!this.visible && eventKey === this.keyAssignments.root.toggleVisibility) {
      event.preventDefault();
      if (!event.repeat) {
        this.visibilityToggle.emit();
      }
      return;
    }

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
    // Ctrl+O / Ctrl+I: vim-style jumplist over the nav history (normal mode
    // only). Intercepted unconditionally — Ctrl+O's browser default is the
    // Open File dialog, which must never fire.
    if (event.ctrlKey && this.keyMenu.currentMode.name === 'normal'
        && (event.key.toLowerCase() === 'o' || event.key.toLowerCase() === 'i')) {
      event.preventDefault();
      this.keyMenuOut.emit({kind: event.key.toLowerCase() === 'o'
        ? DACommandType.NAV_HISTORY_BACK : DACommandType.NAV_HISTORY_FORWARD});
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

    const currentModeName = this.keyMenu.currentMode.name;
    const inLabelEdit = currentModeName === 'labelEdit' || currentModeName === 'labelEditCaps';
    const inLabelEditVimNormal = currentModeName === 'labelEditVimNormal' || currentModeName === 'labelEditVimNormalCaps';

    if (inLabelEdit) {
      const capsMode = currentModeName === 'labelEditCaps';
      if (event.key === 'Escape' || (event.key === '[' && event.ctrlKey && !ctrlSubmenuActive)) {
        // First Escape in insert mode → enter vim-normal mode within label edit
        this.switchMode(capsMode ? 'labelEditVimNormalCaps' : 'labelEditVimNormal');
        this.labelEditModeOut.emit('vimNormal');
        return;
      }
      if (event.key === 'Enter' && event.shiftKey) {
        this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
        this.switchMode(capsMode ? 'normalCaps' : 'normal');
        return;
      }
    }

    if (inLabelEditVimNormal) {
      const capsMode = currentModeName === 'labelEditVimNormalCaps';
      if (event.key === 'Escape' || (event.key === '[' && event.ctrlKey && !ctrlSubmenuActive)) {
        // Second Escape → exit label edit entirely
        this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
        this.switchMode(capsMode ? 'normalCaps' : 'normal');
        return;
      }
    }

    if (this.keyMenu.currentMode.name === 'normal') {
      if (event.key === 'Escape' || (event.key === '[' && event.ctrlKey && !ctrlSubmenuActive)) {
        this.keyMenuOut.emit({kind: DACommandType.UNSELECT_ALL});
        return;
      }

    }

    // Track when the edit submenu key is pressed so tap-to-edit works on keyup
    // Only at root level — if we're inside a submenu, 'i' may be zoom or something else
    const currentMode = this.keyMenu.currentMode;
    const atRootLevel = currentMode instanceof USQwertyMode && currentMode.stack.length === 1;
    const editKeyPressedAtRoot = currentMode.name === 'normal' && !event.repeat && atRootLevel &&
        eventKey === this.keyAssignments.root.editSubmenu;
    if (editKeyPressedAtRoot) {
      // Over a node or empty canvas the drawing area takes the hold as grow mode
      // (suspending us synchronously via popup-state); otherwise we keep
      // the classic held hub submenu + tap-to-quick-add.
      const m = this.keyAssignments.movement;
      const insert = this.keyAssignments.insert;
      this.keyMenuOut.emit({kind: DACommandType.ENTER_ADD_MODE,
        holdKey: this.keyAssignments.root.editSubmenu,
        keys: {up: m.up, left: m.left, down: m.down, right: m.right,
               cycle: this.keyAssignments.select.cycleDirection,
               newNode: insert.label, search: this.keyAssignments.search.open,
               coarse: this.keyAssignments.moveSpeed.bigger,
               fine: this.keyAssignments.moveSpeed.smaller}});
      if (this.suspended) {
        return;
      }
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
    if (!this.keyMenu || this.suspended) {
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

    // Held-key release logic below only applies to plain releases: a
    // ctrl-chorded keyup (e.g. the /i of a Ctrl+I jumplist chord, whose
    // keydown was intercepted before the keymenu saw it) must not run the
    // edit/insert release branches.
    if (eventKey === this.keyAssignments.root.editSubmenu && !event.ctrlKey) {
      this.editContextActionFired = false;
      // Capture-and-clear so the flag can never leak into a later interaction.
      const labelAdded = this.labelAddActive;
      this.labelAddActive = false;
      // A node was created from the held edit-key submenu → enter labelEdit on
      // release (same rhythm as the insert-submenu flow).
      if (this.insertViaEditActive) {
        this.insertViaEditActive = false;
        this.switchMode('labelEdit');
        return;
      }
      // A label was added from the held edit-key submenu → type into it.
      if (labelAdded) {
        this.switchMode('labelEdit');
        return;
      }
      // Tap without selecting a child → context-sensitive default action
      if (this.editPending) {
        this.editPending = false;
        this.keyMenuOut.emit({kind: DACommandType.QUICK_ADD});
        return;
      }
    }

    if (this.selectDragHoldActive && eventKey === this.keyAssignments.root.selectDragSubmenu) {
      this.selectDragHoldActive = false;
      this.keyMenuOut.emit({kind: DACommandType.EXIT_DRAG_MODE});
    }

    if (this.moveByNodeHoldActive && eventKey === this.keyAssignments.moveByNode.submenu) {
      this.moveByNodeHoldActive = false;
      this.keyMenuOut.emit({kind: DACommandType.HIDE_NODE_GRID});
    } else if (this.moveByNodeHoldActive &&
               (eventKey === this.keyAssignments.moveSpeed.bigger ||
                eventKey === this.keyAssignments.moveSpeed.smaller)) {
      // Releasing a tier modifier returns to the default nodes+labels grid
      // while the move-by-node root key remains held.
      this.keyMenuOut.emit({kind: DACommandType.SHOW_NODE_GRID, targets: 'labels'});
    }
  }
}
