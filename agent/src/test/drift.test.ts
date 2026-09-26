import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AGENT_PACKAGE_ROOT } from '../config.js';
import { CANVAS_TOOLS } from '../tools.js';

/**
 * The server and the KiDraw tab each keep their own copy of the protocol and
 * of the tool list (agent/src vs src/app/agent), because they build
 * separately. These checks read the tab's sources, so the copies can't drift
 * apart unnoticed: a tool the server offers but the tab can't run, or a
 * message only one side knows.
 */
const APP_AGENT_DIR = join(AGENT_PACKAGE_ROOT, '..', 'src', 'app', 'agent');

const read = (path: string) => readFileSync(path, 'utf8');
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

test('the tab implements exactly the tools the server offers', () => {
  const tabSource = read(join(APP_AGENT_DIR, 'agent-tools.ts'));
  const start = tabSource.indexOf('const TOOLS: Record<string, Tool> = {');
  assert.ok(start >= 0, 'agent-tools.ts no longer has its TOOLS table where this test looks');
  const table = tabSource.slice(start, tabSource.indexOf('\n};', start));
  const implemented = [...table.matchAll(/^  ([a-z_]+): /gm)].map(match => match[1]);
  assert.deepEqual(sorted(implemented), sorted(CANVAS_TOOLS.map(tool => tool.name)));
});

test('both copies of the protocol name the same message types', () => {
  const types = (source: string) => sorted([...source.matchAll(/type: '([a-z_]+)'/g)].map(match => match[1]));
  const server = types(read(join(AGENT_PACKAGE_ROOT, 'src', 'protocol.ts')));
  const tab = types(read(join(APP_AGENT_DIR, 'agent-protocol.ts')));
  assert.ok(server.length >= 10, `found only ${server.length} message types in agent/src/protocol.ts`);
  assert.deepEqual(tab, server);
});
