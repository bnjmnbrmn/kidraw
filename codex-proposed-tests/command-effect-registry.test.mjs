import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(here, '../src/app/drawing-area/drawing-area.component.ts'),
  'utf8',
);

function commandSet(name) {
  const match = source.match(
    new RegExp(`private static readonly ${name} = new Set<DACommandType>\\(\\[([\\s\\S]*?)\\n\\s*\\]\\);`),
  );
  assert.ok(match, `Could not locate ${name}`);
  return new Set(
    [...match[1].matchAll(/DACommandType\.([A-Z0-9_]+)/g)].map(item => item[1]),
  );
}

const mutating = commandSet('MUTATING_COMMANDS');
const contextAffecting = commandSet('CONTEXT_AFFECTING_COMMANDS');
const routingLocked = commandSet('ROUTING_LOCKED_COMMANDS');

// These commands directly change graph data in their handlers. Keeping this
// list here is deliberate: the proposed production fix is a typed, exhaustive
// command metadata table (or transaction API), at which point this test should
// target that public table instead of parsing source.
const persistentEdits = [
  'DELETE_CHAR_AT_CURSOR',
  'REPLACE_CHAR_AT_CURSOR',
  'CHANGE_TEXT_AT_CURSOR',
  'SET_EDGE_DIRECTEDNESS',
  'SET_LINE_STYLE',
  'APPLY_LAYOUT',
  'APPLY_EDGE_ROUTING',
];

test('persistent edits participate in the undo/autosave mutation policy', () => {
  const missing = persistentEdits.filter(command => !mutating.has(command));
  assert.deepEqual(
    missing,
    [],
    `Graph edits missing from MUTATING_COMMANDS: ${missing.join(', ')}`,
  );
});

test('commands that can change undo availability refresh header context', () => {
  const missing = [...mutating].filter(command => !contextAffecting.has(command));
  assert.deepEqual(
    missing,
    [],
    `Mutations that can leave the Undo indicator stale: ${missing.join(', ')}`,
  );
});

test('geometry-changing text edits and grow mode cannot race a routing worker', () => {
  const mustLock = [
    'DELETE_CHAR_AT_CURSOR',
    'REPLACE_CHAR_AT_CURSOR',
    'CHANGE_TEXT_AT_CURSOR',
    'ENTER_ADD_MODE',
  ];
  const missing = mustLock.filter(command => !routingLocked.has(command));
  assert.deepEqual(
    missing,
    [],
    `Commands allowed to mutate geometry during routing: ${missing.join(', ')}`,
  );
});

test('the generic pre-dispatch snapshot policy is not duplicated in handlers', () => {
  // Each of these handlers currently calls undoRedoService.pushSnapshot itself.
  // If it is also in MUTATING_COMMANDS, handleCommands takes two identical
  // pre-change snapshots and one user action needs two Undo presses.
  const handlerOwnedSnapshots = [
    'CYCLE_EDGE_DIRECTEDNESS',
    'SET_DIAGRAM_TYPE',
    'SET_TASK_STATUS',
  ];
  const duplicates = handlerOwnedSnapshots.filter(command => mutating.has(command));
  assert.deepEqual(
    duplicates,
    [],
    `Commands taking both generic and handler-owned snapshots: ${duplicates.join(', ')}`,
  );
});
