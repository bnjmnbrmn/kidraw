import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type { WebSocket } from 'ws';
import { tokensMatch, type AgentServerConfig } from './config.js';
import type { McpBridge, McpEndpoint } from './mcp-bridge.js';
import {
  PROTOCOL_VERSION, type CanvasRef, type PromptMessage, type ServerToTab, type TabToServer,
} from './protocol.js';
import { startAgent, SUPPORTED_AGENTS, type StartedAgent } from './runners.js';
import { SESSION_PREAMBLE } from './tools.js';

type Log = (message: string) => void;

interface PendingToolCall {
  resolve(result: unknown): void;
  reject(err: Error): void;
  timer: NodeJS.Timeout;
}

/** Tool-call kinds a read-only KiDraw session may approve without asking. */
const AUTO_APPROVED_KINDS = new Set(['read', 'search', 'think', 'fetch', 'other']);

/**
 * One KiDraw tab ↔ one ACP agent session.
 *
 * Lifecycle: the tab's first message must be a valid `hello` (token, protocol,
 * agent); the session then starts an agent process, opens an ACP session with
 * KiDraw's MCP endpoint attached, and relays prompts, replies, and tool calls
 * until the socket closes.
 */
export class TabSession {
  private state: 'awaiting_hello' | 'starting' | 'ready' | 'closed' = 'awaiting_hello';
  private readonly name = randomUUID().slice(0, 8);
  private agent: StartedAgent | null = null;
  private endpoint: McpEndpoint | null = null;
  private workDir: string | null = null;
  private context: acp.ClientContext | null = null;
  private session: acp.ActiveSession | null = null;
  private busy = false;
  private firstPrompt = true;
  private readonly pending = new Map<string, PendingToolCall>();
  private releaseConnection: () => void = () => {};

  constructor(
    private readonly ws: WebSocket,
    private readonly config: AgentServerConfig,
    private readonly bridge: McpBridge,
    private readonly token: string,
    private readonly log: Log,
  ) {
    ws.on('message', data => this.onMessage(data.toString()));
    ws.on('close', () => this.close());
    ws.on('error', () => this.close());
  }

  private send(message: ServerToTab): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(message));
  }

  private fail(message: string, code = 4000): void {
    this.send({ type: 'error', message, fatal: true });
    this.ws.close(code, message.slice(0, 120));
    this.close();
  }

  private onMessage(raw: string): void {
    let message: TabToServer;
    try {
      message = JSON.parse(raw) as TabToServer;
    } catch {
      this.fail('Malformed message');
      return;
    }

    if (this.state === 'awaiting_hello') {
      if (message.type !== 'hello' || !tokensMatch(this.token, message.token)) {
        this.fail('Not authorized', 4401);
        return;
      }
      if (message.protocol !== PROTOCOL_VERSION) {
        this.fail(`Protocol ${message.protocol} not supported (server speaks ${PROTOCOL_VERSION})`);
        return;
      }
      const agentName = this.config.runner === 'fake' ? 'codex' : message.agent;
      if (!(SUPPORTED_AGENTS as readonly string[]).includes(agentName)) {
        this.fail(`Unknown agent "${message.agent}"`);
        return;
      }
      this.state = 'starting';
      this.start(message.agent).catch(err => this.fail(`Agent failed to start: ${(err as Error).message}`));
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
      default:
        this.send({ type: 'error', message: `Unexpected message "${(message as { type: string }).type}"` });
    }
  }

  private async start(agentName: string): Promise<void> {
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
          this.state = 'ready';
          this.send({ type: 'ready', agent: agentName });
          this.log(`[${this.name}] session ready (${agentName}, runner=${this.config.runner})`);
          ready();
          // Keep the ACP connection open for the life of the tab session.
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
    try {
      const text = this.buildPromptText(message.text, message.refs ?? []);
      void this.session.prompt(text).catch(() => {});
      for (;;) {
        const update = await this.session.nextUpdate();
        if (update.kind === 'stop') {
          this.send({ type: 'turn_end', stopReason: update.stopReason });
          break;
        }
        this.relayUpdate(update.update);
      }
    } catch (err) {
      this.send({ type: 'error', message: `Agent error: ${(err as Error).message}` });
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
        if (update.content.type === 'text') this.send({ type: 'agent_text', delta: update.content.text });
        break;
      case 'tool_call':
        this.send({ type: 'agent_activity', title: update.title, status: update.status ?? 'pending' });
        break;
      case 'tool_call_update':
        if (update.status) {
          this.send({ type: 'agent_activity', title: update.title ?? update.toolCallId, status: update.status });
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
    this.send({ type: 'agent_activity', title: `Blocked: ${title}`, status: 'failed' });
    const reject = params.options.find(o => o.kind === 'reject_once') ?? params.options.find(o => o.kind === 'reject_always');
    return reject
      ? { outcome: { outcome: 'selected', optionId: reject.optionId } }
      : { outcome: { outcome: 'cancelled' } };
  }

  private invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.state !== 'ready') return Promise.reject(new Error('KiDraw tab is not connected'));
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

  close(): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(new Error('KiDraw tab disconnected'));
    }
    this.pending.clear();
    this.releaseConnection();
    this.agent?.stop();
    this.endpoint?.dispose();
    if (this.workDir) rmSync(this.workDir, { recursive: true, force: true });
    this.log(`[${this.name}] session closed`);
  }
}
