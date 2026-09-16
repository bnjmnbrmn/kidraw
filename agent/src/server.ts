import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { loadConfig, loadOrCreateToken, tokensMatch, type AgentServerConfig } from './config.js';
import { McpBridge } from './mcp-bridge.js';
import { PROTOCOL_VERSION, type TabToServer } from './protocol.js';
import { removeStaleSessionHomes, SUPPORTED_AGENTS } from './runners.js';
import { TabSession } from './tab-session.js';

export interface RunningServer {
  port: number;
  mcpPort: number;
  close(): Promise<void>;
}

const HEARTBEAT_MS = 25_000;
const HELLO_TIMEOUT_MS = 10_000;

export async function startServer(
  config: AgentServerConfig,
  token: string,
  log: (message: string) => void = console.log,
): Promise<RunningServer> {
  const bridge = new McpBridge(config);
  const mcpPort = await bridge.start();

  const wss = new WebSocketServer({
    host: config.host,
    port: config.port,
    maxPayload: 2_000_000,
    verifyClient: ({ origin }: { origin: string }) => config.allowedOrigins.includes(origin),
  });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', () => resolve());
    wss.once('error', reject);
  });

  /** Sessions by id, including ones waiting for their tab to come back. */
  const sessions = new Map<string, TabSession>();
  const alive = new WeakMap<WebSocket, boolean>();

  const refuse = (ws: WebSocket, message: string, code = 4000) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type: 'error', message, fatal: true }));
    ws.close(code, message.slice(0, 100));
  };

  // The first message must be a valid hello; it either resumes a session this
  // tab already has or begins a new one.
  const onHello = (ws: WebSocket, raw: string) => {
    let message: TabToServer;
    try {
      message = JSON.parse(raw) as TabToServer;
    } catch {
      refuse(ws, 'Malformed message');
      return;
    }
    if (typeof message !== 'object' || message === null) {
      refuse(ws, 'Malformed message');
      return;
    }
    if (message.type !== 'hello' || !tokensMatch(token, message.token)) {
      refuse(ws, 'Not authorized', 4401);
      return;
    }
    if (message.protocol !== PROTOCOL_VERSION) {
      refuse(ws, `Protocol ${message.protocol} not supported (server speaks ${PROTOCOL_VERSION})`);
      return;
    }
    const agentName = config.runner === 'fake' ? 'codex' : message.agent;
    if (!(SUPPORTED_AGENTS as readonly string[]).includes(agentName)) {
      refuse(ws, `Unknown agent "${message.agent}"`);
      return;
    }
    const existing = message.resume ? sessions.get(message.resume.sessionId) : undefined;
    if (existing?.resumable && existing.secretMatches(message.resume?.secret)) {
      existing.resume(ws);
      return;
    }
    // Every session can hold a 1 GB container; count waiting ones too.
    if (sessions.size >= config.maxSessions) {
      refuse(ws, `This agent server already has ${sessions.size} sessions (the limit). `
        + 'Close another KiDraw tab, or wait a few minutes for an idle one to end.', 4029);
      return;
    }
    const session = new TabSession(config, bridge, log, closed => sessions.delete(closed.id));
    sessions.set(session.id, session);
    session.begin(ws, agentName, Array.isArray(message.options) ? message.options : []);
  };

  wss.on('connection', ws => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const helloTimer = setTimeout(() => refuse(ws, 'No hello received'), HELLO_TIMEOUT_MS);
    ws.once('close', () => clearTimeout(helloTimer));
    ws.once('message', data => {
      clearTimeout(helloTimer);
      try {
        onHello(ws, data.toString());
      } catch (err) {
        // A throw here would escape the socket's event handler and take down every session.
        log(`hello failed: ${(err as Error).stack ?? String(err)}`);
        refuse(ws, 'Internal error');
      }
    });
  });

  // Keep proxies from timing out idle sockets, and drop dead ones.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) { ws.terminate(); continue; }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);

  const port = (wss.address() as AddressInfo).port;
  return {
    port,
    mcpPort,
    close: async () => {
      clearInterval(heartbeat);
      for (const session of [...sessions.values()]) session.close();
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await bridge.stop();
    },
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { token, created } = loadOrCreateToken(config.tokenFile);
  // Session homes hold copies of the Codex login; don't leave old ones lying around.
  if (config.runner !== 'fake') removeStaleSessionHomes(config);
  const server = await startServer(config, token);
  console.log(`kidraw-agent listening on ws://${config.host}:${server.port} (MCP on ${config.mcpHost}:${server.mcpPort}, runner=${config.runner})`);
  console.log(`allowed origins: ${config.allowedOrigins.join(', ')}`);
  if (created) console.log(`created access token in ${config.tokenFile} — paste it into KiDraw's agent settings`);
  const shutdown = () => { void server.close().then(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
