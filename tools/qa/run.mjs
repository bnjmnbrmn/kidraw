#!/usr/bin/env node
/*
 * The QA runner: turns the repro scripts into a regression suite.
 *
 * Each `tools/repro-*.js` already drives the real app in Playwright and prints
 * `PASS:` / `FAIL:` lines, but each is a standalone script someone ran by
 * hand. This runs a chosen set of them, aggregates the results, and exits
 * non-zero — which is what makes them a safety net you can refactor against.
 *
 * Sixteen of them were already failing when the runner was written, because
 * nothing had run them together in months. Rather than hide that behind a
 * green tick, each carries a `baseline` in suite.mjs: the counts it produced
 * on 2026-09-16. A script passes here by not getting *worse*, and the summary
 * says how many checks are still owed. Fixing one means deleting its baseline.
 *
 *   npm run qa                 # the regression suite
 *   npm run qa -- --all        # every repro script, quarantined ones included
 *   npm run qa -- --region grid-overlay
 *   npm run qa -- --only nav-popup
 *   npm run qa -- --list
 *
 * Needs the dev server up (`npm start`) and, on a machine without a system
 * Chrome, CHROME_BIN pointing at one.
 *
 * Runs one script at a time by default, because the limit here is memory, not
 * CPU: each script starts its own Chrome (~400MB) on top of the dev server and
 * its build. On the 3.8GB VPS with no swap, three at once got the runner
 * OOM-killed. Raise KIDRAW_QA_CONCURRENCY on a bigger machine.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUITE } from './suite.mjs';

const QA_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(QA_DIR, '..', '..');
const BASE_URL = process.env.KIDRAW_QA_URL ?? 'http://localhost:4200';
const DEFAULT_CONCURRENCY = Number(process.env.KIDRAW_QA_CONCURRENCY ?? 1);
/** Roughly what one Chrome plus its page needs. */
const MB_PER_BROWSER = 500;
/** A hung browser shouldn't hang the suite. */
const SCRIPT_TIMEOUT_MS = Number(process.env.KIDRAW_QA_TIMEOUT_MS ?? 180_000);

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = name => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

function selected() {
  const only = value('only');
  const region = value('region');
  let entries = SUITE;
  if (!flag('all')) entries = entries.filter(e => e.status === 'suite');
  if (region) entries = entries.filter(e => e.region === region);
  if (only) entries = entries.filter(e => e.script.includes(only));
  return entries;
}

if (flag('list')) {
  const byRegion = new Map();
  for (const entry of SUITE) {
    if (!byRegion.has(entry.region)) byRegion.set(entry.region, []);
    byRegion.get(entry.region).push(entry);
  }
  for (const [region, entries] of [...byRegion].sort()) {
    console.log(`\n${region}`);
    for (const e of entries) console.log(`  ${e.status === 'suite' ? ' ' : '~'} ${e.script}${e.note ? `  — ${e.note}` : ''}`);
  }
  console.log('\n~ = not in the regression suite (--all includes them)');
  process.exit(0);
}

/** One script: run it, and read its own PASS/FAIL lines back. */
function runScript(entry) {
  const path = join(REPO, 'tools', entry.script);
  if (!existsSync(path)) {
    return Promise.resolve({ ...entry, ok: false, passed: 0, failed: 0, ms: 0, error: 'script not found' });
  }
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path], {
      cwd: REPO,
      env: { ...process.env, KIDRAW_QA_URL: BASE_URL },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      out += `\n[qa] killed after ${SCRIPT_TIMEOUT_MS}ms\n`;
    }, SCRIPT_TIMEOUT_MS);
    child.on('close', code => {
      clearTimeout(timer);
      const passed = (out.match(/^PASS:/gm) ?? []).length;
      const failed = (out.match(/^FAIL:/gm) ?? []).length;
      // A script with a baseline is already failing; it passes here by not
      // getting worse. Without one, it must be clean.
      const base = entry.baseline;
      const ok = base
        ? failed <= base.failed && passed >= base.passed
        : code === 0 && failed === 0;
      resolve({
        ...entry,
        ok,
        debt: ok && base !== undefined,
        passed,
        failed,
        ms: Date.now() - started,
        // Only the interesting lines; a full log per script would bury the summary.
        detail: out.split('\n').filter(l => /^FAIL:|^\[qa\]|error|Error/.test(l)).slice(0, 6).join('\n'),
        code,
      });
    });
  });
}

async function main() {
  const entries = selected();
  if (entries.length === 0) {
    console.error('No scripts matched. Try --list.');
    process.exit(2);
  }

  const reachable = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) }).then(r => r.ok).catch(() => false);
  if (!reachable) {
    console.error(`The app isn't answering at ${BASE_URL}. Start it with "npm start" (or set KIDRAW_QA_URL).`);
    process.exit(2);
  }

  const concurrency = Math.min(DEFAULT_CONCURRENCY, entries.length);
  const availableMb = await freeMemoryMb();
  if (availableMb !== null && availableMb < concurrency * MB_PER_BROWSER) {
    console.log(`Note: ${availableMb}MB free, and each browser wants about ${MB_PER_BROWSER}MB. `
      + 'Scripts may be OOM-killed; close something or lower KIDRAW_QA_CONCURRENCY.\n');
  }
  console.log(`Running ${entries.length} script${entries.length === 1 ? '' : 's'} against ${BASE_URL}`
    + `${concurrency > 1 ? `, ${concurrency} at a time` : ''}\n`);
  const queue = [...entries];
  const results = [];
  const workers = Array.from({ length: concurrency }, async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      const result = await runScript(entry);
      results.push(result);
      const mark = result.ok ? (result.debt ? 'debt' : 'ok  ') : 'WORSE';
      const counts = result.failed || result.passed ? `${result.passed} passed, ${result.failed} failed` : `exit ${result.code}`;
      const against = result.baseline ? ` (baseline ${result.baseline.passed}/${result.baseline.failed})` : '';
      console.log(`${mark} ${result.script.padEnd(42)} ${counts}${against}  (${(result.ms / 1000).toFixed(1)}s)`);
      if (!result.ok && result.detail) console.log(result.detail.replace(/^/gm, '       '));
    }
  });
  await Promise.all(workers);

  const worse = results.filter(r => !r.ok);
  const debt = results.filter(r => r.debt);
  const checks = results.reduce((n, r) => n + r.passed, 0);
  const owed = results.reduce((n, r) => n + (r.baseline?.failed ?? 0), 0);
  console.log(`\n${results.length - worse.length - debt.length}/${results.length} clean, ${checks} checks passed.`);
  if (debt.length > 0) {
    console.log(`${debt.length} at a known-failing baseline (${owed} checks owed): ${debt.map(r => r.script).join(', ')}`);
    console.log('Those are holes in the net, not passes — see tools/qa/README.md.');
  }
  if (worse.length > 0) {
    console.log(`\nWORSE than baseline: ${worse.map(r => r.script).join(', ')}`);
    process.exit(1);
  }
}

/** Available memory in MB, or null where that can't be read. */
async function freeMemoryMb() {
  try {
    const meminfo = await readFile('/proc/meminfo', 'utf8');
    const kb = /MemAvailable:\s+(\d+) kB/.exec(meminfo)?.[1];
    return kb ? Math.round(Number(kb) / 1024) : null;
  } catch {
    return null;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
