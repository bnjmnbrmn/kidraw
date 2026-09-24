import {inject, Injectable} from '@angular/core';
import {AgentCanvasTarget, ClientRect} from './agent-canvas';
import {
  AGENT_PROTOCOL_VERSION, CanvasRef, DetailLevel, HistoryEntry, ReadyMessage, ServerToTab, TabToServer,
} from './agent-protocol';
import {AgentEndpointSettings, AgentSettingsService} from './agent-settings.service';
import {AGENT_SESSION_STORAGE_KEY, AgentStore, ChatMessage, GraphIdentity} from './agent-store';
import type {AgentToolHost} from './agent-tools';
import {PluginLibraryService} from '../plugins/plugin-library.service';

export type {AgentCaption, AgentKeyLabels, AgentState, ChatMessage, GraphIdentity} from './agent-store';
export {AGENT_PANEL_WIDTH} from './agent-store';

/** This tab's live session, so a reload can resume it. sessionStorage is per tab. */
interface StoredSession {
  url: string;
  graphKey: string;
  sessionId: string;
  secret: string;
  panelOpen: boolean;
}

const SESSION_STORAGE_KEY = AGENT_SESSION_STORAGE_KEY;
/** Waits between attempts to reconnect a dropped connection. */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];
/** After a reload the graph may still be loading; look for it this often before giving up on resuming. */
const AUTO_RESUME_CHECKS_MS = [500, 1_500, 3_000, 5_000];
/** A socket can hang without opening or closing (e.g. an address the page's own server accepts). */
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Agent mode session for this tab: connection, consent, chat transcript, the
 * agent's canvas annotations, who controls the view, and whether the chat or
 * the canvas has the keyboard (notes/idea-mcp-server.md).
 */
@Injectable({providedIn: 'root'})
export class AgentService {
  private readonly settings = inject(AgentSettingsService);
  /** The always-loaded state this service drives: the same signals the header and shell render. */
  private readonly store = inject(AgentStore);
  private readonly pluginLibrary = inject(PluginLibraryService);

  readonly state = this.store.state;
  readonly panelOpen = this.store.panelOpen;
  readonly messages = this.store.messages;
  readonly busy = this.store.busy;
  readonly followMode = this.store.followMode;
  readonly captions = this.store.captions;
  readonly lookHere = this.store.lookHere;
  readonly attachedRefs = this.store.attachedRefs;
  readonly statusText = this.store.statusText;
  readonly focusInputTick = this.store.focusInputTick;
  readonly graphTitle = this.store.graphTitle;
  readonly graphChange = this.store.graphChange;
  readonly reconnecting = this.store.reconnecting;
  readonly keyboardInPanel = this.store.keyboardInPanel;
  readonly notice = this.store.notice;
  readonly keyLabels = this.store.keyLabels;
  readonly unseenFailure = this.store.unseenFailure;
  readonly endpoint = this.store.endpoint;
  readonly endpointName = this.store.endpointName;
  readonly connected = this.store.connected;
  readonly providerName = this.store.providerName;
  readonly thinking = this.store.thinking;
  readonly agentEditTurn = this.store.agentEditTurn;
  readonly draft = this.store.draft;
  readonly composable = this.store.composable;
  readonly detailLevel = this.store.detailLevel;
  readonly agentOptions = this.store.agentOptions;
  readonly canSignIn = this.store.canSignIn;
  readonly signInPrompt = this.store.signInPrompt;
  readonly signingIn = this.store.signingIn;

