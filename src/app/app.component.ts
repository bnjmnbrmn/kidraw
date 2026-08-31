import {Component, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {HeaderComponent} from './header/header.component';
import {DrawingAreaComponent} from './drawing-area/drawing-area.component';
import {KeymenuComponent} from './keymenu/keymenu.component';
import {CompactKeymenuComponent, CompactMenuRow} from './keymenu/compact/compact-keymenu.component';
import {ExLineComponent} from './ex-line/ex-line.component';
import {Subject, Subscription} from 'rxjs';
import {DACommand, DACommandType, TextCursorMode} from './drawing-area/command.model';
import {DANotification} from './drawing-area/da-notification.model';
import {DebugLogService} from './services/debug-log.service';
import {KeyboardConfigService} from './services/keyboard-config.service';
import {ThemeService} from './services/theme.service';
import {VisualConfigService} from './services/visual-config.service';
import {CompactMenuSide} from './services/visual-config.model';
import {KeymenuKeyAssignments, IJKL_KEYMENU_KEY_ASSIGNMENTS, VIM_KEYMENU_KEY_ASSIGNMENTS} from './keymenu/config/key-assignments';

/** How the keymenu presents itself: the classic keyboard overlay, the
 *  compact file-picker-style tree (da-200), or nothing. The toggle key
 *  cycles through all three; key handling runs identically in each. */
export type KeymenuDisplay = 'keyboard' | 'compact' | 'hidden';

/** Gap between the compact panel and the drawing-area edge (matches the CSS
 *  inset), counted into the viewport inset so nothing hides behind it. */
const COMPACT_MENU_GUTTER = 10;
/** The floating header's top offset, height, and breathing room. */
const HEADER_VIEWPORT_INSET = 72;

@Component({
  selector: 'app-root',
  imports: [HeaderComponent, DrawingAreaComponent, KeymenuComponent, CompactKeymenuComponent,
            ExLineComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly headerInset = HEADER_VIEWPORT_INSET;
  private log = inject(DebugLogService);
  private keyboardConfig = inject(KeyboardConfigService);
  private themeService = inject(ThemeService);
  private visualConfig = inject(VisualConfigService);

  @ViewChild(KeymenuComponent) keymenuComponent!: KeymenuComponent;
  @ViewChild(ExLineComponent) exLineComponent?: ExLineComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;

  movementSpeed = 50;
  exLineOpen = false;
  exLineMessage = '';
  /** Ex-line command history. Lives here because the line is created and
   *  destroyed each time it opens. */
  exHistory: string[] = [];
  canEdit = false;
  keymenuDisplay: KeymenuDisplay = 'keyboard';
  compactRows: CompactMenuRow[] = [];
  compactHint = '';
  /** The keymenu's current mode and its colour, shown as a chip below the
   *  full menu and as the compact panel's header (da-432). */
  modeLabelText = '';
  modeLabelColor = '#888888';
  keyAssignments: KeymenuKeyAssignments = this.profileToAssignments(this.keyboardConfig.keyProfile);

  get keymenuVisible(): boolean {
    return this.keymenuDisplay === 'keyboard';
  }

  get darkTheme(): boolean {
    return this.themeService.theme === 'dark';
  }

  compactMenuSide: CompactMenuSide = this.visualConfig.config.compactMenu.side;
  compactMenuWidth = this.visualConfig.config.compactMenu.widthPx;

  /** What the compact panel measured on screen. It sizes itself to its rows,
   *  so the inset follows the real width rather than the configured cap. */
  compactMenuRenderedWidth = 0;

  onCompactWidth(width: number) {
    this.compactMenuRenderedWidth = width;
  }

  /** Width the compact panel occludes, or 0 when it isn't showing. The
   *  drawing area insets its usable viewport by this on the docked side. */
  get compactMenuInset(): number {
    if (this.keymenuDisplay !== 'compact') return 0;
    const width = this.compactMenuRenderedWidth || this.compactMenuWidth;
    return Math.min(width, this.compactMenuWidth) + COMPACT_MENU_GUTTER;
  }

  /** Height the floating keyboard card occludes at the bottom, or 0 when it
   *  isn't showing. Same contract as the compact panel: the canvas still
   *  spans the full area, but the crosshairs stop at the card's top edge
   *  and the view pans instead of sliding them underneath. Applied across
   *  the full width even though the card is centred — a viewport with a
   *  notch in it is not worth the complexity. */
  get keymenuInset(): number {
    return this.keymenuDisplay === 'keyboard' ? KeymenuComponent.occludedHeightPx() : 0;
  }

  private configSub?: Subscription;
  private visualSub?: Subscription;
  commandsSubject: Subject<DACommand> = new Subject<DACommand>();

  ngOnInit() {
    this.configSub = this.keyboardConfig.configChanged$.subscribe(() => {
      this.keyAssignments = this.profileToAssignments(this.keyboardConfig.keyProfile);
    });
    // Mirror the compact-menu settings into fields: the drawing area's
    // viewport inset is derived from them, so a Settings change has to
    // reach both the panel and the canvas.
    this.visualSub = this.visualConfig.configChanged$.subscribe(() => {
      this.compactMenuSide = this.visualConfig.config.compactMenu.side;
      this.compactMenuWidth = this.visualConfig.config.compactMenu.widthPx;
    });
  }

  ngOnDestroy() {
    this.configSub?.unsubscribe();
    this.visualSub?.unsubscribe();
  }

  private profileToAssignments(profile: string): KeymenuKeyAssignments {
    return profile === 'ijkl' ? IJKL_KEYMENU_KEY_ASSIGNMENTS : VIM_KEYMENU_KEY_ASSIGNMENTS;
  }

  onCanEditChange(canEdit: boolean) {
    this.canEdit = canEdit;
  }

  relayKeymenuCommand(kmCommand: DACommand) {
    this.log.log("app component kmCommand: " + JSON.stringify(kmCommand))
    if (kmCommand.kind === DACommandType.OPEN_EX_LINE) {
      this.openExLine();
      return;
    }
    this.commandsSubject.next(kmCommand);
  }

  /** Show the ex line and hand it the keyboard. The keymenu keeps its own
   *  listeners but ignores events aimed at the field. */
  openExLine(): void {
    this.exLineOpen = true;
    this.exLineMessage = '';
    setTimeout(() => this.exLineComponent?.open(), 0);
  }

  onExCommand(text: string): void {
    this.exLineOpen = false;
    this.exHistory.push(text);
    this.commandsSubject.next({kind: DACommandType.EX_COMMAND, text});
  }

  onExCancel(): void {
    this.exLineOpen = false;
  }

  toggleKeymenuVisibility() {
    this.keymenuDisplay = this.keymenuDisplay === 'keyboard' ? 'compact'
      : this.keymenuDisplay === 'compact' ? 'hidden'
      : 'keyboard';
  }

  /** Mirrors the keymenu's free-typing state: the toggle key is a plain
   *  letter there, so the hint has to send you through Escape first. */
  keymenuTyping = false;

  onKeymenuTextEntry(typing: boolean) {
    this.keymenuTyping = typing;
  }

  onCompactModel(model: {rows: CompactMenuRow[]; hint: string}) {
    this.compactRows = model.rows;
    this.compactHint = model.hint;
  }

  onModeLabel(label: {text: string; color: string}) {
    this.modeLabelText = label.text;
    this.modeLabelColor = label.color;
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
          this.headerComponent.fileState = daNotification.fileState;
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
