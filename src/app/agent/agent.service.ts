import {computed, inject, Injectable, signal} from '@angular/core';
import {AgentCanvasTarget, AgentNodeInfo, ClientRect} from './agent-canvas';
import {AGENT_PROTOCOL_VERSION, CanvasRef, ServerToTab, TabToServer} from './agent-protocol';
import {AgentEndpointSettings, AgentSettingsService} from './agent-settings.service';
import {AgentToolHost, executeAgentTool} from './agent-tools';

export type AgentState = 'off' | 'setup' | 'consent' | 'connecting' | 'ready' | 'error';

export interface ChatMessage {
  id: number;
  role: 'user' | 'agent' | 'activity' | 'error';
  text: string;
  refs?: CanvasRef[];
  /** True while an agent reply is still streaming. */
  streaming?: boolean;
}

export interface AgentCaption {
  id: number;
  nodeId: string;
  label: string;
  text: string;
}

/** Width the open chat panel occupies on the right, counted into the drawing
 *  area's viewport inset. Lives here (not in the panel component) so eager
 *  code never imports the lazily loaded panel. */
export const AGENT_PANEL_WIDTH = 340;

export interface GraphIdentity {
  /** Stable key for consent, e.g. vault + path. */
  key: string;
  title: string;
}

/**
 * Agent mode session for this tab: connection, chat transcript, the agent's
 * canvas annotations, and who controls the view (notes/idea-mcp-server.md).
 */
@Injectable({providedIn: 'root'})
export class AgentService {
  private readonly settings = inject(AgentSettingsService);

  readonly state = signal<AgentState>('off');
  readonly panelOpen = signal(false);
  readonly messages = signal<ChatMessage[]>([]);
  readonly busy = signal(false);
  /** 'free' once the user moves the view themselves. */
  readonly followMode = signal<'following' | 'free'>('following');
  readonly captions = signal<AgentCaption[]>([]);
  readonly lookHere = signal<AgentNodeInfo | null>(null);
  readonly attachedRefs = signal<CanvasRef[]>([]);
  readonly statusText = signal('');
  /** Incremented to ask the panel to focus its input. */
  readonly focusInputTick = signal(0);
  readonly graphTitle = signal('');

  readonly endpoint = signal<AgentEndpointSettings | null>(this.settings.endpoint);
  readonly endpointName = computed(() => this.endpoint()?.name ?? '');
  readonly connected = computed(() => this.state() === 'ready');

  private socket: WebSocket | null = null;
  private canvas: AgentCanvasTarget | null = null;
  private graphIdentity: () => GraphIdentity = () => ({key: 'untitled', title: 'this graph'});
  private nextId = 1;
  private highlightIds: string[] = [];

  attachCanvas(canvas: AgentCanvasTarget, graphIdentity: () => GraphIdentity): void {
    this.canvas = canvas;
    this.graphIdentity = graphIdentity;
  }

  /** Canvas geometry for the caption overlay. */
  nodeClientRect(id: string): ClientRect | null {
    return this.canvas?.agentNodeClientRect(id) ?? null;
  }

  viewClientRect(): ClientRect | null {
    return this.canvas?.agentViewClientRect() ?? null;
  }

  // ─── Panel and keys ─────────────────────────────────────────────────────

  togglePanel(): void {
    if (this.panelOpen()) {
      this.panelOpen.set(false);
      return;
    }
    this.openPanel();
  }

  openPanel(): void {
    this.panelOpen.set(true);
    if (this.state() === 'off' || this.state() === 'error') this.beginConnect();
    this.focusInputTick.update(n => n + 1);
  }

  /** "Ask about this": open the chat with the current selection attached. */
  askAboutSelection(): void {
    const refs = this.selectionRefs();
    this.attachedRefs.set(refs);
    this.openPanel();
    if (refs.length === 0) this.statusText.set('Nothing selected — the question goes without a reference.');
  }

  /** Hand the view back to the agent and show what it last pointed at. */
  follow(): void {
    this.followMode.set('following');
    const target = this.lookHere();
    this.lookHere.set(null);
    if (target && this.canvas) this.canvas.agentFocusNode(target.id);
  }

  /** Any manual pan, zoom, or navigation: the user now controls the view. */
  userTookViewControl(): void {
    if (this.state() === 'ready' && this.followMode() === 'following') this.followMode.set('free');
  }

  // ─── Connection ─────────────────────────────────────────────────────────

  saveEndpoint(settings: AgentEndpointSettings): void {
    this.settings.saveEndpoint(settings);
    this.endpoint.set(this.settings.endpoint);
    this.beginConnect();
  }

  forgetEndpoint(): void {
    this.disconnect();
    this.settings.forgetEndpoint();
    this.endpoint.set(null);
    this.state.set('setup');
  }

  /** Setup if unconfigured; ask before sharing this graph unless always allowed. */
  beginConnect(): void {
    if (!this.endpoint()) {
      this.state.set('setup');
      return;
    }
    const graph = this.graphIdentity();
    this.graphTitle.set(graph.title);
    if (this.settings.alwaysShares(graph.key)) this.connect();
    else this.state.set('consent');
  }

  answerConsent(choice: 'once' | 'always' | 'cancel'): void {
    if (choice === 'cancel') {
      this.state.set('off');
      this.panelOpen.set(false);
      return;
    }
    if (choice === 'always') this.settings.rememberAlwaysShare(this.graphIdentity().key);
    this.connect();
  }

