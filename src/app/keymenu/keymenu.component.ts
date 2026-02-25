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
} from './config/key-assignments';

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
  @Input() keyAssignments: KeymenuKeyAssignments = DEFAULT_KEYMENU_KEY_ASSIGNMENTS;
  @Output() keyMenuOut = new EventEmitter<DACommand>();

  private keyMenu!: KeyMenu<DACommand>;
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  // State: when true, releasing the insert submenu key switches to labelEdit
  private insertDragActive = false;
  private selectDragHoldActive = false;
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
    const zoomKeys = this.getPairKeyHint(this.keyAssignments.zoom.out, this.keyAssignments.zoom.in);
    const root = this.keyAssignments.root;
    const shared = this.keyAssignments.shared;

    return [
      {key: movementKeys, action: 'Move up/left/down/right'},
      {key: zoomKeys, action: 'Zoom - / +'},
      {key: root.insertSubmenu, action: 'Insert submenu'},
      {key: `${root.selectDragSubmenu} (hold)`, action: 'Select + drag'},
      {key: shared.recenterSubmenu, action: 'View submenu'},
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['keyAssignments'] && this.keyMenu) {
      this.rebuildKeyMenu();
    }
  }

  ngOnDestroy(): void {
    if (this.keyMenu) {
      this.keyMenu.destroy();
    }
  }

  private rebuildKeyMenu() {
    if (this.keyMenu) {
      this.keyMenu.destroy();
    }

    this.insertDragActive = false;
    this.selectDragHoldActive = false;
    this.keyMenu = new KeyMenu<DACommand>({
      containerId: 'keyMenu',
      containingHTMLElement: this.componentNE,
      initialModeName: 'normal',
      modes: {
        normal: new USQwertyModeConfig(this.buildRootSubmenuConfig()),
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
    const newSubmenu = new KMSubmenu(mode, newSubmenuConfig);

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
      }
    );
  }

  private buildRootSubmenuConfig(): SubmenuConfig {
    const movement = this.keyAssignments.movement;
    const zoom = this.keyAssignments.zoom;
    const root = this.keyAssignments.root;

    return {
      [movement.up]: new LabeledAction('Move Up', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP})),
      [movement.left]: new LabeledAction('Move Left', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT})),
      [movement.down]: new LabeledAction('Move Down', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN})),
      [movement.right]: new LabeledAction('Move Right', () => this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT})),

      [zoom.out]: new LabeledAction('Zoom Out', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT})),
      [zoom.in]: new LabeledAction('Zoom In', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN})),

      [root.editSubmenu]: new LabeledAction('Edit', () => this.keyMenuOut.emit({kind: DACommandType.EDIT_SELECTED})),
      [root.insertSubmenu]: new LabeledSubmenuConfig('Insert...', this.buildInsertSubmenuConfig()),
      [root.selectDragSubmenu]: this.buildSelectDragSubmenuRootAction(),
      ...this.buildSharedUtilityBindings(),
    } as SubmenuConfig;
  }


  private buildInsertSubmenuConfig(): SubmenuConfig {
    const insert = this.keyAssignments.insert;

    return {
      [insert.node]: new LabeledAction('...Node', () => {
        if (this.insertDragActive) return;
        this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
        this.insertDragActive = true;
        const mode = this.keyMenu.currentMode as USQwertyMode<DACommand>;
        mode.actionSchedulingEnabled = false;
        mode.replaceTopSubmenu(this.dragSubmenuConfig);
        queueMicrotask(() => { mode.actionSchedulingEnabled = true; });
      }),
      [insert.waypoint]: new LabeledAction('...Waypoint', () => {
        this.keyMenuOut.emit({kind: DACommandType.ADD_WAYPOINT});
      }),
      [insert.edge]: new LabeledAction('...Edge', () => {
        this.keyMenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});
      }),
      [insert.label]: new LabeledAction('...Label', () => {
        this.keyMenuOut.emit({kind: DACommandType.ADD_LABEL});
      }),
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

    return {
      [drag.up]: new LabeledAction('Drag Up', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_UP})),
      [drag.left]: new LabeledAction('Drag Left', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_LEFT})),
      [drag.down]: new LabeledAction('Drag Down', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_DOWN})),
      [drag.right]: new LabeledAction('Drag Right', () => this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_RIGHT})),
      [zoom.out]: new LabeledAction('Zoom Out', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT})),
      [zoom.in]: new LabeledAction('Zoom In', () => this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN})),
      [shared.delete]: new LabeledAction('Delete', () => this.keyMenuOut.emit({kind: DACommandType.DELETE})),
    } as SubmenuConfig;
  }

  private buildSharedUtilityBindings(): SubmenuConfig {
    const shared = this.keyAssignments.shared;

    return {
      [shared.connect]: new LabeledAction('Connect', () => this.keyMenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES})),
      [shared.delete]: new LabeledAction('Delete', () => this.keyMenuOut.emit({kind: DACommandType.DELETE})),
      [shared.recenterSubmenu]: new LabeledSubmenuConfig('View...', this.buildViewSubmenuConfig()),
      [shared.select]: new LabeledAction('Clear Selection', () => this.keyMenuOut.emit({kind: DACommandType.UNSELECT_ALL})),
    } as SubmenuConfig;
  }

  private buildViewSubmenuConfig(): SubmenuConfig {
    const recenter = this.keyAssignments.recenter;
    const shared = this.keyAssignments.shared;

    return {
      [shared.toggleWaypointVisibility]: new LabeledAction('Toggle Waypoints', () => this.keyMenuOut.emit({kind: DACommandType.TOGGLE_WAYPOINT_VISIBILITY})),
      [recenter.view]: new LabeledAction('Recenter View', () => this.keyMenuOut.emit({kind: DACommandType.RECENTER_VIEW})),
      [recenter.crosshairs]: new LabeledAction('Recenter Crosshairs', () => this.keyMenuOut.emit({kind: DACommandType.RECENTER_CROSSHAIRS})),
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
    this.selectDragHoldActive = false;
    this.refreshActiveKeyPath();
    return true;
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.keyMenu) {
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
    }

    this.keyMenu.handleKeyDown(event);
    this.refreshActiveKeyPath();
  }

  @HostListener('document:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    if (!this.keyMenu) {
      return;
    }

    this.keyMenu.handleKeyUp(event);
    this.refreshActiveKeyPath();

    if (this.selectDragHoldActive && event.key === this.keyAssignments.root.selectDragSubmenu) {
      this.selectDragHoldActive = false;
      this.keyMenuOut.emit({kind: DACommandType.EXIT_DRAG_MODE});
    }

    // After insert+drag: releasing the submenu key switches to label edit
    if (this.insertDragActive && event.key === this.keyAssignments.root.insertSubmenu) {
      this.insertDragActive = false;
      this.keyMenu.switchMode('labelEdit');
    }
  }
}
