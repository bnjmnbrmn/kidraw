import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
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
 * Start one ACP agent process for one tab session.
 *
 * - `local`: codex-acp as a child process of this server (development).
 * - `docker`: codex-acp inside a throwaway container that can see only the
 *   Codex login and an empty workspace.
 * - `fake`: a scripted ACP agent used by tests.
 */
export function startAgent(config: AgentServerConfig, sessionName: string, localWorkDir: string): StartedAgent {
  const stdio: ['pipe', 'pipe', 'pipe'] = ['pipe', 'pipe', 'pipe'];

  if (config.runner === 'fake') {
    const child = spawn(process.execPath, [FAKE_AGENT_ENTRY], { cwd: localWorkDir, stdio });
    return { child, agentCwd: localWorkDir, stop: () => child.kill('SIGTERM') };
  }

  // Create it ourselves (mode 700); a missing bind-mount source would be created root-owned by Docker.
  mkdirSync(config.codexHome, { recursive: true, mode: 0o700 });

  if (config.runner === 'local') {
    const child = spawn(process.execPath, [CODEX_ACP_ENTRY], {
      cwd: localWorkDir,
      stdio,
      env: { ...process.env, ...CODEX_ENV, CODEX_HOME: config.codexHome },
    });
    return { child, agentCwd: localWorkDir, stop: () => child.kill('SIGTERM') };
  }

  const containerName = `kidraw-agent-${sessionName}`;
  const args = [
    'run', '-i', '--rm', '--init',
    '--name', containerName,
    '--add-host', 'host.docker.internal:host-gateway',
    '--memory', '1g', '--cpus', '1', '--pids-limit', '256',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '-e', `INITIAL_AGENT_MODE=${CODEX_ENV.INITIAL_AGENT_MODE}`,
    '-e', `NO_BROWSER=${CODEX_ENV.NO_BROWSER}`,
    '-v', `${config.codexHome}:/home/node/.codex`,
    config.dockerImage,
  ];
  const child = spawn('docker', args, { stdio });
  return {
    child,
    agentCwd: '/workspace',
    stop: () => {
      spawnSync('docker', ['kill', containerName], { stdio: 'ignore' });
      child.kill('SIGTERM');
    },
  };
}