  /** Each prompt starts a turn; everything the agent changes during it is one change set. */
  private turn = 0;
  private turnChangeSetId: string | null = null;
  private turnLabel = 'Agent edit';
  /** Set when the user presses Stop: the agent may not change the graph again until the next prompt. */
  private editsStopped = false;
  /** Turns (change sets) that changed the graph, oldest first. */
  private editedTurns: string[] = [];
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  private socket: WebSocket | null = null;
  private canvas: AgentCanvasTarget | null = null;
  private graphIdentity: () => GraphIdentity = () => ({key: 'untitled', title: 'this graph', stable: false});
  private userIsEditing: () => boolean = () => false;
  private nextId = 1;
  private highlightIds: string[] = [];
  /** The node the agent last focused; marked with the same halo as highlights. */
  private focusedId: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private labelCache: {at: number; labels: Map<string, string>} | null = null;
  /** The current connection asked to resume a stored session. */
  private resuming = false;
  /** The graph this session was given consent for. */
  private sharedGraphKey: string | null = null;

  /**
   * @param graphIdentity the graph currently open.
   * @param userIsEditing true while the user is typing or in a non-normal mode;
   *   the agent then points with a hint instead of moving the view.
   */
  attachCanvas(canvas: AgentCanvasTarget, graphIdentity: () => GraphIdentity, userIsEditing: () => boolean = () => false): void {
    this.canvas = canvas;
    this.graphIdentity = graphIdentity;
    this.userIsEditing = userIsEditing;
    this.tryAutoResume(0);
  }

  currentGraph(): GraphIdentity {
    return this.graphIdentity();
  }

  /** Canvas geometry for the caption overlay. */
  nodeClientRect(id: string): ClientRect | null {
    return this.canvas?.agentNodeClientRect(id) ?? null;
  }

  viewClientRect(): ClientRect | null {
    return this.canvas?.agentViewClientRect() ?? null;
  }

  /** On-screen boxes of the nodes currently in view, so captions can avoid them. */
  visibleNodeRects(): {id: string; rect: ClientRect}[] {
    const canvas = this.canvas;
    if (!canvas) return [];
    const rects: {id: string; rect: ClientRect}[] = [];
    for (const id of canvas.agentVisibleNodeIds()) {
      const rect = canvas.agentNodeClientRect(id);
      if (rect) rects.push({id, rect});
    }
    return rects;
  }

  // ─── Panel, keyboard and keys ───────────────────────────────────────────

  /** The chat key: open the chat, or give it the keyboard if it is already open. */
  openPanel(): void {
    this.panelOpen.set(true);
    this.unseenFailure.set(false);
    this.rememberPanel();
    // A panel that already has a conversation shows it (and a way to reconnect) instead.
    if (this.state() === 'off' && this.messages().length === 0) this.beginConnect();
    this.takeKeyboard();
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.releaseKeyboard();
    this.rememberPanel();
  }

  takeKeyboard(): void {
    this.store.setKeyboardInPanel(true);
    this.focusInputTick.update(n => n + 1);
  }

  releaseKeyboard(): void {
    this.store.setKeyboardInPanel(false);
  }

  /** Focus landed in the panel some other way (a click). */
  panelFocused(): void {
    if (!this.keyboardInPanel()) this.store.setKeyboardInPanel(true);
  }

  /** "Ask about this": open the chat with the current selection attached. */
  askAboutSelection(): boolean {
    const refs = this.selectionRefs();
    if (refs.length === 0) {
      this.say(`Select something, or put the crosshairs on a node, to ask about it (${this.keyLabels().chat} opens the chat)`);
      return false;
    }
    this.attachedRefs.set(refs);
    this.openPanel();
    return true;
  }

  /** Hand the view back to the agent, going to what it last pointed at. */
  follow(): void {
    if (this.state() !== 'ready') {
      this.say('No agent is connected');
      return;
    }
    const target = this.lookHere();
    const wasFollowing = this.followMode() === 'following';
    this.followMode.set('following');
    if (target) {
      this.lookHere.set(null);
      this.focusNode(target.id);
    } else {
      this.say(wasFollowing ? 'Already following the agent' : 'Following the agent');
    }
  }

  /** The user panned or zoomed: they now lead the view. */
  userTookViewControl(): void {
    if (this.state() === 'ready' && this.followMode() === 'following') this.followMode.set('free');
    const target = this.lookHere();
    if (target && this.canvas?.agentVisibleNodeIds().includes(target.id)) this.lookHere.set(null);
  }

