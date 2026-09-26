import {inject, Injectable} from '@angular/core';
import {AgentCanvasTarget, ClientRect} from './agent-canvas';
import {AgentMarks} from './agent-marks';
import {AGENT_PROTOCOL_VERSION, CanvasRef, DetailLevel, ReadyMessage, ServerToTab} from './agent-protocol';
import {AgentEndpointSettings, AgentSettingsService} from './agent-settings.service';
import {afterClose, AgentSocket, RECONNECT_DELAYS_MS, SocketClosed} from './agent-socket';
import {AgentStore, GraphIdentity} from './agent-store';
import type {AgentToolHost} from './agent-tools';
import {AgentTurns} from './agent-turns';
import {ChatTranscript} from './chat-transcript';
import {
  clearStoredSession, readStoredSession, StoredSession, updateStoredSession, writeStoredSession,
} from './stored-session';
import {PluginLibraryService} from '../plugins/plugin-library.service';

/** After a reload the graph may still be loading; look for it this often before giving up on resuming. */
const AUTO_RESUME_CHECKS_MS = [500, 1_500, 3_000, 5_000];

/**
 * Agent mode for this tab: the connection to kidraw-agent, consent to share
 * the graph, the chat, and running the agent's tool calls against the canvas
 * (notes/idea-mcp-server.md).
 *
 * The state it drives lives in AgentStore, which the header and the shell
 * read without loading this; the panel reads it there too, and calls this for
 * everything it does. The pieces it coordinates:
 * - `AgentSocket` (agent-socket.ts): one connection attempt, and what its
 *   closing means;
 * - `ChatTranscript`: the conversation as shown;
 * - `AgentMarks`: highlights, captions and the focused node on the canvas;
 * - `AgentTurns`: which of the graph's changes belong to which prompt;
 * - stored-session.ts: what a reload needs to resume.
 */
@Injectable({providedIn: 'root'})
export class AgentService {
  private readonly settings = inject(AgentSettingsService);
  readonly store = inject(AgentStore);
  private readonly pluginLibrary = inject(PluginLibraryService);

  private readonly transcript = new ChatTranscript(this.store.messages);
  private readonly marks = new AgentMarks(() => this.canvas, this.store.captions, this.store.lookHere);
  private readonly turns = new AgentTurns(this.store.agentEditTurn);

  private socket: AgentSocket | null = null;
  private canvas: AgentCanvasTarget | null = null;
  private graphIdentity: () => GraphIdentity = () => ({key: 'untitled', title: 'this graph', stable: false});
  private userIsEditing: () => boolean = () => false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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

