import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type { WebSocket } from 'ws';
import { tokensMatch, type AgentServerConfig } from './config.js';
import type { McpBridge, McpEndpoint } from './mcp-bridge.js';
import type { CanvasRef, HistoryEntry, PromptMessage, ServerToTab, TabToServer } from './protocol.js';
import { startAgent, type StartedAgent } from './runners.js';
import { SESSION_PREAMBLE } from './tools.js';

type Log = (message: string) => void;

interface PendingToolCall {
  resolve(result: unknown): void;
  reject(err: Error): void;
  timer: NodeJS.Timeout;
}

/** Tool-call kinds a read-only KiDraw session may approve without asking. */
const AUTO_APPROVED_KINDS = new Set(['read', 'search', 'think', 'fetch', 'other']);

/** Transcript entries kept for a tab that resumes. */
const MAX_HISTORY = 300;

/**
 * One agent session for one KiDraw tab.
 *
 * The server checks the tab's `hello` (server.ts) and then either begins a new
 * session or resumes an existing one. A session outlives its socket: when the
 * tab reloads or the connection drops it is detached and kept for
 * `resumeGraceMs`, and a socket that presents the session's id and secret
 * picks it up again, transcript included.
 */
export class TabSession {
  readonly id = randomUUID();
  private readonly name = this.id.slice(0, 8);
  private readonly secret = randomBytes(24).toString('base64url');
  private state: 'starting' | 'ready' | 'closed' = 'starting';
  private ws: WebSocket | null = null;
  private graceTimer: NodeJS.Timeout | null = null;
  private agentName = '';
  private agent: StartedAgent | null = null;
  private endpoint: McpEndpoint | null = null;
  private workDir: string | null = null;
  private context: acp.ClientContext | null = null;
  private session: acp.ActiveSession | null = null;
  private busy = false;
  private firstPrompt = true;
  /** `open` marks an agent reply that is still streaming. */
  private readonly history: (HistoryEntry & { open?: boolean })[] = [];
  private readonly pending = new Map<string, PendingToolCall>();
  private releaseConnection: () => void = () => {};

  constructor(
    private readonly config: AgentServerConfig,
    private readonly bridge: McpBridge,
    private readonly log: Log,
    private readonly onClosed: (session: TabSession) => void,
  ) {}

  /** Only a running session can be picked up by another socket. */
  get resumable(): boolean {
    return this.state === 'ready';
  }

  secretMatches(secret: unknown): boolean {
    return tokensMatch(this.secret, secret);
  }

  /** Start the agent for a newly connected tab. */
  begin(ws: WebSocket, agentName: string): void {
    this.agentName = agentName;
    this.attach(ws);
    this.start().catch(err => this.fail(`Agent failed to start: ${this.describeStartError(err)}`));
  }

  /** Hand the session to a new socket from the same tab (reload or reconnect). */
  resume(ws: WebSocket): void {
    this.attach(ws);
    this.log(`[${this.name}] resumed`);
    this.sendReady(true);
  }