  private connect(): void {
    const endpoint = this.endpoint();
    if (!endpoint) return;
    this.closeSocket();
    this.state.set('connecting');
    this.statusText.set(`Connecting to ${endpoint.name}…`);
    let socket: WebSocket;
    try {
      socket = new WebSocket(endpoint.url);
    } catch (err) {
      this.fail(`Bad endpoint URL: ${(err as Error).message}`);
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.send({
      type: 'hello', protocol: AGENT_PROTOCOL_VERSION, token: endpoint.token,
      agent: endpoint.agent, graphTitle: this.graphIdentity().title,
    });
    socket.onmessage = event => this.onServerMessage(event.data);
    socket.onclose = event => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.busy.set(false);
      if (this.state() === 'ready' || this.state() === 'connecting') {
        this.fail(event.reason ? `Disconnected: ${event.reason}` : 'Disconnected from the agent');
      }
    };
  }

  disconnect(): void {
    this.closeSocket();
    this.clearAnnotations();
    this.busy.set(false);
    this.followMode.set('following');
    this.state.set(this.endpoint() ? 'off' : 'setup');
    this.statusText.set('');
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private fail(message: string): void {
    this.state.set('error');
    this.statusText.set(message);
    this.push({role: 'error', text: message});
  }

  private send(message: TabToServer): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  // ─── Chat ───────────────────────────────────────────────────────────────

  sendPrompt(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.state() !== 'ready' || this.busy()) return;
    const refs = this.attachedRefs();
    this.push({role: 'user', text: trimmed, refs});
    this.attachedRefs.set([]);
    this.statusText.set('');
    this.busy.set(true);
    this.send({type: 'prompt', text: trimmed, refs});
  }

  cancel(): void {
    if (this.busy()) this.send({type: 'cancel'});
  }

  removeAttachedRef(id: string): void {
    this.attachedRefs.update(refs => refs.filter(r => r.id !== id));
  }

  /** A pill was activated: show the object (this is the user steering, so it doesn't change follow mode). */
  focusRef(id: string): void {
    this.canvas?.agentFocusNode(id);
  }

  private onServerMessage(raw: unknown): void {
    let message: ServerToTab;
    try {
      message = JSON.parse(String(raw)) as ServerToTab;
    } catch {
      return;
    }
    switch (message.type) {
      case 'ready':
        this.state.set('ready');
        this.statusText.set('');
        this.followMode.set('following');
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
        this.runTool(message.callId, message.name, message.args);
        break;
      case 'error':
        if (message.fatal) {
          this.closeSocket();
          this.busy.set(false);
          this.fail(message.message);
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

  private runTool(callId: string, name: string, args: Record<string, unknown>): void {
    if (!this.canvas) {
      this.send({type: 'tool_result', callId, ok: false, error: 'KiDraw canvas is not ready'});
      return;
    }
    try {
      const result = executeAgentTool(name, args ?? {}, this.toolHost(this.canvas));
      this.send({type: 'tool_result', callId, ok: true, result});
    } catch (err) {
      this.send({type: 'tool_result', callId, ok: false, error: (err as Error).message});
    }
  }

  private toolHost(canvas: AgentCanvasTarget): AgentToolHost {
    return {
      canvas,
      followMode: () => this.followMode(),
      showLookHere: node => this.lookHere.set(node),
      addCaption: (node, text) => this.captions.update(list => [
        ...list.filter(c => c.nodeId !== node.id),
        {id: this.nextId++, nodeId: node.id, label: node.label, text},
      ]),
      setHighlights: nodes => {
        this.highlightIds = nodes.map(n => n.id);
        canvas.agentSetHighlights(this.highlightIds);
      },
      clearAnnotations: () => this.clearAnnotations(),
    };
  }

  clearAnnotations(): void {
    this.captions.set([]);
    this.lookHere.set(null);
    if (this.highlightIds.length > 0) {
      this.highlightIds = [];
      this.canvas?.agentSetHighlights([]);
    }
  }

  dismissCaption(id: number): void {
    this.captions.update(list => list.filter(c => c.id !== id));
  }

  private selectionRefs(): CanvasRef[] {
    if (!this.canvas) return [];
    const nodes = new Map(this.canvas.agentNodes().map(n => [n.id, n]));
    const edges = new Map(this.canvas.agentEdges().map(e => [e.id, e]));
    const selection = this.canvas.agentSelection();
    const refs: CanvasRef[] = [];
    for (const id of selection.nodeIds) {
      const node = nodes.get(id);
      if (node) refs.push({kind: 'node', id, label: node.label || id});
    }
    for (const id of selection.edgeIds) {
      const edge = edges.get(id);
      if (edge) {
        const from = nodes.get(edge.from)?.label ?? edge.from;
        const to = nodes.get(edge.to)?.label ?? edge.to;
        refs.push({kind: 'edge', id, label: `${from} → ${to}`});
      }
    }
    if (refs.length === 0 && selection.underCrosshairsId) {
      const node = nodes.get(selection.underCrosshairsId);
      if (node) refs.push({kind: 'node', id: node.id, label: node.label || node.id});
    }
    return refs;
  }
}
