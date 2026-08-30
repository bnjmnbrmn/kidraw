#!/usr/bin/env node
/**
 * Static check: every command the menu can send has somewhere to land, and
 * nothing in the command enum is stranded.
 *
 * The keymenu and the drawing area talk through DACommandType and nothing
 * else. Nothing links them at compile time — a renamed case or a withdrawn
 * handler leaves a menu entry that silently does nothing, which is exactly
 * the failure mode of "Don't seem to be able to apply the circle style"
 * (da-537) except with no keyboard excuse.
 *
 * Run: node claude-proposed-tests/check-command-wiring.mjs
 */
import {readFileSync} from 'node:fs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const model = read('src/app/drawing-area/command.model.ts');
const keymenu = read('src/app/keymenu/keymenu.component.ts');
const drawing = read('src/app/drawing-area/drawing-area.component.ts');
const shell = read('src/app/app.component.ts');
const header = read('src/app/header/header.component.ts');

const declared = new Set([...model.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\s*=\s*'/gm)].map(m => m[1]));
const emitted = new Set();
for (const source of [keymenu, shell, header]) {
  for (const m of source.matchAll(/kind:\s*DACommandType\.([A-Z0-9_]+)/g)) emitted.add(m[1]);
}
const handled = new Set([...drawing.matchAll(/case DACommandType\.([A-Z0-9_]+)/g)].map(m => m[1]));
const shellHandled = new Set([...shell.matchAll(/DACommandType\.([A-Z0-9_]+)/g)].map(m => m[1]));

const unhandled = [...emitted].filter(k => !handled.has(k) && !shellHandled.has(k)).sort();
const stranded = [...declared].filter(k => !emitted.has(k) && !handled.has(k)).sort();

let failures = 0;
const report = (label, list, fatal) => {
  if (list.length === 0) {
    console.log(`PASS: ${label} — none`);
    return;
  }
  console.log(`${fatal ? 'FAIL' : 'NOTE'}: ${label} — ${list.length}`);
  for (const k of list) console.log(`    ${k}`);
  if (fatal) failures++;
};

console.log(`${declared.size} commands declared, ${emitted.size} reachable from a menu, ${handled.size} handled by the drawing area\n`);
report('commands a menu can send with nothing to handle them', unhandled, true);
report('commands declared but neither sent nor handled (dead weight)', stranded, false);

process.exit(failures === 0 ? 0 : 1);
