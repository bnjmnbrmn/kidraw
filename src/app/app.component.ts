import {AfterViewInit, Component, effect, HostListener, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
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
import {AGENT_PANEL_WIDTH, AgentStore} from './agent/agent-store';
import {DETAIL_LEVELS, DetailLevel} from './agent/agent-protocol';

/** Problems noted with :note, kept in this browser as well as the debug log. */
const NOTES_KEY = 'kidraw_notes_v1';
import {ReadingModeService} from './reading/reading-mode.service';
import {AgentPanelComponent} from './agent/agent-panel.component';
import {AgentOverlayComponent} from './agent/agent-overlay.component';

/** How the keymenu presents itself: the classic keyboard overlay, the
 *  compact file-picker-style tree (da-200), or nothing. The toggle key
 *  cycles through all three; key handling runs identically in each. */
export type KeymenuDisplay = 'keyboard' | 'compact' | 'hidden';

/** Gap between the compact panel and the drawing-area edge (matches the CSS
 *  inset), counted into the viewport inset so nothing hides behind it. */
const COMPACT_MENU_GUTTER = 10;
/** The floating header's top offset, height, and breathing room. */
const HEADER_VIEWPORT_INSET = 72;
const UNTITLED_GRAPH_REVISION_KEY = 'kidraw_untitled_graph_revision_v1';

@Component({
  selector: 'app-root',
  imports: [HeaderComponent, DrawingAreaComponent, KeymenuComponent, CompactKeymenuComponent,
            ExLineComponent, AgentPanelComponent, AgentOverlayComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly headerInset = HEADER_VIEWPORT_INSET;
  private log = inject(DebugLogService);
  private keyboardConfig = inject(KeyboardConfigService);
  private themeService = inject(ThemeService);
  private visualConfig = inject(VisualConfigService);
  readonly agent = inject(AgentStore);
  readonly reading = inject(ReadingModeService);

  @ViewChild(KeymenuComponent) keymenuComponent!: KeymenuComponent;
  @ViewChild(ExLineComponent) exLineComponent?: ExLineComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;
  @ViewChild(DrawingAreaComponent) drawingArea!: DrawingAreaComponent;

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
    // Typing hides the keyboard, so the graph gets that room back: the inset is
    // just the hint and the mode chip, and the box being edited is centred in
    // the window rather than in the band above a keyboard that is not there.
    if (this.keymenuTyping) return KeymenuComponent.typingOccludedHeightPx();
    return this.keymenuDisplay === 'keyboard' ? KeymenuComponent.occludedHeightPx() : 0;
  }

  /** Width the open agent chat panel occludes on the right. */
  get agentPanelInset(): number {
    return this.agent.panelOpen() ? AGENT_PANEL_WIDTH : 0;
  }

  /** Set while the agent chat holds the keyboard and the keymenu is suspended for it. */
  private agentSuspendedKeymenu = false;

  /** The agent chat takes the keyboard the way the nav popup does: the keymenu
   *  is suspended (held keys flushed, the chat's keys shown) until it lets go.
   *  Called synchronously by AgentStore, so no keystroke falls in between. */
  private syncKeymenuToAgentKeyboard(chatHasKeyboard: boolean): void {
    if (!this.keymenuComponent || chatHasKeyboard === this.agentSuspendedKeymenu) return;
    this.agentSuspendedKeymenu = chatHasKeyboard;
    this.keymenuComponent.setSuspended(chatHasKeyboard, chatHasKeyboard ? 'agent-panel' : undefined);
    // Back from the chat into reading mode: reading keeps the keyboard.
    if (!chatHasKeyboard && this.reading.active()) this.keymenuComponent.setSuspended(true, 'reading');
  }

  private enterReadingMode(): void {
    if (this.reading.enter()) this.keymenuComponent.setSuspended(true, 'reading');
  }

  /** Reading mode's keys (see KeymenuKeyAssignments.reading). The keymenu is
   *  suspended while reading, so these don't reach it; the chat and the ex line
   *  keep their own keys. */
  @HostListener('document:keydown', ['$event'])
  onReadingKeydown(event: KeyboardEvent): void {
    if (!this.reading.active() || this.agent.keyboardInPanel() || this.exLineOpen) return;
    // The chat handles its own keys first; its Esc hands the keyboard back to
    // reading and must not also stop reading as it bubbles up here.
    if (event.target instanceof Element && event.target.closest('app-agent-panel')) return;
    const escape = event.key === 'Escape' || (event.ctrlKey && event.key === '[');
    if (!escape && (event.ctrlKey || event.altKey || event.metaKey)) return;
    const keys = this.keyAssignments.reading;
    const key = event.key.toLowerCase();
    if (escape) {
      this.reading.exit();
      this.keymenuComponent.setSuspended(false);
    } else if (key === keys.next) {
      this.reading.next();
    } else if (key === keys.previous) {
      this.reading.previous();
    } else if (key === keys.why) {
      this.reading.why();
    } else if (key === keys.doesntFollow || key === keys.tooDetailed) {
      const kind = key === keys.doesntFollow ? 'doesnt-follow' : 'too-detailed';
      void this.reading.toggleMark(kind).then(result => {
        if (!result) return;
        const name = kind === 'doesnt-follow' ? "doesn't follow" : 'too detailed';
        const what = result.target === 'link' ? 'this link' : 'this statement';
        this.headerComponent?.showStatusMessage(result.marked
          ? `Marked ${what} "${name}". Keep reading; ${keys.send} sends your marks to the agent.`
          : `Cleared "${name}" on ${what}.`, 4000);
      });
    } else if (key === keys.link) {
      this.reading.nextLink();
    } else if (event.key === ':') {
      // The ex line (:note, :detail) works while reading, on the same key the keymenu uses.
      this.openExLine();
    } else if (key === keys.send) {
      const refs = this.reading.markedRefs();
      if (refs.length === 0) {
        this.headerComponent?.showStatusMessage(
          `Nothing marked: ${keys.doesntFollow} marks a step that doesn't follow, ${keys.tooDetailed} one that is too detailed.`, 4000);
      } else {
        this.agent.prefillFeedback(`Please address my feedback ${refs.length === 1 ? 'mark' : 'marks'}.`, refs);
      }
    } else {
      return;
    }
    event.preventDefault();
  }

  /** Agent notices go to the header, which is visible with the panel closed. */
  private readonly agentNotices = effect(() => {
    const notice = this.agent.notice();
    if (notice && this.headerComponent) this.headerComponent.showStatusMessage(notice.text, 3500);
  });

  /** Hints name the agent keys of the active profile; the Shift chords are fixed (architecture-key-profiles). */
  private updateAgentKeyLabels(): void {
    const keys = this.keyAssignments.agent;
    this.agent.keyLabels.set({
      chat: keys.chat,
      ask: keys.askAboutSelection,
      follow: `Shift+${keys.follow.toUpperCase()}`,
      close: `Shift+${keys.chat.toUpperCase()}`,
    });
  }

  /** The user is in the middle of something (typing, a popup, a non-normal
   *  mode): the agent points with a hint instead of moving the view. */
  private userIsEditing(): boolean {
    if (this.keymenuTyping) return true;
    const mode = this.modeLabelText;
    return !(mode === '' || mode.startsWith('normal') || mode.startsWith('capslock / normal')
      || mode.startsWith('agent chat'));
  }

  private configSub?: Subscription;
  private visualSub?: Subscription;
  commandsSubject: Subject<DACommand> = new Subject<DACommand>();

  ngOnInit() {
    this.updateAgentKeyLabels();
    this.configSub = this.keyboardConfig.configChanged$.subscribe(() => {
      this.keyAssignments = this.profileToAssignments(this.keyboardConfig.keyProfile);
      this.updateAgentKeyLabels();
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

  ngAfterViewInit() {
    this.agent.onKeyboardOwnerChange(chatHasKeyboard => this.syncKeymenuToAgentKeyboard(chatHasKeyboard));
    this.reading.attach(this.drawingArea, text => this.headerComponent?.showStatusMessage(text, 4000));
    // Agent mode reaches the canvas only through the AgentCanvasTarget surface.
    this.agent.attachCanvas(this.drawingArea, () => {
      const identity = this.headerComponent?.fileIdentity ?? {vaultName: null, path: 'Untitled'};
      const stable = identity.path !== 'Untitled';
      return {
        key: stable ? `${identity.vaultName ?? 'local'}:${identity.path}` : `local:Untitled#${this.untitledGraphRevision}`,
        title: identity.path,
        stable,
      };
    }, () => this.userIsEditing());
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
    switch (kmCommand.kind) {
      case DACommandType.OPEN_AGENT_CHAT:
        this.agent.openPanel();
        return;
      case DACommandType.CLOSE_AGENT_CHAT:
        this.agent.closePanel();
        return;
      case DACommandType.ASK_AGENT_ABOUT_SELECTION:
        this.agent.askAboutSelection();
        return;
      case DACommandType.FOLLOW_AGENT:
        this.agent.follow();
        return;
      case DACommandType.ENTER_READING_MODE:
        this.enterReadingMode();
        return;
    }
    const replacesGraph = kmCommand.kind === DACommandType.NEW_GRAPH
      || kmCommand.kind === DACommandType.LOAD_SAMPLE_GRAPH
      || kmCommand.kind === DACommandType.LOAD_NAMED_GRAPH;
    if (replacesGraph) this.nextUntitledGraph();
    this.commandsSubject.next(kmCommand);
    if (replacesGraph) this.agent.graphMayHaveChanged();
  }

  /** Every unsaved graph is "Untitled", so each one loaded into this tab gets
   *  its own revision: sharing one with an agent never shares the next. Kept
   *  in sessionStorage so a reload still counts as the same graph. */
  private untitledGraphRevision = AppComponent.readUntitledGraphRevision();

  private static readUntitledGraphRevision(): number {
    try {
      return Number(sessionStorage.getItem(UNTITLED_GRAPH_REVISION_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private nextUntitledGraph(): void {
    this.untitledGraphRevision += 1;
    try {
      sessionStorage.setItem(UNTITLED_GRAPH_REVISION_KEY, String(this.untitledGraphRevision));
    } catch {
      // Storage unavailable: a reload just counts as a different graph.
    }
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
    if (this.runDetailCommand(text) || this.runNoteCommand(text)) return;
    const replacesGraph = /^(e|edit|enew)\b/.test(text.trim());
    if (replacesGraph) this.nextUntitledGraph();
    this.commandsSubject.next({kind: DACommandType.EX_COMMAND, text});
    if (replacesGraph) this.agent.graphMayHaveChanged();
  }

  /** `:note <text>`: record a problem noticed while trying an explanation,
   *  with where you were, in the debug log (tools/debug.log on the dev server)
   *  and in this browser. For collecting where explanations go wrong. */
  private runNoteCommand(text: string): boolean {
    const match = /^note\b\s*([\s\S]*)$/.exec(text.trim());
    if (!match) return false;
    const say = (message: string) => this.headerComponent?.showStatusMessage(message, 4000);
    const note = match[1].trim();
    if (!note) {
      say('Say what went wrong, e.g. :note step 4 skips why scores become probabilities');
      return true;
    }
    const nodes = this.drawingArea.agentNodes();
    const label = (id: string | null | undefined) => nodes.find(node => node.id === id)?.label ?? null;
    const selection = this.drawingArea.agentSelection();
    const lastReply = [...this.agent.messages()].reverse().find(message => message.role === 'agent')?.text;
    const record = {
      at: new Date().toISOString(),
      note,
      graph: this.headerComponent?.fileIdentity?.path ?? 'Untitled',
      diagramType: this.drawingArea.agentDiagramTypeId(),
      readingStep: this.reading.active() ? this.reading.step() + 1 : null,
      readingStatement: label(this.reading.currentNodeId()),
      selected: selection.nodeIds.map(label),
      underCrosshairs: label(selection.underCrosshairsId),
      lastAgentReply: lastReply?.slice(0, 500) ?? null,
    };
    this.log.log('[NOTE]', record);
    try {
      const saved = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]') as unknown[];
      localStorage.setItem(NOTES_KEY, JSON.stringify([...saved, record].slice(-200)));
    } catch {
      // Storage unavailable: the debug log still has it.
    }
    say(`Noted: ${note}`);
    return true;
  }

  /** `:detail` shows how much detail the agent should put into explanations;
   *  `:detail brief|standard|thorough` sets it. False for any other command. */
  private runDetailCommand(text: string): boolean {
    const [name, arg = ''] = text.trim().split(/\s+/);
    if (name !== 'detail') return false;
    const say = (message: string) => this.headerComponent?.showStatusMessage(message, 4000);
    const levels = DETAIL_LEVELS.join(', ');
    if (arg === '') {
      say(`Detail: ${this.agent.detailLevel()}. :detail ${levels.replace(/, (?=[^,]*$)/, ' or ')} changes it.`);
    } else if ((DETAIL_LEVELS as readonly string[]).includes(arg)) {
      this.agent.setDetailLevel(arg as DetailLevel);
      say(`Detail: ${arg}. The agent hears about it with your next message.`);
    } else {
      say(`Not a detail level: ${arg}. Choose ${levels}.`);
    }
    return true;
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
          this.headerComponent.diagramTypeName = daNotification.diagramTypeName;
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
        this.agent.graphMayHaveChanged();
        break;
      case "popup-state":
        // A DOM popup (nav popup) owns the keyboard while open.
        this.keymenuComponent.setSuspended(
          daNotification.open,
          daNotification.open ? daNotification.surface : undefined,
        );
        // The agent chat may still hold the keyboard underneath the popup.
        if (!daNotification.open && this.agentSuspendedKeymenu) {
          this.keymenuComponent.setSuspended(true, 'agent-panel');
        }
        break;
      case "view-changed-by-user":
        this.agent.userTookViewControl();
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
    this.nextUntitledGraph();
    this.commandsSubject.next({kind: DACommandType.LOAD_SAMPLE_GRAPH, graphId});
    this.agent.graphMayHaveChanged();
  }
}
