#!/usr/bin/env node
/**
 * Cut the film: one video per branch of the outline.
 *
 *   node tools/capture/film-map.mjs      # the build
 *   node tools/capture/film-demos.mjs    # the small demos
 *   node tools/capture/film.mjs          # this
 *
 * The build was filmed box by box and the demos one at a time; here they are
 * put in the outline's order — a box, then the demo that belongs to it, then
 * the next box — and encoded, a video for each of the four questions the
 * diagram asks.
 *
 * Four files rather than one: the reader gets to the start of the part they
 * are looking at without loading five minutes of video first, and each one is
 * short enough to watch to the end.
 */
import {mkdirSync, readFileSync, writeFileSync, existsSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {encode} from './record.mjs';
import {OUTLINE, flatten} from './outline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const capture = process.env.FILM_IN ?? join(root, '.capture');
const outDir = process.env.FILM_ASSETS ?? join(root, 'site', 'assets', 'film');

const map = JSON.parse(readFileSync(join(capture, 'map', 'map.json'), 'utf8'));
const demos = existsSync(join(capture, 'demos', 'demos.json'))
  ? JSON.parse(readFileSync(join(capture, 'demos', 'demos.json'), 'utf8'))
  : {segments: {}};

/**
 * How fast the film runs.
 *
 * The app is driven a little slower than a person uses it — a held key has to
 * stay down long enough for the submenu to finish sliding in before the next
 * press, or the press lands on the wrong menu. Playing the result back at
 * about a third again puts it back to the speed the page is claiming, and it
 * is the same third everywhere, which is the point of a video.
 */
const SPEED = Number(process.env.FILM_SPEED ?? 1.35);
const FPS = 25;

const entries = flatten(OUTLINE);
const ACTS = [
  {id: 'what', title: 'What is it?'},
  {id: 'point', title: "What's the point?"},
  {id: 'how', title: 'How does it work?'},
  {id: 'features', title: 'What are some important features?'},
];

// The root box opens the first act; everything else belongs to the branch it
// hangs off.
const byAct = new Map(ACTS.map(act => [act.id, []]));
let actId = ACTS[0].id;
for (const entry of entries) {
  if (entry.depth === 1 && entry.node.kind === 'q') actId = entry.node.id;
  byAct.get(actId).push(entry);
}

const segmentFor = id => map.segments.find(segment => segment.name === `node:${id}`);

/**
 * Which acts to cut. Everything, unless named — `node tools/capture/film.mjs
 * what` recuts the first video and leaves the other three alone, which is what
 * a change to one branch of the outline needs. The manifest is merged rather
 * than rewritten, so an act nobody recut keeps the entry it had.
 */
const wanted = new Set(
  (process.env.FILM_ACTS ?? process.argv.slice(2).join(',')).split(',').filter(Boolean));
const filmPath = join(outDir, 'film.json');
const previous = existsSync(filmPath)
  ? JSON.parse(readFileSync(filmPath, 'utf8')).acts ?? []
  : [];
mkdirSync(outDir, {recursive: true});
// Opened only if a segment actually needs cropping — the keymenu demos do, a
// branch of the build does not, and a browser is most of a cut's memory.
let browser = null;
const scratch = async () => {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--renderer-process-limit=1',
             '--js-flags=--max-old-space-size=256'],
    });
    const page = await browser.newPage();
    await page.goto('about:blank');
    scratch.page = page;
  }
  return scratch.page;
};

const {width, height} = map.viewport;
const cut = [];
for (const act of ACTS) {
  const kept = previous.find(entry => entry.id === act.id);
  if (wanted.size && !wanted.has(act.id)) {
    if (kept) cut.push(kept);
    continue;
  }
  const segments = [];
  const missing = [];
  for (const {node} of byAct.get(act.id)) {
    const segment = segmentFor(node.id);
    if (!segment) { missing.push(node.id); continue; }
    segments.push(segment);
    if (node.example) {
      const demo = demos.segments[node.example];
      if (demo) segments.push(demo);
      else missing.push(`${node.example} (demo)`);
    }
  }
  if (!segments.length) {
    console.log(`  ${act.id} — nothing filmed yet, ${kept ? 'keeping the last cut' : 'skipped'}`);
    if (kept) cut.push(kept);
    continue;
  }
  const file = join(outDir, `${act.id}.webm`);
  const result = await encode({
    segments,
    out: file,
    poster: join(outDir, `${act.id}.jpg`),
    fps: FPS, width, height, speed: SPEED, scratch,
  });
  cut.push({
    id: act.id,
    title: act.title,
    src: `assets/film/${act.id}.webm`,
    poster: `assets/film/${act.id}.jpg`,
    seconds: Number(result.seconds.toFixed(2)),
    cues: result.cues.map(cue => ({t: Number((cue.ms / 1000).toFixed(2)), trail: cue.trail})),
  });
  const megabytes = statSync(file).size / 1e6;
  console.log(`  ${act.id} — ${result.frames} frames, ${result.seconds.toFixed(0)}s, ` +
    `${megabytes.toFixed(1)}MB${missing.length ? `  (missing: ${missing.join(', ')})` : ''}`);
}

writeFileSync(join(outDir, 'film.json'), JSON.stringify({
  width, height, fps: FPS, speed: SPEED, acts: cut,
}, null, 1));
const seconds = cut.reduce((total, act) => total + act.seconds, 0);
console.log(`film: ${cut.length} acts, ${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`);
if (browser) await browser.close();
