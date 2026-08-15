import {Component, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {HeaderComponent} from './header/header.component';
import {DrawingAreaComponent} from './drawing-area/drawing-area.component';
import {KeymenuComponent} from './keymenu/keymenu.component';
import {CompactKeymenuComponent, CompactMenuRow} from './keymenu/compact/compact-keymenu.component';
import {Subject, Subscription} from 'rxjs';
import {DACommand, DACommandType, TextCursorMode} from './drawing-area/command.model';
import {DANotification} from './drawing-area/da-notification.model';
import {DebugLogService} from './services/debug-log.service';
import {KeyboardConfigService} from './services/keyboard-config.service';
import {ThemeService} from './services/theme.service';
import {KeymenuKeyAssignments, IJKL_KEYMENU_KEY_ASSIGNMENTS, VIM_KEYMENU_KEY_ASSIGNMENTS} from './keymenu/config/key-assignments';

/** How the keymenu presents itself: the classic keyboard overlay, the
 *  compact file-picker-style tree (da-200), or nothing. The toggle key
 *  cycles through all three; key handling runs identically in each. */
export type KeymenuDisplay = 'keyboard' | 'compact' | 'hidden';

@Component({
  selector: 'app-root',
  imports: [HeaderComponent, DrawingAreaComponent, KeymenuComponent, CompactKeymenuComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  private log = inject(DebugLogService);
  private keyboardConfig = inject(KeyboardConfigService);
  private themeService = inject(ThemeService);

  @ViewChild(KeymenuComponent) keymenuComponent!: KeymenuComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;

  movementSpeed = 50;
  canEdit = false;
  keymenuDisplay: KeymenuDisplay = 'keyboard';
  compactRows: CompactMenuRow[] = [];
  compactModeName = '';
  keyAssignments: KeymenuKeyAssignments = this.profileToAssignments(this.keyboardConfig.keyProfile);

  get keymenuVisible(): boolean {
    return this.keymenuDisplay === 'keyboard';
  }

  get darkTheme(): boolean {
    return this.themeService.theme === 'dark';
  }

  private configSub?: Subscription;
  commandsSubject: Subject<DACommand> = new Subject<DACommand>();

  ngOnInit() {
    this.configSub = this.keyboardConfig.configChanged$.subscribe(() => {
      this.keyAssignments = this.profileToAssignments(this.keyboardConfig.keyProfile);
    });
  }

  ngOnDestroy() {
    this.configSub?.unsubscribe();
  }

  private profileToAssignments(profile: string): KeymenuKeyAssignments {
    return profile === 'ijkl' ? IJKL_KEYMENU_KEY_ASSIGNMENTS : VIM_KEYMENU_KEY_ASSIGNMENTS;
  }

  onCanEditChange(canEdit: boolean) {
    this.canEdit = canEdit;
  }

  relayKeymenuCommand(kmCommand: DACommand) {
    this.log.log("app component kmCommand: " + JSON.stringify(kmCommand))
    this.commandsSubject.next(kmCommand);
  }

  toggleKeymenuVisibility() {
    this.keymenuDisplay = this.keymenuDisplay === 'keyboard' ? 'compact'
      : this.keymenuDisplay === 'compact' ? 'hidden'
      : 'keyboard';
  }

  onCompactModel(model: {rows: CompactMenuRow[]; modeName: string}) {
    this.compactRows = model.rows;
    this.compactModeName = model.modeName;
  }

  handleLabelEditModeChange(subMode: TextCursorMode) {
    this.commandsSubject.next({kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: subMode});
    if (this.headerComponent) {
      this.headerComponent.mode = subMode === 'vimNormal'
        ? 'labelEditVimNormal'
        : subMode === 'vimVisual' ? 'labelEditVimVisual' : 'labelEdit';
    }
  }

  handleDANotification(daNotification: DANotification) {

    switch (daNotification.kind) {
      case "started-label-editing-mode":
        this.keymenuComponent.enterLabelEditMode(daNotification.mode);
        this.commandsSubject.next({kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: daNotification.mode});
        if (this.headerComponent) {
          this.headerComponent.mode = daNotification.mode === 'vimNormal'
            ? 'labelEditVimNormal'
            : 'labelEdit';
        }
        break;
      case "label-added":
        this.keymenuComponent.notifyLabelAdded();
        break;
      case "node-inserted":
        this.keymenuComponent.notifyNodeInserted(daNotification.labelable);
        break;
      case "exit-label-editing-mode":
        this.keymenuComponent.exitToNormalMode();
        if (this.headerComponent) this.headerComponent.mode = 'normal';
        break;
      case "context-state-update":
        if (this.headerComponent) {
          this.headerComponent.selectionSummary = daNotification.selectionSummary;
          this.headerComponent.totalNodes = daNotification.totalNodes;
          this.headerComponent.totalEdges = daNotification.totalEdges;
          this.headerComponent.defaultNodeShape = daNotification.defaultNodeShape;
          this.headerComponent.defaultEdgeDirectedness = daNotification.defaultEdgeDirectedness;
          this.headerComponent.defaultLineStyle = daNotification.defaultLineStyle;
          this.headerComponent.canUndo = daNotification.canUndo;
          this.headerComponent.canRedo = daNotification.canRedo;
        }
        break;
      case "status-message":
        if (this.headerComponent) {
          this.headerComponent.showStatusMessage(daNotification.message);
        }
        break;
      case "file-state-update":
        if (this.headerComponent) {
          this.headerComponent.openFileLabel = daNotification.fileLabel;
        }
        break;
      case "popup-state":
        // A DOM popup (nav popup) owns the keyboard while open.
        this.keymenuComponent.setSuspended(
          daNotification.open,
          daNotification.open ? daNotification.surface : undefined,
        );
        break;
    }
  }

  onZoomLevelChange(level: number) {
    if (this.headerComponent) {
      this.headerComponent.onZoomLevelChange(level);
    }
  }

  onMovementSpeedChange(speed: number) {
    this.movementSpeed = speed;
  }

  onLoadSampleGraph(graphId: string) {
    this.commandsSubject.next({kind: DACommandType.LOAD_SAMPLE_GRAPH, graphId});
  }
}