  // ─── Connection ─────────────────────────────────────────────────────────

  saveEndpoint(settings: AgentEndpointSettings): void {
    const previous = this.endpoint();
    if (previous && previous.url !== settings.url) this.clearStoredSession();
    this.settings.saveEndpoint(settings);
    this.endpoint.set(this.settings.endpoint);
    this.state.set('off');
    this.beginConnect();
  }

  /** Show the setup form filled in with the saved endpoint. Nothing is deleted. */
  editEndpoint(): void {
    if (this.state() === 'ready' || this.state() === 'connecting') this.disconnect();
    this.state.set('setup');
  }

  forgetEndpoint(): void {
    this.disconnect();
    this.settings.forgetEndpoint();
    this.endpoint.set(null);
    this.state.set('setup');
  }

  /** Setup if unconfigured; ask before sharing this graph unless always allowed
   *  or this tab already shared it in a session that can be resumed. */
  beginConnect(): void {
    if (!this.endpoint()) {
      this.state.set('setup');
      return;
    }
    const graph = this.graphIdentity();
    this.graphTitle.set(graph.title);
    if (this.resumableSession() || this.settings.alwaysShares(graph.key)) {
      this.sharedGraphKey = graph.key;
      this.connect();
    } else {
      this.state.set('consent');
    }
  }

  answerConsent(choice: 'session' | 'always' | 'cancel'): void {
    if (choice === 'cancel') {
      this.state.set('off');
      this.closePanel();
      return;
    }
    const graph = this.graphIdentity();
    if (choice === 'always' && graph.stable) this.settings.rememberAlwaysShare(graph.key);
    this.sharedGraphKey = graph.key;
    this.connect();
  }

  /** Retry a dropped connection now, or reconnect after an error or a disconnect. */
  retryNow(): void {
    if (this.reconnectTimer) {
      this.cancelReconnect();
      this.connect();
    } else if (this.state() === 'error' || this.state() === 'off') {
      this.beginConnect();
    }
  }

  /** After a reload, pick this tab's conversation back up, but only for the
   *  endpoint and graph it was already shared with. */
  private tryAutoResume(check: number): void {
    const stored = this.readStoredSession();
    const endpoint = this.endpoint();
    if (!stored || !endpoint || stored.url !== endpoint.url || this.state() !== 'off') return;
    if (stored.graphKey !== this.graphIdentity().key) {
      if (check < AUTO_RESUME_CHECKS_MS.length) {
        setTimeout(() => this.tryAutoResume(check + 1), AUTO_RESUME_CHECKS_MS[check]);
      } else {
        this.clearStoredSession();
      }
      return;
    }
    this.graphTitle.set(this.graphIdentity().title);
    this.sharedGraphKey = stored.graphKey;
    if (stored.panelOpen) this.panelOpen.set(true);
    this.connect();
  }

