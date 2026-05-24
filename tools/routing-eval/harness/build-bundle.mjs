// Bundles the routers + metrics + fake DA layer into a single CommonJS
// file the harness can require(). We use esbuild (already a transitive
// dependency via @angular-devkit/build-angular) with a small plugin that
// resolves `./da-node` and `./da-edge` from anywhere under src/app/drawing-area
// to the harness-local fakes — this is the trick that lets us call the
// routers as pure functions without dragging in Konva.

import { build } from 'esbuild';
import { existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CACHE_DIR = resolve(__dirname, '..', '.cache');
const OUT_PATH = join(CACHE_DIR, 'bundle.cjs');
const ENTRY = join(__dirname, 'bundle-entry.ts');

const FAKE_NODE = join(__dirname, 'fake-da-node.ts');
const FAKE_EDGE = join(__dirname, 'fake-da-edge.ts');

/** Sources whose mtime invalidates the bundle. */
function collectSources() {
  const routerDir = join(REPO_ROOT, 'src', 'app', 'drawing-area');
  const files = [
    'charged-spring-edges.ts',
    'bezier-route-edges.ts',
    'bezier-fit-route-edges.ts',
    'flexible-wire-edges.ts',
    'weighted-chain-edges.ts',
    'edge-routing-metrics.ts',
  ].map(f => join(routerDir, f));
  files.push(ENTRY, FAKE_NODE, FAKE_EDGE, fileURLToPath(import.meta.url));
  return files;
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

const fakeAliasPlugin = {
  name: 'fake-da-alias',
  setup(build) {
    // Match relative imports of './da-node' or './da-edge' (used by every
    // router) and route them to our fakes. We don't need to constrain the
    // importer path — no other module in the bundle should ask for those
    // names, but if it did, we'd still want the fake.
    build.onResolve({ filter: /(?:^|\/)da-node(?:\.ts)?$/ }, () => ({
      path: FAKE_NODE,
    }));
    build.onResolve({ filter: /(?:^|\/)da-edge(?:\.ts)?$/ }, () => ({
      path: FAKE_EDGE,
    }));
    // Some files import id-generator, da-waypoint, da-label etc. They're
    // not in the router transitive closure but block resolution if pulled
    // by an unused branch. Stub them as empty modules to be safe.
    build.onResolve({ filter: /(?:^|\/)(?:id-generator|da-waypoint|da-label|command\.model)(?:\.ts)?$/ }, () => ({
      path: 'stub',
      namespace: 'fake-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'fake-stub' }, () => ({
      contents: 'export default {}; export const nextId = (() => { let i = 0; return () => `id-${++i}`; })();',
      loader: 'ts',
    }));
  },
};

export async function buildBundle({ force = false } = {}) {
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
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    plugins: [fakeAliasPlugin],
    logLevel: 'silent',
    sourcemap: false,
    minify: false,
  });
  return { cached: false, path: OUT_PATH };
}

// CLI: `node build-bundle.mjs` (re)builds the bundle.
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  const t0 = Date.now();
  const res = await buildBundle({ force });
  const ms = Date.now() - t0;
  console.log(`bundle: ${res.cached ? 'cached' : 'built'} (${ms} ms) → ${res.path}`);
}
