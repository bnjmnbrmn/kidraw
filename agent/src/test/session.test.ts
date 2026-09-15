import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import WebSocket from 'ws';
import { loadConfig } from '../config.js';
import type { ServerToTab } from '../protocol.js';
import { startServer, type RunningServer } from '../server.js';

const ORIGIN = 'http://localhost:4200';
const TOKEN = 'test-token-0123456789';
let server: RunningServer;
let dir: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kidraw-agent-test-'));
  const config = {
    ...loadConfig({}),
    port: 0,
    mcpPort: 0,
    runner: 'fake' as const,
    allowedOrigins: [ORIGIN],
    tokenFile: join(dir, 'token'),
    toolTimeoutMs: 5_000,
  };
  server = await startServer(config, TOKEN, () => {});
});

after(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A tab-side test client that records messages and can wait for one. */
function connect(origin = ORIGIN) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/`, { origin });
  const received: ServerToTab[] = [];
  const waiters: { predicate: (m: ServerToTab) => boolean; resolve: (m: ServerToTab) => void }[] = [];
  ws.on('message', data => {
    const message = JSON.parse(data.toString()) as ServerToTab;
    received.push(message);
    for (const w of [...waiters]) {
      if (w.predicate(message)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(message);
      }
    }
  });
  const next = <T extends ServerToTab['type']>(type: T, timeoutMs = 10_000) =>
    new Promise<Extract<ServerToTab, { type: T }>>((resolve, reject) => {
      const found = received.find(m => m.type === type);
      if (found) {
        received.splice(received.indexOf(found), 1);
        resolve(found as Extract<ServerToTab, { type: T }>);
        return;
      }
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
      waiters.push({
        predicate: m => m.type === type,
        resolve: m => { clearTimeout(timer); received.splice(received.indexOf(m), 1); resolve(m as Extract<ServerToTab, { type: T }>); },
      });
    });
  const opened = new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
  const send = (message: unknown) => ws.send(JSON.stringify(message));
  return { ws, next, opened, send };
}

test('rejects a connection from an origin that is not allowed', async () => {
  const tab = connect('https://evil.example');
  await assert.rejects(tab.opened);
});

test('rejects a wrong token and closes the socket', async () => {
  const tab = connect();
  await tab.opened;
  tab.send({ type: 'hello', protocol: 1, token: 'wrong', agent: 'codex' });
  const error = await tab.next('error');
  assert.equal(error.fatal, true);
  assert.match(error.message, /Not authorized/);
  await new Promise(resolve => tab.ws.once('close', resolve));
});

test('relays a prompt, routes a tool call to the tab, and streams the reply', async () => {
  const tab = connect();
  await tab.opened;
  tab.send({ type: 'hello', protocol: 1, token: TOKEN, agent: 'codex' });
  await tab.next('ready');

  tab.send({ type: 'prompt', text: 'TOOL focus {"node":"Pre-MVP"}' });
  const call = await tab.next('tool_call');
  assert.equal(call.name, 'focus');
  assert.deepEqual(call.args, { node: 'Pre-MVP' });
  tab.send({ type: 'tool_result', callId: call.callId, ok: true, result: { focused: 'n1' } });

  const text = await tab.next('agent_text');
  assert.match(text.delta, /RESULT focus: \{"focused":"n1"\}/);
  const end = await tab.next('turn_end');
  assert.equal(end.stopReason, 'end_turn');
  tab.ws.close();
});

test('reports a tool error from the tab back to the agent', async () => {
  const tab = connect();
  await tab.opened;
  tab.send({ type: 'hello', protocol: 1, token: TOKEN, agent: 'codex' });
  await tab.next('ready');

  tab.send({ type: 'prompt', text: 'TOOL caption {"node":"Nope","text":"hi"}' });
  const call = await tab.next('tool_call');
  tab.send({ type: 'tool_result', callId: call.callId, ok: false, error: 'No node matches "Nope"' });
  const text = await tab.next('agent_text');
  assert.match(text.delta, /ERROR caption: No node matches "Nope"/);
  await tab.next('turn_end');
  tab.ws.close();
});
