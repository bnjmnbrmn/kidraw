import { randomBytes, randomUUID } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { tokensMatch, type AgentServerConfig } from './config.js';
import { CANVAS_TOOLS } from './tools.js';

/** Runs a canvas tool in the tab that owns the session and returns its result. */
export type ToolInvoker = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export interface McpEndpoint {
  url: string;
  headers: { name: string; value: string }[];
  dispose(): void;
}

interface EndpointState {
  secret: string;
  invoke: ToolInvoker;
  transports: Map<string, StreamableHTTPServerTransport>;
}

/**
 * One HTTP server hosting a separate MCP endpoint per tab session
 * (`/mcp/<id>`, bearer-secret protected). An agent calling a tool here is
 * routed to exactly one tab.
 */
export class McpBridge {
  private readonly endpoints = new Map<string, EndpointState>();
  private server: http.Server | null = null;
  private port = 0;

  constructor(private readonly config: AgentServerConfig) {}

  async start(): Promise<number> {
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch(err => {
        if (!res.headersSent) res.writeHead(500).end(String(err));
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.config.mcpPort, this.config.mcpHost, () => resolve());
    });
    this.port = (this.server.address() as AddressInfo).port;
    return this.port;
  }

  async stop(): Promise<void> {
    for (const state of this.endpoints.values()) {
      for (const transport of state.transports.values()) await transport.close();
    }
    this.endpoints.clear();
    await new Promise<void>(resolve => this.server ? this.server.close(() => resolve()) : resolve());
  }

  register(invoke: ToolInvoker): McpEndpoint {
    const id = randomUUID();
    const secret = randomBytes(24).toString('base64url');
    this.endpoints.set(id, { secret, invoke, transports: new Map() });
    return {
      url: `http://${this.config.mcpAdvertisedHost}:${this.port}/mcp/${id}`,
      headers: [{ name: 'Authorization', value: `Bearer ${secret}` }],
      dispose: () => {
        const state = this.endpoints.get(id);
        this.endpoints.delete(id);
        state?.transports.forEach(t => void t.close());
      },
    };
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const match = /^\/mcp\/([0-9a-f-]{36})$/.exec((req.url ?? '').split('?')[0]);
    const state = match ? this.endpoints.get(match[1]) : undefined;
    if (!state) {
      res.writeHead(404).end();
      return;
    }
    const auth = req.headers['authorization'] ?? '';
    if (!tokensMatch(`Bearer ${state.secret}`, auth)) {
      res.writeHead(401).end();
      return;
    }

    const body = req.method === 'POST' ? await readJson(req) : undefined;
    const sessionId = req.headers['mcp-session-id'];
    const existing = typeof sessionId === 'string' ? state.transports.get(sessionId) : undefined;
    if (existing) {
      await existing.handleRequest(req, res, body);
      return;
    }
    if (req.method !== 'POST' || !isInitializeRequest(body)) {
      res.writeHead(400).end('No MCP session');
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: sid => { state.transports.set(sid, transport); },
    });
    transport.onclose = () => {
      if (transport.sessionId) state.transports.delete(transport.sessionId);
    };
    await buildMcpServer(state.invoke).connect(transport);
    await transport.handleRequest(req, res, body);
  }
}

function buildMcpServer(invoke: ToolInvoker): McpServer {
  const server = new McpServer({ name: 'kidraw', version: '0.1.0' });
  for (const tool of CANVAS_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        try {
          const result = await invoke(tool.name, args ?? {});
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (err) {
          return { content: [{ type: 'text' as const, text: (err as Error).message }], isError: true };
        }
      },
    );
  }
  return server;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('MCP request too large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : undefined); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}
