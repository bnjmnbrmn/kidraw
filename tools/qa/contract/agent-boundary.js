/*
 * Agent mode's boundary, checked (2026-09-26).
 *
 * Agent mode (src/app/agent/) is a feature you can turn off, on top of the
 * canvas. It should be possible to read it, change it, or take it out without
 * touching the rest, and the rest should never need to know how it works. So
 * the imports across the folder's edge are written down here, and anything
 * else fails:
 *
 *   1. Into agent/: the shell and the header may use the always-loaded store,
 *      the two components, and the wire types. Nothing reaches its internals.
 *   2. Out of agent/: it uses the canvas only through CanvasPort
 *      (drawing-area/canvas-port.ts), never Konva or the drawing area's
 *      classes, plus a short list of shared pieces.
 *   3. The first download: the store loads with the app, so it may not import
 *      the service, the tools or the panel except as types. They load the
 *      first time agent mode is used.
 *
 * No browser needed: it reads the source. Specs are exempt; they may reach in.
 */
const {readFileSync, readdirSync, statSync} = require('fs');
const {join, resolve, dirname, relative} = require('path');

const REPO = resolve(__dirname, '../../..');
const APP = join(REPO, 'src/app');
const AGENT = 'src/app/agent/';

/** What the rest of the app may import from agent/. */
const ENTRY_POINTS = {
  'src/app/agent/agent-store.ts': 'the always-loaded state and entry points',
  'src/app/agent/agent-panel.component.ts': 'the chat, placed by the shell',
  'src/app/agent/agent-overlay.component.ts': 'captions, placed by the shell',
  'src/app/agent/agent-protocol.ts': 'wire types (reading mode sends its marks as CanvasRefs)',
};

/** What agent/ may import from the rest of the app. */
const DEPENDENCIES = {
  'src/app/drawing-area/canvas-port.ts': 'the canvas, as agent mode may see and change it',
  'src/app/drawing-area/command.model.ts': 'the chat box is edited with the keymenu\'s text commands',
  'src/app/drawing-area/text-cursor.ts': 'the same caret moves and vim edits as a label',
  'src/app/drawing-area/markdown-label.ts': 'labels shown as plain text in pills',
  'src/app/drawing-area/math-images.ts': 'math in chat messages',
  'src/app/lib/fuzzy-match.ts': 'node references by label',
  'src/app/plugins/plugin-library.service.ts': 'the agent may add a diagram type',
  'src/app/plugins/plugin-registry.ts': 'the diagram type\'s vocabulary, for the tools',
  'src/app/plugins/plugin.model.ts': 'what a diagram type is',
  'src/app/plugins/plugin-settings.service.ts': 'AI Chat can be turned off',
};

/** Loaded the first time agent mode is used; the store may only name them as types. */
const LAZY = ['agent.service.ts', 'agent-tools.ts', 'agent-panel.component.ts', 'agent-overlay.component.ts']
  .map(file => AGENT + file);
const ALWAYS_LOADED = [AGENT + 'agent-store.ts'];

function tsFiles(dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Every relative import in a file: where it points, and whether only types come across. */
function importsOf(file) {
  const source = readFileSync(file, 'utf8');
  const found = [];
  const pattern = /^\s*(import|export)\s+(type\s+)?[^;]*?from\s+'(\.[^']+)'/gms;
  for (const match of source.matchAll(pattern)) {
    let target = resolve(dirname(file), match[3]);
    if (!target.endsWith('.ts')) target += '.ts';
    found.push({target: relative(REPO, target), typeOnly: Boolean(match[2])});
  }
  return found;
}

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

for (const path of tsFiles(APP)) {
  const file = relative(REPO, path);
  const inside = file.startsWith(AGENT);
  for (const {target, typeOnly} of importsOf(path)) {
    const targetInside = target.startsWith(AGENT);
    if (!inside && targetInside) {
      check(target in ENTRY_POINTS,
        `${file} imports ${target}: outside agent/, use an entry point (${Object.keys(ENTRY_POINTS).join(', ')})`);
    }
    if (inside && !targetInside && target.startsWith('src/app/')) {
      check(target in DEPENDENCIES,
        `${file} imports ${target}: agent/ reaches the app only through CanvasPort and the listed pieces`);
    }
    if (ALWAYS_LOADED.includes(file) && LAZY.includes(target)) {
      check(typeOnly, `${file} imports ${target} as a value: it would join the first download`);
    }
  }
}

if (failures.length === 0) {
  console.log('PASS: imports into agent/ use its entry points');
  console.log('PASS: agent/ reaches the app only through CanvasPort and the listed pieces');
  console.log('PASS: the always-loaded store names the lazy parts only as types');
} else {
  for (const failure of failures) console.log(`FAIL: ${failure}`);
}
console.log(`\n${failures.length} failure(s)`);
process.exit(failures.length === 0 ? 0 : 1);
