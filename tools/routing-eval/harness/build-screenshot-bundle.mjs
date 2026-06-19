// Bundles the screenshot render entry (real DANode / DAEdge + real Konva)
// into a single browser IIFE that attaches `window.renderScenario`. Unlike
// build-bundle.mjs there is NO fake-DA aliasing — we want the real render
// classes. Konva and the transitive da-* modules are browser-safe, so a
// plain browser-target esbuild bundle is all we need.

import { build } from 'esbuild';
import { existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CACHE_DIR = resolve(__dirname, '..', '.cache');
const OUT_PATH = join(CACHE_DIR, 'screenshot-bundle.js');
const ENTRY = join(__dirname, 'screenshot-entry.ts');

/** Every .ts under drawing-area is a potential transitive dep of the real
 *  DANode/DAEdge render path; invalidate the bundle if any of them changes. */
function collectSources() {
  const dir = join(REPO_ROOT, 'src', 'app', 'drawing-area');
  const sources = readdirSync(dir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map(f => join(dir, f));
  sources.push(ENTRY, fileURLToPath(import.meta.url));
  return sources;
}

function newestMtime(paths) {
  let max = 0;
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const m = statSync(p).mtimeMs;
    if (m > max) max = m;
  }
  return max;
}

export async function buildScreenshotBundle({ force = false } = {}) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const sourceMtime = newestMtime(collectSources());
  if (!force && existsSync(OUT_PATH)) {
    const bundleMtime = statSync(OUT_PATH).mtimeMs;
    if (bundleMtime >= sourceMtime) {
      return { cached: true, path: OUT_PATH };
    }
  }
  await build({
    entryPoints: [ENTRY],
    outfile: OUT_PATH,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome120'],
    logLevel: 'silent',
    sourcemap: false,
    minify: false,
  });
  return { cached: false, path: OUT_PATH };
}

// CLI: `node build-screenshot-bundle.mjs [--force]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  const t0 = Date.now();
  const res = await buildScreenshotBundle({ force });
  const ms = Date.now() - t0;
  console.log(`screenshot-bundle: ${res.cached ? 'cached' : 'built'} (${ms} ms) → ${res.path}`);
}
