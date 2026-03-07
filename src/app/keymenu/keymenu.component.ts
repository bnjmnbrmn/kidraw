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
import {DACommand, DACommandType} from '../drawing-area/command.model';
import {KeyMenu} from '../lib/keymenu/keyMenu';
import {USQwertyMode, USQwertyModeConfig} from '../lib/keymenu/modes/us-qwerty';
import {PrintedInstructionKeyMenuModeConfig} from '../lib/keymenu/printedInstructionKMMode/printedInstructionKMMode';
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

import {KMSubmenu} from '../lib/keymenu/keys/kmSubmenu';
import {KMSubmenuKey} from '../lib/keymenu/keys/kmKey';

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

  @Input() movementSpeed = 50;
  @Input() canEdit = false;
  @Input() keyAssignments: KeymenuKeyAssignments = VIM_KEYMENU_KEY_ASSIGNMENTS;
  @Output() keyMenuOut = new EventEmitter<DACommand>();

  private keyMenu!: KeyMenu<DACommand>;
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private log = inject(DebugLogService);
  private themeService = inject(ThemeService);
  private keyboardConfig = inject(KeyboardConfigService);
  private themeSub?: Subscription;

  // State: when true, releasing the insert submenu key switches to labelEdit
  private insertDragActive = false;
  // Pending-action-on-release: set when node key is pressed, cleared by directional action or node key release
  private insertNodePending = false;
  private selectDragHoldActive = false;
  private directedEdgeActive = false;
  private lastShiftPressedAt = 0;

  private readonly DOUBLE_SHIFT_INTERVAL_MS = 325;

  readonly MIN_STEERING_SPEED = 20;
  readonly MAX_STEERING_SPEED = 200;
  activeKeyPath: string[] = [];

  private get dragSubmenuConfig(): SubmenuConfig {
    const drag = this.keyAssignments.drag;
    const zoom = this.keyAssignments.zoom;
    const shared = this.keyAssignments.shared;

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
      [zoom.out]: new LabeledAction('Zoom Out', () => {
        this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
      }),
      [zoom.in]: new LabeledAction('Zoom In', () => {
        this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
      }),
      [shared.delete]: new LabeledAction('Delete', () => {
        this.keyMenuOut.emit({kind: DACommandType.DELETE});
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
      {key: shared.navSubmenu, action: 'Nav submenu'},
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['keyAssignments'] && this.keyMenu) {
      this.rebuildKeyMenu();
    }
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    if (this.keyMenu) {
      this.keyMenu.destroy();
    }
  }

  private rebuildKeyMenu() {
    if (this.keyMenu) {
      this.keyMenu.destroy();
    }

    this.insertDragActive = false;
    this.insertNodePending = false;
    this.selectDragHoldActive = false;
    this.keyMenu = new KeyMenu<DACommand>({
      containerId: 'keyMenu',
      containingHTMLElement: this.componentNE,
      initialModeName: 'normal',
      stageBackground: this.themeService.palette.keymenuStageBackground,
      modes: {
        normal: new USQwertyModeConfig(this.buildRootSubmenuConfig(), this.themeService.palette),
        labelEdit: this.buildLabelEditModeConfig(),
      }
    });
    this.refreshActiveKeyPath();
  }

  openInsertSubmenu() {
    const mode = this.keyMenu.currentMode as USQwertyMode<DACommand>;
    const keyString = this.keyAssignments.root.insertSubmenu;
    const currentSubmenu = mode.stackTop;
    const existingKey = currentSubmenu.keys[keyString];

    if (!existingKey) {
      console.error(`Key ${keyString} not found in current submenu`);
      return;
    }

    // Create the new submenu manually
    const newSubmenuConfig = this.buildInsertSubmenuConfig();
    const depth = mode.stack.length;
    const newSubmenu = new KMSubmenu(mode, newSubmenuConfig, depth, this.themeService.palette, keyString as any);

    // Create a synthetic SubmenuKey that reuses the existing key's visuals
    const fakeSubmenuKey: KMSubmenuKey = {
      keyString: keyString,
      label: existingKey.label,
      konvaGroup: existingKey.konvaGroup,
      highlight: existingKey.highlight,
      submenu: newSubmenu
    };

    mode.pushSubmenu(fakeSubmenuKey);
  }

  private buildLabelEditModeConfig(): PrintedInstructionKeyMenuModeConfig<DACommand> {
    return new PrintedInstructionKeyMenuModeConfig(
      'Insert/edit text.  Use Shift-Shift, ESC or Ctrl-[ to return to Normal mode.',
      (keyDownEvent: KeyboardEvent) => {
        const key = keyDownEvent.key;
        if ((key === 'Enter' && keyDownEvent.shiftKey)
          || (key === '[' && keyDownEvent.ctrlKey)
          || key === 'Escape') {
          this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
          this.keyMenu.switchMode('normal');
          return;
        }

        if (key === 'Backspace') {
          this.keyMenuOut.emit({kind: DACommandType.DELETE_LAST_CHAR});
          return;
        }

        if (key.length === 1 && key.match(/^[\P{Cc}\P{Cn}\P{Cs}]+$/gu)) {
          this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
          return;
        }

        if (key === 'Enter' && KeyMenu.noModifier(keyDownEvent)) {
          this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: '\n'});
          return;
        }

        if (key === 'Tab' && KeyMenu.noModifier(keyDownEvent)) {
          this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: '\t'});
        }
      },
      () => {
        // no-op
      },
      this.themeService.palette,
    );
  }

  private buildRootSubmenuConfig(): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const root = this.keyAssignments.root;

    return {
      [movement.up]: new LabeledAction('Move Up', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP})),
      [movement.left]: new LabeledAction('Move Left', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT})),
      [movement.down]: new LabeledAction('Move Down', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN})),
      [movement.right]: new LabeledAction('Move Right', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT})),

      [root.editSubmenu]: new LabeledAction('Edit', () => this.keyMenuOut.emit({kind: DACommandType.EDIT_SELECTED})),
      [root.insertSubmenu]: new LabeledSubmenuConfig('Insert...', this.buildInsertSubmenuConfig()),
      [root.selectDragSubmenu]: this.buildSelectDragSubmenuRootAction(),
      ...this.buildSharedUtilityBindings(),
    } as SubmenuConfig;
  }


  private buildInsertSubmenuConfig(): SubmenuConfig {
    const insert = this.keyAssignments.insert;

    return {
      // Node key is a SubmenuAction: press sets pending flag, hold opens directional submenu.
      // On release (if no directional key pressed): creates node at crosshairs + drag mode.
      // If directional key pressed while held: creates directed node + drag mode, clears pending.
      [insert.node]: new LabeledActionSubmenuConfig('...Node', this.buildDirectionalInsertSubmenuConfig(), () => {
        this.log.log('[keymenu] node key pressed, insertDragActive:', this.insertDragActive);
        if (this.insertDragActive) return;
        this.insertNodePending = true;
        this.log.log('[keymenu] insertNodePending set to true');
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
      this.log.log('[keymenu] directional insert:', direction);
      this.insertNodePending = false;
      this.insertDragActive = true;
      this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE_DIRECTED, direction});
      const mode = this.keyMenu.currentMode as USQwertyMode<DACommand>;
      mode.actionSchedulingEnabled = false;
      mode.replaceTopSubmenu(this.dragSubmenuConfig);
      queueMicrotask(() => { mode.actionSchedulingEnabled = true; });
    };

    return {
      [movement.up]: new LabeledAction('Above', createDirected('up')),
      [movement.down]: new LabeledAction('Below', createDirected('down')),
      [movement.left]: new LabeledAction('Left', createDirected('left')),
      [movement.right]: new LabeledAction('Right', createDirected('right')),
    } as SubmenuConfig;
  }

  private buildDirectionalEdgeSubmenuConfig(): SubmenuConfig {
    const nodeJump = this.keyAssignments.nav.nodeJump;

    const setDestination = (direction: 'up' | 'down' | 'left' | 'right') => () => {
      this.keyMenuOut.emit({kind: DACommandType.SET_EDGE_DESTINATION, direction});
    };

    return {
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
    const zoom = this.keyAssignments.zoom;
    const shared = this.keyAssignments.shared;
    const root = this.keyAssignments.root;

    return {
      [drag.up]: new LabeledAction('Drag Up', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_UP})),
      [drag.left]: new LabeledAction('Drag Left', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_LEFT})),
      [drag.down]: new LabeledAction('Drag Down', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_DOWN})),
      [drag.right]: new LabeledAction('Drag Right', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_RIGHT})),
      [zoom.out]: new LabeledAction('Zoom Out', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT})),
      [zoom.in]: new LabeledAction('Zoom In', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN})),
      [shared.delete]: new LabeledAction('Delete', () => this.keyMenuOut.emit({kind: DACommandType.DELETE})),
      [root.insertSubmenu]: new LabeledAction('Edit Item', () => this.keyMenuOut.emit({kind: DACommandType.EDIT_SELECTED})),
    } as SubmenuConfig;
  }

  private buildSharedUtilityBindings(): SubmenuConfig {
    const shared = this.keyAssignments.shared;

    return {
      [shared.delete]: new LabeledAction('Delete', () => this.keyMenuOut.emit({kind: DACommandType.DELETE})),
      [shared.navSubmenu]: new LabeledSubmenuConfig('Nav...', this.buildNavSubmenuConfig()),
      [shared.select]: new LabeledAction('Clear Selection', () => this.keyMenuOut.emit({kind: DACommandType.UNSELECT_ALL})),
      [shared.undo]: new LabeledAction('Undo', () => this.keyMenuOut.emit({kind: DACommandType.UNDO})),
    } as SubmenuConfig;
  }

  private buildNavSubmenuConfig(): SubmenuConfig {
    const nav = this.keyAssignments.nav;

    return {
      // Directional node jump
      [nav.nodeJump.left]: new LabeledAction('Node Left', () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_LEFT})),
      [nav.nodeJump.down]: new LabeledAction('Node Down', () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_DOWN})),
      [nav.nodeJump.up]: new LabeledAction('Node Up', () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_UP})),
      [nav.nodeJump.right]: new LabeledAction('Node Right', () => this.keyMenuOut.emit({kind: DACommandType.SNAP_TO_NODE_RIGHT})),
      // Zoom
      [nav.zoomIn]: new LabeledAction('Zoom In', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN})),
      [nav.zoomOut]: new LabeledAction('Zoom Out', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT})),
      // Edge traversal (outgoing; incoming via Shift handled in keydown intercept)
      [nav.outgoingNext]: new LabeledAction('Next Edge', () => this.keyMenuOut.emit({kind: DACommandType.TRAVERSE_OUTGOING_NEXT})),
      [nav.outgoingPrev]: new LabeledAction('Prev Edge', () => this.keyMenuOut.emit({kind: DACommandType.TRAVERSE_OUTGOING_PREV})),
      // Utility
      [nav.recenterView]: new LabeledAction('Recenter View', () => this.keyMenuOut.emit({kind: DACommandType.RECENTER_VIEW})),
      [nav.recenterCrosshairs]: new LabeledAction('Recenter Crosshairs', () => this.keyMenuOut.emit({kind: DACommandType.RECENTER_CROSSHAIRS})),
      [nav.toggleWaypoints]: new LabeledAction('Toggle Waypoints', () => this.keyMenuOut.emit({kind: DACommandType.TOGGLE_WAYPOINT_VISIBILITY})),
      [nav.reload]: new LabeledAction('Reload Page', () => window.location.reload()),
    } as SubmenuConfig;
  }

  private refreshActiveKeyPath() {
    const currentMode = this.keyMenu.currentMode;
    if (!(currentMode instanceof USQwertyMode)) {
      this.activeKeyPath = [];
      return;
    }

    this.activeKeyPath = currentMode.submenuKeyStringStack.filter((key) => key.length > 0);
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

    if (this.keyMenu.currentMode.name === 'labelEdit') {
      this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
    }

    this.keyMenu.switchMode('normal');
    this.insertDragActive = false;
    this.insertNodePending = false;
    this.selectDragHoldActive = false;
    this.refreshActiveKeyPath();
    return true;
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
    this.selectDragHoldActive = false;
    this.directedEdgeActive = false;
    this.insertDragActive = false;
    this.insertNodePending = false;
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
    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.keyMenuOut.emit({kind: DACommandType.REDO});
      } else {
        this.keyMenuOut.emit({kind: DACommandType.UNDO});
      }
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      this.keyMenuOut.emit({kind: DACommandType.REDO});
      return;
    }

    if (this.handleDoubleShiftReturnToNormal(event)) {
      return;
    }

    if (this.keyMenu.currentMode.name === 'normal') {
      if (event.key === 'Escape' || (event.key === '[' && event.ctrlKey)) {
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

    this.keyMenu.handleKeyDown(event);
    this.refreshActiveKeyPath();
  }

  @HostListener('document:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    if (!this.keyMenu) {
      return;
    }
    event = this.remapEvent(event);

    this.keyMenu.handleKeyUp(event);
    this.refreshActiveKeyPath();

    // If insert submenu key (f) is released, handle pending/drag states
    if (event.key === this.keyAssignments.root.insertSubmenu) {
      this.log.log('[keymenu] insert key released, insertNodePending:', this.insertNodePending, 'insertDragActive:', this.insertDragActive);
      // If node creation was pending (d pressed but not yet released), create the node now
      if (this.insertNodePending) {
        this.log.log('[keymenu] f released before d — creating node at crosshairs');
        this.insertNodePending = false;
        this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
        this.keyMenu.switchMode('labelEdit');
        return;
      }
      if (this.insertDragActive) {
        this.insertDragActive = false;
        this.keyMenu.switchMode('labelEdit');
      }
      return;
    }

    // Pending node insert: releasing node key without pressing a direction creates node at crosshairs.
    // Only fire if insert submenu key (f) is still held (we're still in the insert context).
    if (this.insertNodePending && event.key === this.keyAssignments.insert.node) {
      this.log.log('[keymenu] node key released with pending — creating node at crosshairs');
      this.insertNodePending = false;
      this.insertDragActive = true;
      this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
      const mode = this.keyMenu.currentMode as USQwertyMode<DACommand>;
      mode.actionSchedulingEnabled = false;
      mode.replaceTopSubmenu(this.dragSubmenuConfig);
      queueMicrotask(() => { mode.actionSchedulingEnabled = true; });
    } else if (event.key === this.keyAssignments.insert.node) {
      this.log.log('[keymenu] node key released but insertNodePending is false');
    }

    if (this.directedEdgeActive && event.key === this.keyAssignments.insert.edge) {
      this.directedEdgeActive = false;
      this.keyMenuOut.emit({kind: DACommandType.FINALIZE_DIRECTED_EDGE});
    }

    if (this.selectDragHoldActive && event.key === this.keyAssignments.root.selectDragSubmenu) {
      this.selectDragHoldActive = false;
      this.keyMenuOut.emit({kind: DACommandType.EXIT_DRAG_MODE});
    }
  }
}
