import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type RunnerKind = 'local' | 'docker' | 'fake';

export interface AgentServerConfig {
  /** Loopback address the tab-facing WebSocket server binds to (nginx proxies to it). */
  host: string;
  port: number;
  /** Where agents reach KiDraw's MCP tool endpoint. For the docker runner this
   *  must be an address containers can reach (e.g. the docker0 gateway). */
  mcpHost: string;
  mcpPort: number;
  /** Hostname agents use in the MCP URL (differs from mcpHost for containers). */
  mcpAdvertisedHost: string;
  /** Browser origins allowed to open the WebSocket. */
  allowedOrigins: string[];
  tokenFile: string;
  runner: RunnerKind;
  dockerImage: string;
  /** kidraw-agent's own Codex login (`auth.json`), separate from the user's
   *  ~/.codex. Each session gets a private copy in a sibling `sessions/`
   *  directory (runners.ts), mounted as ~/.codex in its container. */
  codexHome: string;
  /** How long a canvas tool call may wait for the tab. */
  toolTimeoutMs: number;
  /** How long a session survives without a tab, so a reload or dropped
   *  connection can pick it up again. */
  resumeGraceMs: number;
  /** Most sessions (connected or waiting for their tab) this server will hold. */
  maxSessions: number;
}

const here = dirname(fileURLToPath(import.meta.url));
export const AGENT_PACKAGE_ROOT = resolve(here, '..');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentServerConfig {
  const runner = (env['KIDRAW_AGENT_RUNNER'] ?? 'local') as RunnerKind;
  const mcpHost = env['KIDRAW_AGENT_MCP_HOST'] ?? '127.0.0.1';
  return {
    host: env['KIDRAW_AGENT_HOST'] ?? '127.0.0.1',
    port: Number(env['KIDRAW_AGENT_PORT'] ?? 9223),
    mcpHost,
    mcpPort: Number(env['KIDRAW_AGENT_MCP_PORT'] ?? 9224),
    mcpAdvertisedHost: env['KIDRAW_AGENT_MCP_ADVERTISED_HOST']
      ?? (runner === 'docker' ? 'host.docker.internal' : mcpHost),
    // Only a local dev server by default: an operator lists the KiDraw sites
    // that may connect (e.g. https://kidraw.net) in KIDRAW_AGENT_ORIGINS.
    allowedOrigins: (env['KIDRAW_AGENT_ORIGINS'] ?? 'http://localhost:4200')
      .split(',').map(s => s.trim()).filter(Boolean),
    tokenFile: env['KIDRAW_AGENT_TOKEN_FILE'] ?? join(homedir(), '.config', 'kidraw-agent', 'token'),
    runner,
    dockerImage: env['KIDRAW_AGENT_DOCKER_IMAGE'] ?? 'kidraw-agent-codex:latest',
    codexHome: env['KIDRAW_AGENT_CODEX_HOME'] ?? join(homedir(), '.config', 'kidraw-agent', 'codex'),
    toolTimeoutMs: Number(env['KIDRAW_AGENT_TOOL_TIMEOUT_MS'] ?? 30_000),
    resumeGraceMs: Number(env['KIDRAW_AGENT_RESUME_GRACE_MS'] ?? 10 * 60_000),
    maxSessions: Number(env['KIDRAW_AGENT_MAX_SESSIONS'] ?? 3),
  };
}

/** Read the shared access token, creating one (mode 600) on first run. */
export function loadOrCreateToken(tokenFile: string): { token: string; created: boolean } {
  if (existsSync(tokenFile)) {
    return { token: readFileSync(tokenFile, 'utf8').trim(), created: false };
  }
  mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 });
  const token = randomBytes(24).toString('base64url');
  writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
  chmodSync(tokenFile, 0o600);
  return { token, created: true };
}

/** Constant-time comparison, so response timing doesn't leak the token. */
export function tokensMatch(expected: string, given: unknown): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
