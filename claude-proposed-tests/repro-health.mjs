#!/usr/bin/env node
/**
 * One signal for 50 rotting repro scripts.
 *
 * tools/repro-*.js is the project's best regression evidence — each one was
 * written the day a real bug was fixed — but nothing runs them, so they rot
 * quietly. Several on main today assert labels or layouts that changed
 * months ago, and at least two error out entirely; all of that was found by
 * accident, one script at a time, while fixing something else.
 *
 * This runs them all against the dev server, records pass/fail per script,
 * and compares against a checked-in baseline. A script that gets WORSE fails
 * the run; a script that gets better prints a nudge to update the baseline.
 * Rot becomes visible without anyone having to remember.
 *
 *   node claude-proposed-tests/repro-health.mjs                # check
 *   node claude-proposed-tests/repro-health.mjs --update       # re-baseline
 *   node claude-proposed-tests/repro-health.mjs --filter grow,label  # subset
 *
 * Needs `npm start` running, and CHROME_BIN set for the Playwright browser.
 */
import {readdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const baselinePath = join(here, 'repro-baseline.json');

const args = process.argv.slice(2);
const update = args.includes('--update');
const filterIndex = args.indexOf('--filter');
const filter = filterIndex >= 0 ? args[filterIndex + 1] : null;
const TIMEOUT_MS = 180000;

const scripts = readdirSync(join(repoRoot, 'tools'))
  .filter(f => f.startsWith('repro-') && f.endsWith('.js'))
  .filter(f => !filter || filter.split(',').some(part => f.includes(part.trim())))
  .sort();

const run = script => new Promise(resolve => {
  execFile('node', [join(repoRoot, 'tools', script)], {timeout: TIMEOUT_MS, cwd: repoRoot},
    (error, stdout, stderr) => {
      const out = `${stdout}\n${stderr}`;
      const fails = (out.match(/^FAIL[: ]/gm) ?? []).length;
      const passes = (out.match(/^PASS[: ]/gm) ?? []).length;
      const crashed = /\b(TypeError|ReferenceError|page\.evaluate:|Timeout)\b/.test(out) && passes === 0;
      resolve({
        script,
        fails,
        passes,
        crashed,
        status: crashed ? 'crashed' : fails > 0 ? 'failing' : 'passing',
      });
    });
});

const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : {};

const results = [];
for (const script of scripts) {
  process.stdout.write(`  ${script} … `);
  const result = await run(script);
  results.push(result);
  const was = baseline[script];
  const worse = was && (result.fails > was.fails || (result.crashed && !was.crashed));
  const better = was && (result.fails < was.fails || (!result.crashed && was.crashed));
  console.log(`${result.status} (${result.passes} pass, ${result.fails} fail)` +
    (worse ? '  ← REGRESSED' : better ? '  ← improved, re-baseline' : ''));
}

if (update) {
  // Merge, so a filtered run tops up the baseline instead of shrinking it.
  const next = {...baseline};
  for (const r of results) next[r.script] = {fails: r.fails, crashed: r.crashed};
  writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nbaseline written: ${results.length} scripts`);
  process.exit(0);
}

const regressed = results.filter(r => {
  const was = baseline[r.script];
  return was && (r.fails > was.fails || (r.crashed && !was.crashed));
});
const unknown = results.filter(r => !baseline[r.script] && r.status !== 'passing');

console.log(`\n${results.filter(r => r.status === 'passing').length}/${results.length} passing`);
if (unknown.length) console.log(`${unknown.length} not in the baseline and not passing — run --update to record them`);
if (regressed.length) {
  console.log(`REGRESSED: ${regressed.map(r => r.script).join(', ')}`);
  process.exit(1);
}
process.exit(0);