  private connect(): void {
    const endpoint = this.endpoint();
    if (!endpoint) return;
    this.cancelReconnect();
    this.closeSocket();
    this.state.set('connecting');
    const retry = this.reconnecting();
    this.statusText.set(retry
      ? `Reconnecting (attempt ${retry.attempt} of ${retry.of})…`
      : `Connecting to ${endpoint.name}…`);
    const stored = this.resumableSession();
    const resume = stored ? {sessionId: stored.sessionId, secret: stored.secret} : undefined;
    let socket: WebSocket;
    try {
      socket = new WebSocket(endpoint.url);
    } catch (err) {
      this.fail(`Bad endpoint URL: ${(err as Error).message}`);
      return;
    }
    this.socket = socket;
    this.resuming = resume !== undefined;
    let opened = false;
    socket.onopen = () => {
      opened = true;
      const options = this.settings.agentOptions;
      this.send({
        type: 'hello', protocol: AGENT_PROTOCOL_VERSION, token: endpoint.token,
        agent: endpoint.agent, graphTitle: this.graphIdentity().title,
        ...(resume ? {resume} : {}),
        ...(options.length > 0 ? {options} : {}),
      });
    };
    socket.onmessage = event => this.onServerMessage(event.data);
    const closed = (code: number, reason: string, timedOut = false) => {
      this.clearConnectTimer();
      if (this.socket !== socket) return;
      this.socket = null;
      const state = this.state();
      if (state !== 'ready' && state !== 'connecting') return;
      this.busy.set(false);
      if (code === 4001) {
        // Another tab (a duplicated one, say) picked this session up. Don't fight it.
        this.clearStoredSession();
        this.sharedGraphKey = null;
        this.fail('This conversation continued in another tab or window.');
        return;
      }
      // 4000–4999 means the server refused or ended the session; anything else
      // is a dropped connection, retried while the session can still resume.
      const refused = code >= 4000 && code < 5000;
      const droppedAfterReady = state === 'ready' || this.reconnectAttempt > 0;
      if (!refused && droppedAfterReady && this.reconnectAttempt < RECONNECT_DELAYS_MS.length
          && this.readStoredSession()) {
        this.scheduleReconnect();
        return;
      }
      if (refused) this.fail(reason || 'The agent server ended the session.');
      else if (this.reconnectAttempt > 0) this.fail(`Couldn't reconnect to ${endpoint.name}.`);
      else if (timedOut) this.fail(`Timed out connecting to ${endpoint.url}. Check the address and that the server is running.`);
      else if (!opened || state === 'connecting') {
        this.fail(`Couldn't reach ${endpoint.url}. Check the address, that the server is running, and that it allows this site.`);
      } else {
        this.fail('Disconnected from the agent.');
      }
    };
    socket.onclose = event => closed(event.code, event.reason);
    this.connectTimer = setTimeout(() => {
      if (this.socket !== socket || this.state() !== 'connecting') return;
      socket.onclose = null;
      socket.close();
      closed(1006, '', true);
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt++];
    const of = RECONNECT_DELAYS_MS.length;
    this.reconnecting.set({attempt: this.reconnectAttempt, of});
    this.state.set('connecting');
    this.statusText.set(`Connection lost — reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempt} of ${of})…`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /** The user ends the session: the server drops it now instead of keeping it for a resume. */
  disconnect(): void {
    this.send({type: 'end'});
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    this.reconnecting.set(null);
    this.clearStoredSession();
    this.sharedGraphKey = null;
    this.graphChange.set(null);
    this.closeSocket();
    this.clearAnnotations();
    this.busy.set(false);
    this.followMode.set('following');
    this.state.set(this.endpoint() ? 'off' : 'setup');
    this.statusText.set('');
  }

  private closeSocket(): void {
    this.clearConnectTimer();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private fail(message: string): void {
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    this.reconnecting.set(null);
    this.state.set('error');
    this.statusText.set('');
    // Pressing Reconnect against the same problem shouldn't stack copies of it.
    const last = this.messages()[this.messages().length - 1];
    if (!(last?.role === 'error' && last.text === message)) this.push({role: 'error', text: message});
    this.say(`Agent: ${message}`);
    if (!this.panelOpen()) this.unseenFailure.set(true);
  }

  private send(message: TabToServer): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private say(text: string): void {
    this.store.say(text);
  }

  private onReady(message: ReadyMessage): void {
    const endpoint = this.endpoint();
    const askedToResume = this.resuming;
    this.clearConnectTimer();
    this.resuming = false;
    this.reconnectAttempt = 0;
    this.reconnecting.set(null);
    // Only ever store the graph the user agreed to share.
    const graphKey = this.sharedGraphKey ?? this.graphIdentity().key;
    this.sharedGraphKey = graphKey;
    if (endpoint) {
      this.writeStoredSession({
        url: endpoint.url, graphKey,
        sessionId: message.session.id, secret: message.session.secret, panelOpen: this.panelOpen(),
      });
    }
    if (message.resumed) {
      this.messages.set(this.fromHistory(message.history, message.busy));
      this.busy.set(message.busy);
    } else {
      this.busy.set(false);
      this.followMode.set('following');
      this.messages.update(list => list.map(m => (m.streaming ? {...m, streaming: false} : m)));
      if (askedToResume) {
        this.push({role: 'activity', text: 'The earlier conversation had ended on the server; this is a new session.'});
      } else if (this.messages().length > 0) {
        this.push({role: 'activity', text: 'New session'});
      }
    }
    this.agentOptions.set(message.options ?? []);
    this.canSignIn.set(message.canSignIn === true);
    // A sign-in that was still waiting when the socket dropped is re-sent by
    // the server; anything older belongs to a session that is gone.
    this.signInPrompt.set(null);
    this.signingIn.set(false);
    this.state.set('ready');
    this.statusText.set('');
  }

  private fromHistory(history: HistoryEntry[], busy: boolean): ChatMessage[] {
    return history.map((entry, index) => ({
      id: this.nextId++,
      role: entry.role,
      text: entry.text,
      ...(entry.refs ? {refs: entry.refs} : {}),
      ...(busy && entry.role === 'agent' && index === history.length - 1 ? {streaming: true} : {}),
    }));
  }

  // ─── Consent follows the graph ──────────────────────────────────────────

  /** True when the graph on screen is the one this session was given. If not,
   *  pause (unless the new graph is always shared) and ask the user. */
  private sharedGraphIsOpen(): boolean {
    const graph = this.graphIdentity();
    if (this.sharedGraphKey === null || graph.key === this.sharedGraphKey) return true;
    if (this.settings.alwaysShares(graph.key)) {
      this.adoptGraph(graph);
      return true;
    }
    if (this.graphChange()?.key !== graph.key) {
      this.graphChange.set(graph);
      // Captions and highlights point at nodes of the graph that just went away.
      this.clearAnnotations();
      this.say(`Agent paused: share ${graph.title} to continue`);
    }
    return false;
  }

  /** The shell calls this whenever a different graph may have been loaded. */
  graphMayHaveChanged(): void {
    if (this.state() === 'ready' || this.state() === 'connecting') this.sharedGraphIsOpen();
  }

  answerGraphChange(choice: 'session' | 'always' | 'disconnect'): void {
    const graph = this.graphChange();
    this.graphChange.set(null);
    if (!graph) return;
    if (choice === 'disconnect') {
      this.disconnect();
      return;
    }
    if (choice === 'always' && graph.stable) this.settings.rememberAlwaysShare(graph.key);
    this.adoptGraph(graph);
  }

  private adoptGraph(graph: GraphIdentity): void {
    this.sharedGraphKey = graph.key;
    this.graphTitle.set(graph.title);
    // Annotations point at nodes of the previous graph.
    this.clearAnnotations();
    const stored = this.readStoredSession();
    if (stored) this.writeStoredSession({...stored, graphKey: graph.key});
  }

  // ─── Session storage (this tab only) ────────────────────────────────────

  /** The stored session, if it belongs to the current endpoint and graph. */
  private resumableSession(): StoredSession | null {
    const stored = this.readStoredSession();
    const endpoint = this.endpoint();
    if (!stored || !endpoint) return null;
    return stored.url === endpoint.url && stored.graphKey === this.graphIdentity().key ? stored : null;
  }

  private readStoredSession(): StoredSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) as StoredSession : null;
    } catch {
      return null;
    }
  }

  private writeStoredSession(session: StoredSession): void {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Private mode or storage disabled: reloads just start a new session.
    }
  }

