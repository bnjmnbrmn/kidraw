import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { loadConfig, loadOrCreateToken, type AgentServerConfig } from './config.js';
import { McpBridge } from './mcp-bridge.js';
import { TabSession } from './tab-session.js';

export interface RunningServer {
  port: number;
  mcpPort: number;
  close(): Promise<void>;
}

const HEARTBEAT_MS = 25_000;

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

  const sessions = new Set<TabSession>();
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', ws => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const session = new TabSession(ws, config, bridge, token, log);
    sessions.add(session);
    ws.on('close', () => sessions.delete(session));
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
      for (const session of sessions) session.close();
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await bridge.stop();
    },
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { token, created } = loadOrCreateToken(config.tokenFile);
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