  private attach(ws: WebSocket): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    const previous = this.ws;
    this.ws = ws;
    if (previous && previous !== ws) previous.close(4001, 'Session continued in another connection');
    ws.on('message', data => {
      if (this.ws === ws) this.onMessage(data.toString());
    });
    const detach = () => {
      if (this.ws === ws) this.detach();
    };
    ws.on('close', detach);
    ws.on('error', detach);
  }

  private detach(): void {
    this.ws = null;
    this.rejectPending('KiDraw tab disconnected');
    if (this.state === 'closed') return;
    if (this.state !== 'ready') {
      this.close();
      return;
    }
    this.log(`[${this.name}] tab disconnected; keeping the session for ${Math.round(this.config.resumeGraceMs / 1000)}s`);
    this.graceTimer = setTimeout(() => this.close(), this.config.resumeGraceMs);
  }

  private send(message: ServerToTab): void {
    const ws = this.ws;
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  /** Send a conversation event, keeping it in the transcript for a resuming tab. */
  private emit(message: ServerToTab): void {
    this.record(message);
    this.send(message);
  }

  private record(message: ServerToTab): void {
    const last = this.history[this.history.length - 1];
    switch (message.type) {
      case 'agent_text':
        if (last?.role === 'agent' && last.open) last.text += message.delta;
        else this.pushHistory({ role: 'agent', text: message.delta, open: true });
        break;
      case 'agent_activity': {
        const text = message.status === 'failed' ? `${message.title} (failed)` : message.title;
        if (last?.role === 'activity' && last.text.replace(/ \(failed\)$/, '') === message.title) last.text = text;
        else this.pushHistory({ role: 'activity', text });
        break;
      }
      case 'error':
        if (!message.fatal) this.pushHistory({ role: 'error', text: message.message });
        break;
      case 'turn_end':
        for (const entry of this.history) entry.open = false;
        break;
      default:
        break;
    }
  }

  private pushHistory(entry: HistoryEntry & { open?: boolean }): void {
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
  }

  private sendReady(resumed: boolean): void {
    this.send({
      type: 'ready',
      agent: this.agentName,
      session: { id: this.id, secret: this.secret },
      resumed,
      busy: this.busy,
      history: resumed ? this.history.map(({ role, text, refs }) => (refs ? { role, text, refs } : { role, text })) : [],
    });
  }

  private fail(message: string, code = 4000): void {
    const ws = this.ws;
    this.send({ type: 'error', message, fatal: true });
    ws?.close(code, message.slice(0, 100));
    this.close();
  }

  private describeStartError(err: unknown): string {
    const message = (err as Error).message ?? String(err);
    if (this.config.runner !== 'fake' && /auth/i.test(message)) {
      return `${message}. kidraw-agent is not logged in to Codex; on the server run: `
        + `CODEX_HOME=${this.config.codexHome} codex login --device-auth`;
    }
    return message;
  }

  private onMessage(raw: string): void {
    let message: TabToServer;
    try {
      message = JSON.parse(raw) as TabToServer;
    } catch {
      this.send({ type: 'error', message: 'Malformed message' });
      return;
    }
    switch (message.type) {
      case 'prompt':
        void this.prompt(message);
        break;
      case 'cancel':
        void this.cancel();
        break;
      case 'tool_result':
        this.settleToolCall(message.callId, message.ok, message.result, message.error);
        break;
      case 'end':
        this.close();
        break;
      default:
        this.send({ type: 'error', message: `Unexpected message "${(message as { type: string }).type}"` });
    }
  }

  private async start(): Promise<void> {
    this.workDir = mkdtempSync(join(tmpdir(), 'kidraw-agent-'));
    this.endpoint = this.bridge.register((name, args) => this.invokeTool(name, args));
    this.agent = startAgent(this.config, this.name, this.workDir);
    const { child } = this.agent;
    child.stderr?.on('data', chunk => this.log(`[${this.name} agent] ${String(chunk).trimEnd()}`));
    child.on('exit', code => {
      if (this.state !== 'closed') this.fail(`Agent exited (code ${code})`);
    });

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    const endpoint = this.endpoint;

    await new Promise<void>((ready, failed) => {
      acp.client({ name: 'kidraw-agent' })
        .onRequest(acp.methods.client.session.requestPermission, ctx => this.decidePermission(ctx.params))
        .connectWith(stream, async ctx => {
          await ctx.request(acp.methods.agent.initialize, {
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
          });
          this.context = ctx;
          this.session = await ctx.buildSession({
            cwd: this.agent!.agentCwd,
            mcpServers: [{ type: 'http', name: 'kidraw', url: endpoint.url, headers: endpoint.headers }],
          }).start();
          // The tab may have gone away while the agent was starting.
          if (this.state === 'closed') {
            ready();
            return;
          }
          this.state = 'ready';
          this.sendReady(false);
          this.log(`[${this.name}] session ready (${this.agentName}, runner=${this.config.runner})`);
          if (!this.ws) this.detach();
          ready();
          // Keep the ACP connection open for the life of the session.
          await new Promise<void>(release => { this.releaseConnection = release; });
        })
        .catch(err => failed(err));
    });
  }

  private async prompt(message: PromptMessage): Promise<void> {
    if (this.state !== 'ready' || !this.session) {
      this.send({ type: 'error', message: 'Agent is not ready yet' });
      return;
    }
    if (this.busy) {
      this.send({ type: 'error', message: 'Agent is still answering; wait or cancel first' });
      return;
    }
    this.busy = true;
    const refs = message.refs ?? [];
    this.pushHistory(refs.length > 0 ? { role: 'user', text: message.text, refs } : { role: 'user', text: message.text });
    const session = this.session;
    try {
      const text = this.buildPromptText(message.text, refs);
      // A failed prompt never produces a `stop` update, so race the update
      // stream against the prompt's own rejection; otherwise the turn hangs.
      const failed = session.prompt(text).then(
        () => new Promise<never>(() => {}),
        (err: unknown) => { throw err; },
      );
      for (;;) {
        const update = await Promise.race([session.nextUpdate(), failed]);
        if (update.kind === 'stop') {
          this.emit({ type: 'turn_end', stopReason: update.stopReason });
          break;
        }
        this.relayUpdate(update.update);
      }
    } catch (err) {
      this.emit({ type: 'error', message: `Agent error: ${(err as Error).message}` });
      this.emit({ type: 'turn_end', stopReason: 'error' });
    } finally {
      this.busy = false;
    }
  }

  private buildPromptText(text: string, refs: CanvasRef[]): string {
    const parts: string[] = [];
    if (this.firstPrompt) {
      parts.push(SESSION_PREAMBLE, '');
      this.firstPrompt = false;
    }
    if (refs.length > 0) {
      parts.push('The user is pointing at: ' + refs.map(r => `[[ref:${r.id}|${r.label}]] (${r.kind})`).join(', '), '');
    }
    parts.push(text);
    return parts.join('\n');
  }

  private relayUpdate(update: acp.SessionNotification['update']): void {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        if (update.content.type === 'text') this.emit({ type: 'agent_text', delta: update.content.text });
        break;
      case 'tool_call':
        this.emit({ type: 'agent_activity', title: update.title, status: update.status ?? 'pending' });
        break;
      case 'tool_call_update':
        if (update.status) {
          this.emit({ type: 'agent_activity', title: update.title ?? update.toolCallId, status: update.status });
        }
        break;
      default:
        break;
    }
  }

  private async cancel(): Promise<void> {
    if (!this.context || !this.session) return;
    await this.context.notify(acp.methods.agent.session.cancel, { sessionId: this.session.sessionId });
  }

  private decidePermission(params: acp.RequestPermissionRequest): acp.RequestPermissionResponse {
    const kind = params.toolCall.kind ?? 'other';
    const allow = AUTO_APPROVED_KINDS.has(kind)
      ? params.options.find(o => o.kind === 'allow_once') ?? params.options.find(o => o.kind === 'allow_always')
      : undefined;
    if (allow) {
      return { outcome: { outcome: 'selected', optionId: allow.optionId } };
    }
    const title = params.toolCall.title ?? kind;
    this.emit({ type: 'agent_activity', title: `Blocked: ${title}`, status: 'failed' });
    const reject = params.options.find(o => o.kind === 'reject_once') ?? params.options.find(o => o.kind === 'reject_always');
    return reject
      ? { outcome: { outcome: 'selected', optionId: reject.optionId } }
      : { outcome: { outcome: 'cancelled' } };
  }

  private invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.state !== 'ready' || !this.ws) return Promise.reject(new Error('KiDraw tab is not connected'));
    const callId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId);
        reject(new Error(`KiDraw did not answer "${name}" in time`));
      }, this.config.toolTimeoutMs);
      this.pending.set(callId, { resolve, reject, timer });
      this.send({ type: 'tool_call', callId, name, args });
    });
  }

  private settleToolCall(callId: string, ok: boolean, result: unknown, error: string | undefined): void {
    const call = this.pending.get(callId);
    if (!call) return;
    this.pending.delete(callId);
    clearTimeout(call.timer);
    if (ok) call.resolve(result);
    else call.reject(new Error(error ?? 'Tool failed in KiDraw'));
  }

  private rejectPending(reason: string): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(new Error(reason));
    }
    this.pending.clear();
  }

  close(): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.rejectPending('KiDraw session ended');
    this.releaseConnection();
    this.agent?.stop();
    this.endpoint?.dispose();
    if (this.workDir) rmSync(this.workDir, { recursive: true, force: true });
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState === ws.OPEN) ws.close(1000, 'Session ended');
    this.log(`[${this.name}] session closed`);
    this.onClosed(this);
  }
}