  private clearStoredSession(): void {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Nothing stored, nothing to clear.
    }
  }

  private rememberPanel(): void {
    const stored = this.readStoredSession();
    if (stored) this.writeStoredSession({...stored, panelOpen: this.panelOpen()});
  }

  // ─── Chat ───────────────────────────────────────────────────────────────

  /** Returns false if the prompt could not be sent (so the panel keeps the draft). */
  sendPrompt(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || this.state() !== 'ready' || this.busy() || !this.sharedGraphIsOpen()) return false;
    const refs = this.attachedRefs();
    this.push({role: 'user', text: trimmed, refs});
    this.attachedRefs.set([]);
    this.statusText.set('');
    this.busy.set(true);
    // Asking is an invitation for the agent to show you something.
    this.followMode.set('following');
    this.turn += 1;
    this.turnChangeSetId = `agent-turn-${Date.now().toString(36)}-${this.turn}`;
    this.turnLabel = `Agent: ${trimmed.length > 40 ? `${trimmed.slice(0, 39)}…` : trimmed}`;
    this.editsStopped = false;
    this.send({type: 'prompt', text: trimmed, refs, detail: this.detailLevel()});
    return true;
  }

  setDetailLevel(level: DetailLevel): void {
    this.store.setDetailLevel(level);
  }

  // ─── Model and sign-in ──────────────────────────────────────────────────

  /** Put the session on another model (or reasoning effort), and start the
   *  next session on it too. The server answers with the settings as they
   *  ended up, which is what the picker then shows. */
  setOption(id: string, value: string): void {
    const option = this.agentOptions().find(o => o.id === id);
    if (!option || option.current === value) return;
    if (!option.choices.some(choice => choice.value === value)) return;
    if (this.state() !== 'ready') {
      this.say('Connect to the agent before changing its settings');
      return;
    }
    this.settings.rememberAgentOption(id, value);
    // Show the new value at once; the server's `options` reply confirms it.
    this.agentOptions.update(list => list.map(o => (o.id === id ? {...o, current: value} : o)));
    this.send({type: 'set_option', id, value});
  }

  /** Sign the server's agent in to its provider from here: it answers with a
   *  page to open and a code to type. `switchAccount` signs out first, which
   *  is the only way to reach a different account. */
  signIn(switchAccount = false): void {
    if (this.state() !== 'ready') {
      this.say('Connect to the agent before signing it in');
      return;
    }
    if (!this.canSignIn()) {
      this.push({role: 'error', text: 'This agent server cannot be signed in from the chat.'});
      return;
    }
    if (this.signingIn()) return;
    this.signingIn.set(true);
    this.send({type: 'sign_in', ...(switchAccount ? {switchAccount: true} : {})});
  }

  cancelSignIn(): void {
    if (!this.signingIn()) return;
    this.send({type: 'cancel_sign_in'});
    this.signInPrompt.set(null);
  }

  /** Stop the answer. The agent may still send a tool call or two before it
   *  notices, so graph edits are refused from here until the next prompt. */
  cancel(): void {
    if (!this.busy()) return;
    this.editsStopped = true;
    this.send({type: 'cancel'});
  }

  /** Undo everything the agent changed in its latest editing turn, as one step. */
  async revertLastTurn(): Promise<void> {
    const turn = this.agentEditTurn();
    if (!turn || !this.canvas) return;
    const conflict = await this.canvas.agentRevertChangeSet(turn);
    if (conflict) {
      this.push({role: 'error', text: `Couldn't undo the agent's turn: ${conflict}`});
      return;
    }
    this.editedTurns = this.editedTurns.filter(id => id !== turn);
    this.agentEditTurn.set(this.editedTurns[this.editedTurns.length - 1] ?? null);
    this.push({role: 'activity', text: "Undid the agent's changes from its last turn"});
  }

  removeAttachedRef(id: string): void {
    this.attachedRefs.update(refs => refs.filter(r => r.id !== id));
  }

  /** The user opened a pill: show that node. This is the user steering the view. */
  focusRef(id: string): void {
    if (!this.canvas?.agentFocusNode(id)) {
      this.say("That node isn't in this graph");
      return;
    }
    if (this.state() === 'ready') this.followMode.set('free');
  }

  /** A node's current label ('' if unlabeled), or null if it isn't in the graph.
   *  Cached for a second, since every pill asks on every render. */
  nodeLabel(id: string): string | null {
    const now = Date.now();
    if (!this.labelCache || now - this.labelCache.at > 1_000) {
      this.labelCache = {at: now, labels: new Map((this.canvas?.agentNodes() ?? []).map(n => [n.id, n.label]))};
    }
    return this.labelCache.labels.get(id) ?? null;
  }

  private onServerMessage(raw: unknown): void {
    let message: ServerToTab;
    try {
      message = JSON.parse(String(raw)) as ServerToTab;
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null) return;
    switch (message.type) {
      case 'ready':
        this.onReady(message);
        break;
      case 'agent_text':
        this.appendAgentText(message.delta);
        break;
      case 'agent_activity':
        this.recordActivity(message.title, message.status);
        break;
      case 'turn_end':
        this.busy.set(false);
        this.messages.update(list => list.map(m => (m.streaming ? {...m, streaming: false} : m)));
        break;
      case 'tool_call':
        void this.runTool(message.callId, message.name, message.args);
        break;
      case 'options':
        this.agentOptions.set(message.options);
        break;
      case 'sign_in_prompt':
        // A tab that reloaded mid sign-in is told again, and is signing in too.
        this.signingIn.set(true);
        this.signInPrompt.set({url: message.url, code: message.code, message: message.message});
        break;
      case 'sign_in_done':
        this.signingIn.set(false);
        this.signInPrompt.set(null);
        this.push({role: message.ok ? 'activity' : 'error', text: message.message});
        break;
      case 'error':
        if (message.fatal) {
          this.closeSocket();
          this.clearStoredSession();
          this.busy.set(false);
          this.fail(/not authorized/i.test(message.message)
            ? 'The agent server rejected the access token. Use "Edit endpoint…" to fix it.'
            : message.message);
        } else {
          this.push({role: 'error', text: message.message});
        }
        break;
    }
  }

  private appendAgentText(delta: string): void {
    this.messages.update(list => {
      const last = list[list.length - 1];
      if (last?.role === 'agent' && last.streaming) {
        return [...list.slice(0, -1), {...last, text: last.text + delta}];
      }
      return [...list, {id: this.nextId++, role: 'agent', text: delta, streaming: true}];
    });
  }

  private recordActivity(title: string, status: string): void {
    const text = status === 'failed' ? `${title} (failed)` : title;
    this.messages.update(list => {
      const last = list[list.length - 1];
      if (last?.role === 'activity' && last.text.replace(/ \(failed\)$/, '') === title) {
        return [...list.slice(0, -1), {...last, text}];
      }
      return [...list, {id: this.nextId++, role: 'activity', text}];
    });
  }

  private push(message: Omit<ChatMessage, 'id'>): void {
    this.messages.update(list => [...list, {...message, id: this.nextId++}]);
  }

  // ─── Tools ──────────────────────────────────────────────────────────────

  private async runTool(callId: string, name: string, args: Record<string, unknown>): Promise<void> {
    if (!this.canvas) {
      this.send({type: 'tool_result', callId, ok: false, error: 'KiDraw canvas is not ready'});
      return;
    }
    if (!this.sharedGraphIsOpen()) {
      this.send({
        type: 'tool_result', callId, ok: false,
        error: 'The user switched to a graph that is not shared with you yet. Wait for them to share it before using KiDraw tools.',
      });
      return;
    }
    try {
      // Loaded on first use, like the panel: tabs that never connect don't download it.
      const {executeAgentTool} = await import('./agent-tools');
      const result = await executeAgentTool(name, args ?? {}, this.toolHost(this.canvas));
      this.send({type: 'tool_result', callId, ok: true, result});
    } catch (err) {
      this.send({type: 'tool_result', callId, ok: false, error: (err as Error).message});
    }
  }

  private toolHost(canvas: AgentCanvasTarget): AgentToolHost {
    return {
      canvas,
      followMode: () => (this.userIsEditing() ? 'free' : this.followMode()),
      focus: node => this.focusNode(node.id),
      showLookHere: node => this.lookHere.set(node),
      addCaption: (node, text) => this.captions.update(list => [
        ...list.filter(c => c.nodeId !== node.id),
        {id: this.nextId++, nodeId: node.id, label: node.label, text},
      ]),
      setHighlights: nodes => {
        this.highlightIds = nodes.map(n => n.id);
        this.showHighlights();
      },
      clearAnnotations: () => this.clearAnnotations(),
      editsRefused: () => (this.editsStopped
        ? 'The user stopped you. Do not change the graph until they send another message.'
        : null),
      definePlugin: source => {
        const result = this.pluginLibrary.add(source);
        if (result.errors) throw new Error(`The plugin was not added:\n- ${result.errors.join('\n- ')}`);
        this.store.say(`The agent added the ${result.plugin.name} plugin (Settings → Plugins to remove it)`);
        return {id: result.plugin.id, name: result.plugin.name};
      },
      applyChanges: async changes => {
        const changeSetId = this.turnChangeSetId ?? `agent-turn-${Date.now().toString(36)}-${++this.turn}`;
        const result = await canvas.agentApplyChanges(changes, {
          author: `agent:${this.endpoint()?.agent ?? 'agent'}`, label: this.turnLabel, changeSetId,
        });
        if (result.ok) {
          if (!this.editedTurns.includes(changeSetId)) this.editedTurns.push(changeSetId);
          this.agentEditTurn.set(changeSetId);
          this.flashNodes(result.touchedNodeIds);
        }
        return result;
      },
    };
  }

  /** Presence: the nodes the agent just changed glow for a moment. */
  private flashNodes(ids: string[]): void {
    if (!this.canvas || ids.length === 0) return;
    const marked = new Set([...this.highlightIds, ...(this.focusedId ? [this.focusedId] : []), ...ids]);
    this.canvas.agentSetHighlights([...marked]);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.showHighlights(), 1_500);
  }

  private focusNode(id: string): void {
    this.canvas?.agentFocusNode(id);
    this.focusedId = id;
    this.showHighlights();
  }

  private showHighlights(): void {
    const ids = new Set(this.highlightIds);
    if (this.focusedId) ids.add(this.focusedId);
    this.canvas?.agentSetHighlights([...ids]);
  }

  clearAnnotations(): void {
    this.captions.set([]);
    this.lookHere.set(null);
    if (this.highlightIds.length > 0 || this.focusedId) {
      this.highlightIds = [];
      this.focusedId = null;
      this.canvas?.agentSetHighlights([]);
    }
  }

  private selectionRefs(): CanvasRef[] {
    if (!this.canvas) return [];
    const nodes = new Map(this.canvas.agentNodes().map(n => [n.id, n]));
    const edges = new Map(this.canvas.agentEdges().map(e => [e.id, e]));
    const selection = this.canvas.agentSelection();
    const label = (id: string) => nodes.get(id)?.label || 'unlabeled node';
    const refs: CanvasRef[] = [];
    for (const id of selection.nodeIds) {
      if (nodes.has(id)) refs.push({kind: 'node', id, label: label(id)});
    }
    for (const id of selection.edgeIds) {
      const edge = edges.get(id);
      if (edge) refs.push({kind: 'edge', id, label: `${label(edge.from)} → ${label(edge.to)}`});
    }
    if (refs.length === 0 && selection.underCrosshairsId && nodes.has(selection.underCrosshairsId)) {
      refs.push({kind: 'node', id: selection.underCrosshairsId, label: label(selection.underCrosshairsId)});
    }
    return refs;
  }
}
