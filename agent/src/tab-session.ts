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
import {
  DETAIL_LEVELS, type AgentOption, type CanvasRef, type DetailLevel, type HistoryEntry, type OptionChoice,
  type PromptMessage, type ServerToTab, type TabToServer,
} from './protocol.js';
import { startAgent, type StartedAgent } from './runners.js';
import { DETAIL_GUIDANCE, SESSION_PREAMBLE, SOURCE_GUIDANCE } from './tools.js';

type Log = (message: string) => void;

interface PendingToolCall {
  resolve(result: unknown): void;
  reject(err: Error): void;
  timer: NodeJS.Timeout;
}

/** Transcript entries kept for a tab that resumes. */
const MAX_HISTORY = 300;

/**
 * Agent settings the chat may change. Deliberately only these two: the agent
 * also offers its sandbox mode as a setting, and a tab must never be able to
 * take the session out of read-only.
 */
const TUNABLE_OPTIONS: readonly string[] = ['model', 'reasoning_effort'];

/** Signing in without a browser on the server: the user opens a page and types a code. */
const DEVICE_CODE_AUTH = 'chat-gpt-device-code';

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
  /** Agent settings the tab may change (model, reasoning effort), as last known. */
  private options: AgentOption[] = [];
  /** What the tab asked for before the session existed; applied once it does. */
  private preferredOptions: OptionChoice[] = [];
  /** The agent offers the device-code sign-in this panel can drive. */
  private canSignIn = false;
  /** A sign-in waiting for the user: the page and code to show, and the agent's open request. */
  private signIn: { prompt: ServerToTab & { type: 'sign_in_prompt' }; settle: (accepted: boolean) => void } | null = null;
  private signingIn = false;
  /** The detail level the agent was last told about. */
  private lastDetail: DetailLevel | null = null;
  /** `open` marks an agent reply that is still streaming. */
  private readonly history: (HistoryEntry & { open?: boolean })[] = [];
  private readonly pending = new Map<string, PendingToolCall>();
  /** Agent tool-call titles by id: updates often omit the title. */
  private readonly toolTitles = new Map<string, string>();
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
  begin(ws: WebSocket, agentName: string, options: OptionChoice[] = []): void {
    this.agentName = agentName;
    this.preferredOptions = options;
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
      this.rejectPending('KiDraw tab reconnected');
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
      options: this.options,
      canSignIn: this.canSignIn,
    });
    // A tab that reloaded mid sign-in gets the page and code back.
    if (this.signIn) this.send(this.signIn.prompt);
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
        this.settleToolCall(message.callId, message.ok, message.result, message.error);
        break;
      case 'set_option':
        void this.setOption(message.id, message.value);
        break;
      case 'sign_in':
        void this.startSignIn(message.switchAccount === true);
        break;
      case 'cancel_sign_in':
        this.signIn?.settle(false);
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
        .onRequest(acp.methods.client.elicitation.create, ctx => this.onElicitation(ctx.params))
        .onNotification(acp.methods.client.elicitation.complete, () => { this.signIn?.settle(true); })
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
          this.canSignIn = (hello.authMethods ?? []).some(method => method.id === DEVICE_CODE_AUTH);
          this.context = ctx;
          this.session = await ctx.buildSession({
            cwd: this.agent!.agentCwd,
            mcpServers: [{ type: 'http', name: 'kidraw', url: endpoint.url, headers: endpoint.headers }],
          }).start();
          this.readOptions(this.session.newSessionResponse.configOptions);
          await this.applyPreferredOptions();
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
      const text = this.buildPromptText(message.text, refs, message.detail);
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

  private buildPromptText(text: string, refs: CanvasRef[], detail: unknown): string {
    const parts: string[] = [];
    if (this.firstPrompt) {
      parts.push(SESSION_PREAMBLE, '');
      if (this.config.sourceDir) parts.push(SOURCE_GUIDANCE, '');
      this.firstPrompt = false;
    }
    // Only when it changes: the agent follows the most recent one.
    if (DETAIL_LEVELS.includes(detail as DetailLevel) && detail !== this.lastDetail) {
      this.lastDetail = detail as DetailLevel;
      parts.push(DETAIL_GUIDANCE[this.lastDetail], '');
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

  private async cancel(): Promise<void> {
    if (!this.context || !this.session) return;
    await this.context.notify(acp.methods.agent.session.cancel, { sessionId: this.session.sessionId });
  }

  // ─── Model, reasoning effort and signing in ─────────────────────────────

  /** Keep the settings the tab may change, in the order the agent lists them. */
  private readOptions(configOptions: acp.SessionConfigOption[] | null | undefined): void {
    this.options = (configOptions ?? [])
      .filter(option => option.type === 'select' && TUNABLE_OPTIONS.includes(option.id))
      .map(option => ({
        id: option.id,
        name: option.name,
        current: String((option as acp.SessionConfigOption & { currentValue: unknown }).currentValue),
        choices: selectChoices(option as acp.SessionConfigOption & { options: acp.SessionConfigSelectOptions }),
      }));
  }

  /** Put the session on the model and effort the user last chose, before it takes a prompt. */
  private async applyPreferredOptions(): Promise<void> {
    const wanted = this.preferredOptions;
    this.preferredOptions = [];
    for (const choice of wanted) {
      const option = this.options.find(o => o.id === choice.id);
      if (!option || option.current === choice.value) continue;
      if (!option.choices.some(c => c.value === choice.value)) continue;
      try {
        await this.requestOption(choice.id, choice.value);
      } catch (err) {
        // A model the account can no longer use shouldn't stop the session starting.
        this.log(`[${this.name}] could not set ${choice.id}=${choice.value}: ${(err as Error).message}`);
      }
    }
  }

  private async setOption(id: string, value: string): Promise<void> {
    if (this.state !== 'ready' || !this.session || !this.context) {
      this.send({ type: 'error', message: 'Agent is not ready yet' });
      return;
    }
    const option = this.options.find(o => o.id === id);
    const choice = option?.choices.find(c => c.value === value);
    if (!option || !choice) {
      this.send({ type: 'error', message: `The agent has no "${id}" setting "${value}"` });
      this.send({ type: 'options', options: this.options });
      return;
    }
    if (this.busy) {
      this.send({ type: 'error', message: `Wait for the answer to finish, or stop it, before changing the ${option.name.toLowerCase()}` });
      return;
    }
    try {
      await this.requestOption(id, value);
      this.emit({ type: 'agent_activity', title: `${option.name}: ${choice.name}`, status: 'completed' });
    } catch (err) {
      this.emit({ type: 'error', message: `Couldn't change the ${option.name.toLowerCase()}: ${(err as Error).message}` });
    }
    this.send({ type: 'options', options: this.options });
  }

  private async requestOption(id: string, value: string): Promise<void> {
    const response = await this.context!.request(acp.methods.agent.session.setConfigOption, {
      sessionId: this.session!.sessionId, configId: id, value,
    });
    // The agent answers with the whole set: one change can move another (a
    // model that doesn't offer the effort level that was selected, say).
    this.readOptions(response.configOptions);
  }

  /**
   * Sign this server's agent in to its provider, without a browser on the
   * server: the agent gives us a page and a one-time code, the chat shows
   * them, and the login finishes when the user has entered it.
   */
  private async startSignIn(switchAccount: boolean): Promise<void> {
    if (this.state !== 'ready' || !this.context) {
      this.send({ type: 'error', message: 'Agent is not ready yet' });
      return;
    }
    if (!this.canSignIn) {
      this.send({ type: 'sign_in_done', ok: false, message: 'This agent cannot be signed in from the chat.' });
      return;
    }
    if (this.signingIn) {
      this.send({ type: 'error', message: 'A sign-in is already in progress' });
      return;
    }
    this.signingIn = true;
    try {
      // Already signed in, the agent returns straight away; signing out first
      // is what makes a different account possible.
      if (switchAccount) await this.context.request(acp.methods.agent.logout, {});
      await this.context.request(acp.methods.agent.authenticate, { methodId: DEVICE_CODE_AUTH });
      // Sessions get a copy of the login, so keep this one for the next session too.
      this.agent?.saveLogin();
      this.emit({ type: 'agent_activity', title: 'Signed in', status: 'completed' });
      this.send({ type: 'sign_in_done', ok: true, message: 'Signed in. New messages use this account.' });
    } catch (err) {
      const message = this.signIn === null && !switchAccount
        ? `Sign-in didn't finish: ${(err as Error).message}`
        : `Sign-in failed: ${(err as Error).message}`;
      this.send({ type: 'sign_in_done', ok: false, message });
    } finally {
      this.signingIn = false;
      this.clearSignIn();
    }
  }

  /** The agent asks us to put a sign-in page in front of the user. */
  private onElicitation(params: acp.CreateElicitationRequest): Promise<acp.CreateElicitationResponse> {
    if (params.mode !== 'url') {
      // KiDraw's chat shows a sign-in page and nothing else; it fills in no forms.
      return Promise.resolve({ action: 'decline' as const, content: null });
    }
    const url = typeof params.url === 'string' ? params.url : '';
    if (!url) return Promise.resolve({ action: 'decline' as const, content: null });
    this.signIn?.settle(false);
    const message = typeof params.message === 'string' ? params.message : 'Sign in to continue.';
    const prompt = { type: 'sign_in_prompt' as const, url, code: codeIn(message), message };
    return new Promise<acp.CreateElicitationResponse>(resolve => {
      this.signIn = {
        prompt,
        settle: accepted => {
          this.signIn = null;
          resolve(accepted ? { action: 'accept', content: null } : { action: 'cancel', content: null });
        },
      };
      this.send(prompt);
    });
  }

  private clearSignIn(): void {
    this.signIn?.settle(false);
    this.signIn = null;
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
    this.clearSignIn();
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

/** A select setting's choices, whether the agent groups them or not. */
function selectChoices(option: { options: acp.SessionConfigSelectOptions }): { value: string; name: string; description?: string }[] {
  const flat = option.options.flatMap(entry => ('group' in entry ? entry.options : [entry]));
  return flat.map(choice => ({
    value: choice.value,
    name: choice.name,
    ...(choice.description ? { description: choice.description } : {}),
  }));
}

/** The one-time code out of "…enter this code: ABCD-EFGH", for showing on its own. */
function codeIn(message: string): string | null {
  return /code:\s*([A-Za-z0-9][A-Za-z0-9-]{3,})/.exec(message)?.[1] ?? null;
}
