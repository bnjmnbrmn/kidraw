import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as acp from '@agentclientprotocol/sdk';
import { decidePermission } from '../permissions.js';

const OPTIONS = [
  { optionId: 'yes', name: 'Yes', kind: 'allow_once' },
  { optionId: 'always', name: 'Always', kind: 'allow_always' },
  { optionId: 'no', name: 'No', kind: 'reject_once' },
];

function request(toolCall: Record<string, unknown>, extra: Record<string, unknown> = {}): acp.RequestPermissionRequest {
  return { sessionId: 's1', toolCall: { toolCallId: 'call-1', ...toolCall }, options: OPTIONS, ...extra } as acp.RequestPermissionRequest;
}

const noTitles = () => undefined;
const chosen = (decision: ReturnType<typeof decidePermission>) =>
  decision.response.outcome.outcome === 'selected' ? decision.response.outcome.optionId : 'cancelled';

test('allows reading, searching and thinking, once', () => {
  for (const kind of ['read', 'search', 'think']) {
    const decision = decidePermission(request({ kind, title: kind }), noTitles);
    assert.equal(chosen(decision), 'yes', kind);
    assert.equal(decision.refused, undefined);
  }
});

test('refuses extra sandbox permissions, edits, commands, network and unknown kinds', () => {
  const cases = [
    { kind: 'other', title: 'Additional sandbox permissions' },
    { kind: 'edit', title: 'Edit files' },
    { kind: 'execute', title: 'rm -rf /' },
    { kind: 'fetch', title: 'MCP server requests to open a URL' },
    { kind: 'delete', title: 'Delete' },
    { title: 'No kind at all' },
  ];
  for (const toolCall of cases) {
    const decision = decidePermission(request(toolCall), noTitles);
    assert.equal(chosen(decision), 'no', toolCall.title);
    assert.equal(decision.refused, toolCall.title);
  }
});

test('allows approvals for KiDraw\'s own MCP tools, and only those', () => {
  const meta = { _meta: { is_mcp_tool_approval: true } };
  const kidraw = request({ kind: 'execute', title: 'MCP tool call approval', rawInput: { serverName: 'kidraw' } }, meta);
  assert.equal(chosen(decidePermission(kidraw, noTitles)), 'yes');

  const other = request({ kind: 'execute', title: 'MCP tool call approval', rawInput: { serverName: 'github' } }, meta);
  assert.equal(chosen(decidePermission(other, noTitles)), 'no');

  // Without the approval marker, an execute request is just a command.
  const unmarked = request({ kind: 'execute', rawInput: { serverName: 'kidraw' } });
  assert.equal(chosen(decidePermission(unmarked, noTitles)), 'no');
});

test('recognizes a KiDraw approval that refers to an earlier call by id', () => {
  const meta = { _meta: { is_mcp_tool_approval: true } };
  const correlated = request({ kind: 'execute', toolCallId: 'call-7' }, meta);
  assert.equal(chosen(decidePermission(correlated, id => (id === 'call-7' ? 'mcp__kidraw__get_outline' : undefined))), 'yes');
  assert.equal(chosen(decidePermission(correlated, () => 'kidraw.focus')), 'yes');
  assert.equal(chosen(decidePermission(correlated, () => 'mcp__notkidraw__x')), 'no');
  assert.equal(chosen(decidePermission(correlated, noTitles)), 'no');
});

test('cancels when a refused request offers no way to say no', () => {
  const decision = decidePermission(
    { sessionId: 's1', toolCall: { toolCallId: 'c', kind: 'edit', title: 'Edit' }, options: [OPTIONS[0]] } as acp.RequestPermissionRequest,
    noTitles,
  );
  assert.equal(chosen(decision), 'cancelled');
  assert.equal(decision.refused, 'Edit');
});