  // ─── Canvas geometry, for the caption overlay ───────────────────────────

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
    return canvas.agentVisibleNodeIds().flatMap(id => {
      const rect = canvas.agentNodeClientRect(id);
      return rect ? [{id, rect}] : [];
    });
  }

  // ─── Panel, keyboard and keys ───────────────────────────────────────────

  /** The chat key: open the chat, or give it the keyboard if it is already open. */
  openPanel(): void {
    this.store.panelOpen.set(true);
    this.store.unseenFailure.set(false);
    updateStoredSession({panelOpen: true});
    // A panel that already has a conversation shows it (and a way to reconnect) instead.
    if (this.store.state() === 'off' && this.transcript.isEmpty()) this.beginConnect();
    this.takeKeyboard();
  }

  closePanel(): void {
    this.store.panelOpen.set(false);
    this.releaseKeyboard();
    updateStoredSession({panelOpen: false});
  }

  takeKeyboard(): void {
    this.store.setKeyboardInPanel(true);
    this.store.focusInputTick.update(n => n + 1);
  }

  releaseKeyboard(): void {
    this.store.setKeyboardInPanel(false);
  }

  /** Focus landed in the panel some other way (a click). */
  panelFocused(): void {
    if (!this.store.keyboardInPanel()) this.store.setKeyboardInPanel(true);
  }

  /** "Ask about this": open the chat with the current selection attached. */
  askAboutSelection(): boolean {
    const refs = this.selectionRefs();
    if (refs.length === 0) {
      this.say(`Select something, or put the crosshairs on a node, to ask about it (${this.store.keyLabels().chat} opens the chat)`);
      return false;
    }
    this.store.attachedRefs.set(refs);
    this.openPanel();
    return true;
  }

  /** Hand the view back to the agent, going to what it last pointed at. */
  follow(): void {
    if (this.store.state() !== 'ready') {
      this.say('No agent is connected');
      return;
    }
    const target = this.store.lookHere();
    const wasFollowing = this.store.followMode() === 'following';
    this.store.followMode.set('following');
    if (target) {
      this.store.lookHere.set(null);
      this.marks.focus(target.id);
    } else {
      this.say(wasFollowing ? 'Already following the agent' : 'Following the agent');
    }
  }

  /** The user panned or zoomed: they now lead the view. */
  userTookViewControl(): void {
    if (this.store.state() === 'ready' && this.store.followMode() === 'following') this.store.followMode.set('free');
    const target = this.store.lookHere();
    if (target && this.canvas?.agentVisibleNodeIds().includes(target.id)) this.store.lookHere.set(null);
  }

  // ─── Endpoint and consent ───────────────────────────────────────────────

  saveEndpoint(settings: AgentEndpointSettings): void {
    const previous = this.store.endpoint();
    if (previous && previous.url !== settings.url) clearStoredSession();
    this.settings.saveEndpoint(settings);
    this.store.endpoint.set(this.settings.endpoint);
    this.store.state.set('off');
    this.beginConnect();
  }

  /** Show the setup form filled in with the saved endpoint. Nothing is deleted. */
  editEndpoint(): void {
    if (this.store.state() === 'ready' || this.store.state() === 'connecting') this.disconnect();
    this.store.state.set('setup');
  }

  forgetEndpoint(): void {
    this.disconnect();
    this.settings.forgetEndpoint();
    this.store.endpoint.set(null);
    this.store.state.set('setup');
  }

  /** Setup if unconfigured; ask before sharing this graph unless always allowed
   *  or this tab already shared it in a session that can be resumed. */
  beginConnect(): void {
    if (!this.store.endpoint()) {
      this.store.state.set('setup');
      return;
    }
    const graph = this.graphIdentity();
    this.store.graphTitle.set(graph.title);
    if (this.resumableSession() || this.settings.alwaysShares(graph.key)) {
      this.sharedGraphKey = graph.key;
      this.connect();
    } else {
      this.store.state.set('consent');
    }
  }

  answerConsent(choice: 'session' | 'always' | 'cancel'): void {
    if (choice === 'cancel') {
      this.store.state.set('off');
      this.closePanel();
      return;
    }
    const graph = this.graphIdentity();
    if (choice === 'always' && graph.stable) this.settings.rememberAlwaysShare(graph.key);
    this.sharedGraphKey = graph.key;
    this.connect();
  }

  // ─── Consent follows the graph ──────────────────────────────────────────

  /** The shell calls this whenever a different graph may have been loaded. */
  graphMayHaveChanged(): void {
    if (this.store.state() === 'ready' || this.store.state() === 'connecting') this.sharedGraphIsOpen();
  }

  answerGraphChange(choice: 'session' | 'always' | 'disconnect'): void {
    const graph = this.store.graphChange();
    this.store.graphChange.set(null);
    if (!graph) return;
    if (choice === 'disconnect') {
      this.disconnect();
      return;
    }
    if (choice === 'always' && graph.stable) this.settings.rememberAlwaysShare(graph.key);
    this.adoptGraph(graph);
  }

  /** True when the graph on screen is the one this session was given. If not,
   *  pause (unless the new graph is always shared) and ask the user. */
  private sharedGraphIsOpen(): boolean {
    const graph = this.graphIdentity();
    if (this.sharedGraphKey === null || graph.key === this.sharedGraphKey) return true;
    if (this.settings.alwaysShares(graph.key)) {
      this.adoptGraph(graph);
      return true;
    }
    if (this.store.graphChange()?.key !== graph.key) {
      this.store.graphChange.set(graph);
      // Captions and highlights point at nodes of the graph that just went away.
      this.marks.clear();
      this.say(`Agent paused: share ${graph.title} to continue`);
    }
    return false;
  }

  private adoptGraph(graph: GraphIdentity): void {
    this.sharedGraphKey = graph.key;
    this.store.graphTitle.set(graph.title);
    // Marks point at nodes of the previous graph.
    this.marks.clear();
    updateStoredSession({graphKey: graph.key});
  }

  // ─── Connection ─────────────────────────────────────────────────────────

  /** Retry a dropped connection now, or reconnect after an error or a disconnect. */
  retryNow(): void {
    if (this.reconnectTimer) {
      this.cancelReconnect();
      this.connect();
    } else if (this.store.state() === 'error' || this.store.state() === 'off') {
      this.beginConnect();
    }
  }

  /** The user ends the session: the server drops it now instead of keeping it for a resume. */
  disconnect(): void {
    this.socket?.send({type: 'end'});
    this.stopReconnecting();
    clearStoredSession();
    this.sharedGraphKey = null;
    this.store.graphChange.set(null);
    this.closeSocket();
    this.marks.clear();
    this.store.busy.set(false);
    this.store.followMode.set('following');
    this.store.state.set(this.store.endpoint() ? 'off' : 'setup');
    this.store.statusText.set('');
  }

  /** After a reload, pick this tab's conversation back up, but only for the
   *  endpoint and graph it was already shared with. The graph may still be
   *  loading, so look again a few times before giving up. */
  private tryAutoResume(check: number): void {
    const stored = readStoredSession();
    const endpoint = this.store.endpoint();
    if (!stored || !endpoint || stored.url !== endpoint.url || this.store.state() !== 'off') return;
    if (stored.graphKey !== this.graphIdentity().key) {
      if (check < AUTO_RESUME_CHECKS_MS.length) {
        setTimeout(() => this.tryAutoResume(check + 1), AUTO_RESUME_CHECKS_MS[check]);
      } else {
        clearStoredSession();
      }
      return;
    }
    this.store.graphTitle.set(this.graphIdentity().title);
    this.sharedGraphKey = stored.graphKey;
    if (stored.panelOpen) this.store.panelOpen.set(true);
    this.connect();
  }

  private connect(): void {
    const endpoint = this.store.endpoint();
    if (!endpoint) return;
    this.cancelReconnect();
    this.closeSocket();
    this.store.state.set('connecting');
    const retry = this.store.reconnecting();
    this.store.statusText.set(retry
      ? `Reconnecting (attempt ${retry.attempt} of ${retry.of})…`
      : `Connecting to ${endpoint.name}…`);
    const stored = this.resumableSession();
    this.resuming = stored !== null;
    try {
      const socket: AgentSocket = new AgentSocket(endpoint.url, {
        opened: () => this.sayHello(socket, endpoint, stored),
        message: raw => this.onServerMessage(raw),
        closed: closed => this.onClosed(socket, closed),
      });
      this.socket = socket;
    } catch (err) {
      this.fail(`Bad endpoint URL: ${(err as Error).message}`);
    }
  }

  private sayHello(socket: AgentSocket, endpoint: AgentEndpointSettings, stored: StoredSession | null): void {
    const options = this.settings.agentOptions;
    socket.send({
      type: 'hello', protocol: AGENT_PROTOCOL_VERSION, token: endpoint.token,
      agent: endpoint.agent, graphTitle: this.graphIdentity().title,
      ...(stored ? {resume: {sessionId: stored.sessionId, secret: stored.secret}} : {}),
      ...(options.length > 0 ? {options} : {}),
    });
  }

  /** The connection closed without us closing it: retry, or say why not. */
  private onClosed(socket: AgentSocket, closed: SocketClosed): void {
    if (this.socket !== socket) return;
    this.socket = null;
    const state = this.store.state();
    if (state !== 'ready' && state !== 'connecting') return;
    this.store.busy.set(false);
    const next = afterClose(closed, {
      wasReady: state === 'ready',
      attempts: this.reconnectAttempt,
      canResume: readStoredSession() !== null,
      endpoint: this.store.endpoint()!,
    });
    if (next.kind === 'retry') {
      this.scheduleReconnect();
    } else if (next.kind === 'taken-over') {
      // Another tab (a duplicated one, say) picked this session up. Don't fight it.
      clearStoredSession();
      this.sharedGraphKey = null;
      this.fail('This conversation continued in another tab or window.');
    } else {
      this.fail(next.message);
    }
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt++];
    const of = RECONNECT_DELAYS_MS.length;
    this.store.reconnecting.set({attempt: this.reconnectAttempt, of});
    this.store.state.set('connecting');
    this.store.statusText.set(
      `Connection lost — reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempt} of ${of})…`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private stopReconnecting(): void {
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    this.store.reconnecting.set(null);
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private fail(message: string): void {
    this.stopReconnecting();
    this.store.state.set('error');
    this.store.statusText.set('');
    this.transcript.addErrorOnce(message);
    this.say(`Agent: ${message}`);
    if (!this.store.panelOpen()) this.store.unseenFailure.set(true);
  }

  private say(text: string): void {
    this.store.say(text);
  }

  /** The stored session, if it belongs to the current endpoint and graph. */
  private resumableSession(): StoredSession | null {
    const stored = readStoredSession();
    const endpoint = this.store.endpoint();
    if (!stored || !endpoint) return null;
    return stored.url === endpoint.url && stored.graphKey === this.graphIdentity().key ? stored : null;
  }

  // ─── What the server says ───────────────────────────────────────────────

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
        this.transcript.appendAgentText(message.delta);
        break;
      case 'agent_activity':
        this.transcript.recordActivity(message.title, message.status);
        break;
      case 'turn_end':
        this.store.busy.set(false);
        this.transcript.endStreaming();
        break;
      case 'tool_call':
        void this.runTool(message.callId, message.name, message.args);
        break;
      case 'options':
        this.store.agentOptions.set(message.options);
        break;
      case 'sign_in_prompt':
        // A tab that reloaded mid sign-in is told again, and is signing in too.
        this.store.signingIn.set(true);
        this.store.signInPrompt.set({url: message.url, code: message.code, message: message.message});
        break;
      case 'sign_in_done':
        this.store.signingIn.set(false);
        this.store.signInPrompt.set(null);
        this.transcript.add({role: message.ok ? 'activity' : 'error', text: message.message});
        break;
      case 'error':
        this.onServerError(message.message, message.fatal === true);
        break;
    }
  }

  /** The session is up: new, or resumed with its conversation so far. */
  private onReady(message: ReadyMessage): void {
    const askedToResume = this.resuming;
    this.socket?.established();
    this.resuming = false;
    this.stopReconnecting();
    this.rememberSession(message.session);
    if (message.resumed) {
      this.transcript.replaceWith(message.history, message.busy);
      this.store.busy.set(message.busy);
    } else {
      this.startedAfresh(askedToResume);
    }
    this.store.agentOptions.set(message.options ?? []);
    this.store.canSignIn.set(message.canSignIn === true);
    // A sign-in that was still waiting when the socket dropped is re-sent by
    // the server; anything older belongs to a session that is gone.
    this.store.signInPrompt.set(null);
    this.store.signingIn.set(false);
    this.store.state.set('ready');
    this.store.statusText.set('');
  }

  /** Store the session for a reload, only ever for the graph the user agreed to share. */
  private rememberSession(session: {id: string; secret: string}): void {
    const endpoint = this.store.endpoint();
    const graphKey = this.sharedGraphKey ?? this.graphIdentity().key;
    this.sharedGraphKey = graphKey;
    if (!endpoint) return;
    writeStoredSession({
      url: endpoint.url, graphKey, sessionId: session.id, secret: session.secret, panelOpen: this.store.panelOpen(),
    });
  }

  private startedAfresh(askedToResume: boolean): void {
    const hadConversation = !this.transcript.isEmpty();
    this.store.busy.set(false);
    this.store.followMode.set('following');
    this.transcript.endStreaming();
    if (askedToResume) {
      this.transcript.add({role: 'activity', text: 'The earlier conversation had ended on the server; this is a new session.'});
    } else if (hadConversation) {
      this.transcript.add({role: 'activity', text: 'New session'});
    }
  }

  private onServerError(text: string, fatal: boolean): void {
    if (!fatal) {
      this.transcript.add({role: 'error', text});
      return;
    }
    this.closeSocket();
    clearStoredSession();
    this.store.busy.set(false);
    this.fail(/not authorized/i.test(text)
      ? 'The agent server rejected the access token. Use "Edit endpoint…" to fix it.'
      : text);
  }

  // ─── Chat ───────────────────────────────────────────────────────────────

  /** Returns false if the prompt could not be sent (so the panel keeps the draft). */
  sendPrompt(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || this.store.state() !== 'ready' || this.store.busy() || !this.sharedGraphIsOpen()) return false;
    const refs = this.store.attachedRefs();
    this.transcript.add({role: 'user', text: trimmed, refs});
    this.store.attachedRefs.set([]);
    this.store.statusText.set('');
    this.store.busy.set(true);
    // Asking is an invitation for the agent to show you something.
    this.store.followMode.set('following');
    this.turns.begin(trimmed);
    this.socket?.send({type: 'prompt', text: trimmed, refs, detail: this.store.detailLevel()});
    return true;
  }

  /** Stop the answer. The agent may still send a tool call or two before it
   *  notices, so graph edits are refused from here until the next prompt. */
  cancel(): void {
    if (!this.store.busy()) return;
    this.turns.stop();
    this.socket?.send({type: 'cancel'});
  }

  setDetailLevel(level: DetailLevel): void {
    this.store.setDetailLevel(level);
  }

  /** Undo everything the agent changed in its latest editing turn, as one step. */
  async revertLastTurn(): Promise<void> {
    const turn = this.store.agentEditTurn();
    if (!turn || !this.canvas) return;
    const conflict = await this.canvas.agentRevertChangeSet(turn);
    if (conflict) {
      this.transcript.add({role: 'error', text: `Couldn't undo the agent's turn: ${conflict}`});
      return;
    }
    this.turns.forget(turn);
    this.transcript.add({role: 'activity', text: "Undid the agent's changes from its last turn"});
  }

  removeAttachedRef(id: string): void {
    this.store.attachedRefs.update(refs => refs.filter(r => r.id !== id));
  }

  /** The user opened a pill: show that node. This is the user steering the view. */
  focusRef(id: string): void {
    if (!this.canvas?.agentFocusNode(id)) {
      this.say("That node isn't in this graph");
      return;
    }
    if (this.store.state() === 'ready') this.store.followMode.set('free');
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

  clearAnnotations(): void {
    this.marks.clear();
  }

  /** What is selected, else the node under the crosshairs, as chat pills. */
  private selectionRefs(): CanvasRef[] {
    if (!this.canvas) return [];
    const nodes = new Map(this.canvas.agentNodes().map(n => [n.id, n]));
    const edges = new Map(this.canvas.agentEdges().map(e => [e.id, e]));
    const selection = this.canvas.agentSelection();
    const label = (id: string) => nodes.get(id)?.label || 'unlabeled node';
    const refs: CanvasRef[] = [
      ...selection.nodeIds.filter(id => nodes.has(id)).map(id => ({kind: 'node' as const, id, label: label(id)})),
      ...selection.edgeIds.flatMap(id => {
        const edge = edges.get(id);
        return edge ? [{kind: 'edge' as const, id, label: `${label(edge.from)} → ${label(edge.to)}`}] : [];
      }),
    ];
    const under = selection.underCrosshairsId;
    if (refs.length === 0 && under && nodes.has(under)) refs.push({kind: 'node', id: under, label: label(under)});
    return refs;
  }

  // ─── Model and sign-in ──────────────────────────────────────────────────

  /** Put the session on another model (or reasoning effort), and start the
   *  next session on it too. The server answers with the settings as they
   *  ended up, which is what the picker then shows. */
  setOption(id: string, value: string): void {
    const option = this.store.agentOptions().find(o => o.id === id);
    if (!option || option.current === value) return;
    if (!option.choices.some(choice => choice.value === value)) return;
    if (this.store.state() !== 'ready') {
      this.say('Connect to the agent before changing its settings');
      return;
    }
    this.settings.rememberAgentOption(id, value);
    // Show the new value at once; the server's `options` reply confirms it.
    this.store.agentOptions.update(list => list.map(o => (o.id === id ? {...o, current: value} : o)));
    this.socket?.send({type: 'set_option', id, value});
  }

  /** Sign the server's agent in to its provider from here: it answers with a
   *  page to open and a code to type. `switchAccount` signs out first, which
   *  is the only way to reach a different account. */
  signIn(switchAccount = false): void {
    if (this.store.state() !== 'ready') {
      this.say('Connect to the agent before signing it in');
      return;
    }
    if (!this.store.canSignIn()) {
      this.transcript.add({role: 'error', text: 'This agent server cannot be signed in from the chat.'});
      return;
    }
    if (this.store.signingIn()) return;
    this.store.signingIn.set(true);
    this.socket?.send({type: 'sign_in', ...(switchAccount ? {switchAccount: true} : {})});
  }

  cancelSignIn(): void {
    if (!this.store.signingIn()) return;
    this.socket?.send({type: 'cancel_sign_in'});
    this.store.signInPrompt.set(null);
  }

  // ─── The agent's tool calls ─────────────────────────────────────────────

  private async runTool(callId: string, name: string, args: Record<string, unknown>): Promise<void> {
    const refusal = !this.canvas ? 'KiDraw canvas is not ready'
      : !this.sharedGraphIsOpen()
        ? 'The user switched to a graph that is not shared with you yet. Wait for them to share it before using KiDraw tools.'
        : null;
    if (refusal) {
      this.socket?.send({type: 'tool_result', callId, ok: false, error: refusal});
      return;
    }
    try {
      // Loaded on first use, like the panel: tabs that never connect don't download it.
      const {executeAgentTool} = await import('./agent-tools');
      const result = await executeAgentTool(name, args ?? {}, this.toolHost(this.canvas!));
      this.socket?.send({type: 'tool_result', callId, ok: true, result});
    } catch (err) {
      this.socket?.send({type: 'tool_result', callId, ok: false, error: (err as Error).message});
    }
  }

  /** What a tool call may do beyond reading the canvas. */
  private toolHost(canvas: AgentCanvasTarget): AgentToolHost {
    return {
      canvas,
      followMode: () => (this.userIsEditing() ? 'free' : this.store.followMode()),
      focus: node => this.marks.focus(node.id),
      showLookHere: node => this.store.lookHere.set(node),
      addCaption: (node, text) => this.marks.caption(node, text),
      setHighlights: nodes => this.marks.highlight(nodes.map(n => n.id)),
      clearAnnotations: () => this.marks.clear(),
      editsRefused: () => this.turns.editsRefused(),
      definePlugin: source => this.definePlugin(source),
      applyChanges: async changes => {
        const meta = this.turns.editMeta(this.store.endpoint()?.agent ?? 'agent');
        const result = await canvas.agentApplyChanges(changes, meta);
        if (result.ok) {
          this.turns.recordEdit(meta.changeSetId);
          this.marks.flash(result.touchedNodeIds);
        }
        return result;
      },
    };
  }

  private definePlugin(source: string): {id: string; name: string} {
    const result = this.pluginLibrary.add(source);
    if (result.errors) throw new Error(`The plugin was not added:\n- ${result.errors.join('\n- ')}`);
    this.say(`The agent added the ${result.plugin.name} plugin (Settings → Plugins to remove it)`);
    return {id: result.plugin.id, name: result.plugin.name};
  }
}
