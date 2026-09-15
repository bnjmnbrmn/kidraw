import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decidePermission, isReadOnlyCommand, isReadOnlyCommandRequest } from '../permissions.js';

test('commands that only read the workspace are recognised', () => {
  for (const command of [
    `"head -n 5 dev-status.md; echo '---DEBUG---'; cat tools/debug.log"`,
    'rg -n "readingPath" src/app | head -20',
    "sed -n '1,80p' notes/README.md",
    'git log --oneline -20',
    'git show --stat HEAD',
    'find src -name "*.spec.ts" | wc -l',
    'ls -la /workspace/source && pwd',
  ]) {
    assert.ok(isReadOnlyCommand(command), command);
  }
});

test('anything that could write, run other programs or reach outside the workspace is not', () => {
  for (const command of [
    'cat notes/README.md > copy.md',
    'rm -rf notes',
    'curl https://example.com',
    'find . -name x -delete',
    'find . -exec rm {} ;',
    "sed -i 's/a/b/' README.md",
    "sed -n 'w out.txt' README.md",
    'cat /home/node/.codex/auth.json',
    'cat ../secret',
    'echo $(whoami)',
    'echo `whoami`',
    'git -c core.pager=less log',
    'git push',
    'git diff --ext-diff',
    'rg --pre ./script foo',
    'sleep 100 &',
    '',
  ]) {
    assert.ok(!isReadOnlyCommand(command), command);
  }
});

test('a read-only command request is approved; a command outside the workspace or a writing one is refused', () => {
  const options = [
    { optionId: 'yes', kind: 'allow_once', name: 'Allow' },
    { optionId: 'no', kind: 'reject_once', name: 'Reject' },
  ];
  const request = (command: string, cwd = '/workspace/source') => ({
    sessionId: 's', options,
    toolCall: { toolCallId: 't', kind: 'execute', title: 'Run command', rawInput: { command, cwd } },
  }) as never;

  const read = decidePermission(request('"head -n 5 dev-status.md"'), () => undefined);
  assert.deepEqual(read.response, { outcome: { outcome: 'selected', optionId: 'yes' } });
  assert.equal(read.refused, undefined);

  const write = decidePermission(request('"touch x"'), () => undefined);
  assert.deepEqual(write.response, { outcome: { outcome: 'selected', optionId: 'no' } });

  assert.equal(isReadOnlyCommandRequest({ command: 'cat notes/README.md', cwd: '/home/node' }), false);
});
