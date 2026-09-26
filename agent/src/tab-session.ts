import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type { WebSocket } from 'ws';
import { tokensMatch, type AgentServerConfig } from './config.js';
import type { McpBridge, McpEndpoint } from './mcp-bridge.js';
import { decidePermission } from './permissions.js';
import { AgentControls } from './agent-controls.js';
import { type OptionChoice, type PromptMessage, type ServerToTab, type TabToServer } from './shared/messages.js';
import { PromptText } from './prompt-text.js';
import { PendingToolCalls } from './tool-calls.js';
import { Transcript } from './transcript.js';
import { startAgent, type StartedAgent } from './runners.js';

type Log = (message: string) => void;

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
  /** What this session would have to say again if its tab came back. */
  private readonly transcript = new Transcript();
  /** The model picker and the sign-in flow (agent-controls.ts). */
  private readonly controls = new AgentControls({
    send: message => this.send(message),
    emit: message => this.emit(message),
    log: message => this.log(`[${this.name}] ${message}`),
    isBusy: () => this.busy,
    saveLogin: () => this.agent?.saveLogin(),
  });
  /** Canvas tool calls waiting on the tab (tool-calls.ts). */
  private readonly toolCalls: PendingToolCalls;
  /** What goes with each message (prompt-text.ts). */
  private readonly promptText: PromptText;
  /** Agent tool-call titles by id: updates often omit the title. */
  private readonly toolTitles = new Map<string, string>();
  private releaseConnection: () => void = () => {};

  constructor(
    private readonly config: AgentServerConfig,
    private readonly bridge: McpBridge,
    private readonly log: Log,
    private readonly onClosed: (session: TabSession) => void,
  ) {
    this.toolCalls = new PendingToolCalls(config.toolTimeoutMs);
    this.promptText = new PromptText(Boolean(config.sourceDir));
  }

  /** Only a running session can be picked up by another socket. */
  get resumable(): boolean {
    return this.state === 'ready';
  }

  secretMatches(secret: unknown): boolean {
    return tokensMatch(this.secret, secret);
  }

  /** Start the agent for a newly connected tab. */
  begin(ws: WebSocket, agentName: string, options: OptionChoice[] = []): void {
    this.agentName = agentName;
    this.controls.prefer(options);
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
    if (previous && previous !== ws) {
      // Tool calls sent to the old socket will never be answered.
      this.toolCalls.rejectAll('KiDraw tab reconnected');
      previous.close(4001, 'Session continued in another connection');
    }
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
    this.toolCalls.rejectAll('KiDraw tab disconnected');
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
    this.transcript.record(message);
    this.send(message);
  }

  private sendReady(resumed: boolean): void {
    this.send({
      type: 'ready',
      agent: this.agentName,
      session: { id: this.id, secret: this.secret },
      resumed,
      busy: this.busy,
      history: resumed ? this.transcript.replay() : [],
      options: this.controls.list,
      canSignIn: this.controls.canSignIn,
    });
    // A tab that reloaded mid sign-in gets the page and code back.
    const signIn = this.controls.pendingPrompt;
    if (signIn) this.send(signIn);
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
      message = null as unknown as TabToServer;
    }
    if (typeof message !== 'object' || message === null || typeof message.type !== 'string') {
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
        this.toolCalls.settle(message.callId, message.ok, message.result, message.error);
        break;
      case 'set_option':
        if (this.ready()) void this.controls.set(message.id, message.value);
        break;
      case 'sign_in':
        if (this.ready()) void this.controls.startSignIn(message.switchAccount === true);
        break;
      case 'cancel_sign_in':
        this.controls.cancelSignIn();
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
    // Without a listener, a failed spawn (e.g. docker missing) would crash the whole server.
    child.on('error', err => {
      if (this.state !== 'closed') this.fail(`Agent could not start: ${err.message}`);
    });

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    const endpoint = this.endpoint;

    await new Promise<void>((ready, failed) => {
      acp.client({ name: 'kidraw-agent' })
        .onRequest(acp.methods.client.session.requestPermission, ctx => this.onPermissionRequest(ctx.params))
        // Signing in without a browser on the server: the agent hands us a page
        // and a code, and we show them in the chat until the user is done.
        .onRequest(acp.methods.client.elicitation.create, ctx => this.controls.onElicitation(ctx.params))
        .onNotification(acp.methods.client.elicitation.complete, () => this.controls.signInCompleted())
        .connectWith(stream, async ctx => {
          const hello = await ctx.request(acp.methods.agent.initialize, {
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: {
              fs: { readTextFile: false, writeTextFile: false }, terminal: false,
              // Only URL elicitation, and only so the agent can ask us to show
              // a sign-in page; it is never given a form to fill in here.
              elicitation: { url: {} },
            },
          });
          this.controls.readAuthMethods(hello.authMethods);
          this.context = ctx;
          this.session = await ctx.buildSession({
            cwd: this.agent!.agentCwd,
            mcpServers: [{ type: 'http', name: 'kidraw', url: endpoint.url, headers: endpoint.headers }],
          }).start();
          this.controls.attach(ctx, this.session);
          await this.controls.applyPreferred();
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
    this.transcript.push(refs.length > 0 ? { role: 'user', text: message.text, refs } : { role: 'user', text: message.text });
    const session = this.session;
    try {
      const text = this.promptText.compose(message.text, refs, message.detail);
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

  private relayUpdate(update: acp.SessionNotification['update']): void {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        if (update.content.type === 'text') this.emit({ type: 'agent_text', delta: update.content.text });
        break;
      case 'tool_call':
        this.toolTitles.set(update.toolCallId, update.title);
        this.emit({ type: 'agent_activity', title: update.title, status: update.status ?? 'pending' });
        break;
      case 'tool_call_update': {
        if (update.title) this.toolTitles.set(update.toolCallId, update.title);
        const title = update.title ?? this.toolTitles.get(update.toolCallId) ?? 'Tool call';
        if (update.status) this.emit({ type: 'agent_activity', title, status: update.status });
        break;
      }
      default:
        break;
    }
  }

  /** True once the agent is up; otherwise the tab is told to wait. */
  private ready(): boolean {
    if (this.state === 'ready' && this.context) return true;
    this.send({ type: 'error', message: 'Agent is not ready yet' });
    return false;
  }

  private async cancel(): Promise<void> {
    if (!this.context || !this.session) return;
    await this.context.notify(acp.methods.agent.session.cancel, { sessionId: this.session.sessionId });
  }

  private onPermissionRequest(params: acp.RequestPermissionRequest): acp.RequestPermissionResponse {
    const { response, refused } = decidePermission(params, id => this.toolTitles.get(id));
    if (refused) {
      this.emit({ type: 'agent_activity', title: `Blocked: ${refused}`, status: 'failed' });
      // What exactly was refused, for tuning the policy.
      const detail = JSON.stringify({ kind: params.toolCall.kind, rawInput: params.toolCall.rawInput, meta: params._meta });
      this.log(`[${this.name}] refused ${refused}: ${detail.slice(0, 600)}`);
    }
    return response;
  }

  private invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.state !== 'ready' || !this.ws) return Promise.reject(new Error('KiDraw tab is not connected'));
    return this.toolCalls.call(name, args, message => this.send(message));
  }

  close(): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.toolCalls.rejectAll('KiDraw session ended');
    this.controls.cancelSignIn();
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

