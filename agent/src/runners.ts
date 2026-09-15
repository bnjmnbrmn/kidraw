import { spawn, type ChildProcess } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { AGENT_PACKAGE_ROOT, type AgentServerConfig } from './config.js';

/** Agents this server knows how to start. */
export const SUPPORTED_AGENTS = ['codex'] as const;

export interface StartedAgent {
  child: ChildProcess;
  /** Working directory as the agent sees it (ACP `cwd`). */
  agentCwd: string;
  stop(): void;
}

const CODEX_ACP_ENTRY = join(AGENT_PACKAGE_ROOT, 'node_modules', '@agentclientprotocol', 'codex-acp', 'dist', 'index.js');
const FAKE_AGENT_ENTRY = join(AGENT_PACKAGE_ROOT, 'dist', 'fake-agent.js');

/** Codex starts in read-only mode and never opens a browser for login. */
const CODEX_ENV = { INITIAL_AGENT_MODE: 'read-only', NO_BROWSER: '1' };

/**
 * Codex settings for one KiDraw session: no history or memories (so nothing
 * from one graph's session can reach another) and no web search of its own.
 */
export const SESSION_CODEX_CONFIG = `# Written by kidraw-agent for a single KiDraw session.
web_search = "disabled"

[history]
persistence = "none"

[features]
memories = false
`;

export interface SessionCodexHome {
  dir: string;
  /** Copy back a login Codex refreshed during the session, then delete the directory. Safe to call twice. */
  finish(): void;
}

export function sessionHomesDir(config: AgentServerConfig): string {
  return join(dirname(config.codexHome), 'sessions');
}

/**
 * A private CODEX_HOME for one session. It holds a copy of kidraw-agent's
 * Codex login (`codexHome/auth.json`) and the restrictive config above, and
 * nothing else, so sessions never see each other's history, logs or memories.
 */
export function prepareSessionCodexHome(config: AgentServerConfig, sessionName: string): SessionCodexHome {
  const baseAuth = join(config.codexHome, 'auth.json');
  const dir = join(sessionHomesDir(config), sessionName);
  const sessionAuth = join(dir, 'auth.json');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (existsSync(baseAuth)) copyFileSync(baseAuth, sessionAuth);
  writeFileSync(join(dir, 'config.toml'), SESSION_CODEX_CONFIG, { mode: 0o600 });

  let finished = false;
  return {
    dir,
    finish: () => {
      if (finished) return;
      finished = true;
      try {
        if (!existsSync(sessionAuth)) return;
        const refreshed = readFileSync(sessionAuth);
        const base = existsSync(baseAuth) ? readFileSync(baseAuth) : null;
        const newer = base === null || statSync(sessionAuth).mtimeMs > statSync(baseAuth).mtimeMs;
        if (newer && (base === null || !refreshed.equals(base))) {
          // Write then rename, so a session starting now never copies half a file.
          const temp = `${baseAuth}.${sessionName}.tmp`;
          writeFileSync(temp, refreshed, { mode: 0o600 });
          renameSync(temp, baseAuth);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Delete session homes left by a server that stopped without cleaning up. */
export function removeStaleSessionHomes(config: AgentServerConfig): void {
  rmSync(sessionHomesDir(config), { recursive: true, force: true });
}

/**
 * Start one ACP agent process for one tab session.
 *
 * - `local`: codex-acp as a child process of this server (development).
 * - `docker`: codex-acp inside a throwaway container that can see only the
 *   session's own Codex home and an empty workspace, or KiDraw's source
 *   read-only when the server shares it (see dockerRunArgs).
 * - `fake`: a scripted ACP agent used by tests.
 */
export function startAgent(config: AgentServerConfig, sessionName: string, localWorkDir: string): StartedAgent {
  const stdio: ['pipe', 'pipe', 'pipe'] = ['pipe', 'pipe', 'pipe'];

  if (config.runner === 'fake') {
    const child = spawn(process.execPath, [FAKE_AGENT_ENTRY], { cwd: localWorkDir, stdio });
    return { child, agentCwd: localWorkDir, stop: () => child.kill('SIGTERM') };
  }

  const home = prepareSessionCodexHome(config, sessionName);

  if (config.runner === 'local') {
    const child = spawn(process.execPath, [CODEX_ACP_ENTRY], {
      cwd: localWorkDir,
      stdio,
      env: { ...process.env, ...CODEX_ENV, CODEX_HOME: home.dir },
    });
    finishHomeWhenDone(child, home);
    return { child, agentCwd: localWorkDir, stop: () => child.kill('SIGTERM') };
  }

  const containerName = `kidraw-agent-${sessionName}`;
  const child = spawn('docker', dockerRunArgs(config, containerName, home.dir), { stdio });
  finishHomeWhenDone(child, home);
  return {
    child,
    agentCwd: config.sourceDir ? SOURCE_MOUNT : '/workspace',
    stop: () => {
      // Fire and forget: waiting here would stall every other tab's traffic.
      spawn('docker', ['kill', containerName], { stdio: 'ignore' }).on('error', () => {}).unref();
      child.kill('SIGTERM');
    },
  };
}

/** Where a session container sees KiDraw's source, when the server shares it. */
export const SOURCE_MOUNT = '/workspace/source';

/** Under the source directory but not source: the dev site's activity log and
 *  draft mirror (the user's own graphs and keystrokes), and bulky build output. */
const HIDDEN_SOURCE_FILES = ['tools/debug.log', 'tools/draft-mirror.json'];
const HIDDEN_SOURCE_DIRS = [
  'node_modules', 'agent/node_modules', 'dist', 'agent/dist', 'site/dist', '.angular', '.capture',
  'tools/routing-eval/.cache',
];

/**
 * `docker run` arguments for one session: a throwaway, capability-less
 * container that sees only its own Codex home, plus KiDraw's source read-only
 * when `config.sourceDir` is set (with the files above covered up).
 */
export function dockerRunArgs(config: AgentServerConfig, containerName: string, codexHomeDir: string): string[] {
  const source: string[] = [];
  if (config.sourceDir) {
    const dir = config.sourceDir;
    source.push('-v', `${dir}:${SOURCE_MOUNT}:ro`);
    // Only paths that exist: Docker can't create a mount point inside a read-only mount.
    for (const file of HIDDEN_SOURCE_FILES) {
      if (existsSync(join(dir, file))) source.push('-v', `/dev/null:${SOURCE_MOUNT}/${file}:ro`);
    }
    for (const sub of HIDDEN_SOURCE_DIRS) {
      if (existsSync(join(dir, sub))) source.push('--mount', `type=tmpfs,destination=${SOURCE_MOUNT}/${sub},tmpfs-size=1m`);
    }
  }
  return [
    'run', '-i', '--rm', '--init',
    '--name', containerName,
    '--add-host', 'host.docker.internal:host-gateway',
    '--memory', '1g', '--cpus', '1', '--pids-limit', '256',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '-e', `INITIAL_AGENT_MODE=${CODEX_ENV.INITIAL_AGENT_MODE}`,
    '-e', `NO_BROWSER=${CODEX_ENV.NO_BROWSER}`,
    '-v', `${codexHomeDir}:/home/node/.codex`,
    ...source,
    config.dockerImage,
  ];
}

function finishHomeWhenDone(child: ChildProcess, home: SessionCodexHome): void {
  child.once('exit', () => home.finish());
  // A process that fails to spawn emits 'error' and may never emit 'exit'.
  child.once('error', () => home.finish());
}
