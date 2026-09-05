#!/usr/bin/env node
/**
 * Generate site/index.html from the outline and the captured frames.
 *
 *   node tools/capture/gen-page.mjs
 *
 * The page carries no prose of its own. Its words are site/index.org — the
 * headings, which are the boxes in the diagram, and the bullets, which are the
 * captions — and everything else on screen is a screenshot of the running app.
 * Frames come from site/assets/map/map.json and site/assets/demo/demo.json.
 *
 * Each act is a reel: a strip of full-size panels behind one window, moved by
 * the reader's scroll. A panel is either a run of frames — the diagram being
 * built, or an example of one feature — or a caption. Captions and examples get
 * the whole window, so the build sequence is out of the way rather than beside
 * or behind them.
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {OUTLINE, flatten} from './outline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = process.env.GEN_SITE_DIR ?? join(here, '..', '..', 'site');
const read = path => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const map = read(join(siteDir, 'assets', 'map', 'map.json'));
const demo = read(join(siteDir, 'assets', 'demo', 'demo.json')) ?? {digressions: {}, follow: [], avoid: []};
// The portrait set is optional: without it the page simply serves the desktop
// frames everywhere.
const mapM = read(join(siteDir, 'assets', 'map-m', 'map.json'));
const demoM = read(join(siteDir, 'assets', 'demo-m', 'demo.json'));
const PHONE = '(max-width: 61.99rem)';

const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = text => esc(text).replace(/"/g, '&quot;');
/** Org emphasis: =verbatim= becomes code, _underline_ becomes bold. */
const rich = text => esc(text)
  .replace(/=([^=]+)=/g, '<code>$1</code>')
  .replace(/_([^_]+)_/g, '<b>$1</b>');
const plain = text => text.replace(/[=_]([^=_]+)[=_]/g, '$1');

/**
 * A frame, art-directed: the portrait capture on a phone, the wide one on a
 * desktop. The two sets are different shapes, which srcset cannot express, so
 * this is a <picture> with a media query rather than a responsive <img>.
 */
function picture(desktopSrc, mobileSrc, {classes, attrs = '', alt, lazy, size}) {
  const loading = lazy ? ' loading="lazy" decoding="async"' : '';
  const source = mobileSrc ? `<source media="${PHONE}" srcset="${mobileSrc}">` : '';
  const box = size ?? map.viewport;
  const image = `<img src="${desktopSrc}" alt="${attr(alt)}" width="${box.width}" height="${box.height}"${loading}>`;
  return `<picture class="${classes}"${attrs}>${source}${image}</picture>`;
}

// The keymenu close-ups are one-off PNGs of a single element: a strip far wider
// than it is tall, and the same whatever the screen.
const MENU_SHOT = {width: 800, height: 300};

const mapMStep = id => mapM && mapM.steps.find(step => step.id === id);
const mapMExtra = id => mapM && mapM.extras.find(extra => extra.id === id);

// A manifest entry is either a bare filename (older captures) or {file, ms}.
const fileOf = entry => (typeof entry === 'string' ? entry : entry.file);
const kindOf = entry => fileOf(entry).replace(/\.webp$/, '').split('-').pop();

/**
 * How much scroll a frame is worth.
 *
 * The reader's scroll is the playback: a frame's share of its panel is the
 * share of the typing it stands for. A quick typist runs at about eight
 * characters a second, and a keystroke that opens a menu takes a beat longer
 * than one that adds a letter. Captures record this now; for older ones it is
 * worked back out from the frame's kind and the length of the label.
 */
const MS_PER_CHAR = 125;
function frameMs(entry, run, label) {
  if (typeof entry !== 'string' && entry.ms !== undefined) return entry.ms;
  const kind = kindOf(entry);
  if (kind === 'target') return 820;
  if (kind === 'tween') return 450;
  if (kind === 'typed') return 420;
  if (kind === 'rest') return 0;
  const typing = run.filter(other => ['blank', 'typing', 'typed'].includes(kindOf(other)));
  const steps = typing.length - 1;
  const at = typing.findIndex(other => other === entry);
  if (steps < 1 || at < 0) return 300;
  const done = Math.round((label.length * at) / steps);
  const next = Math.round((label.length * (at + 1)) / steps);
  return Math.min(900, Math.max(180, (next - done) * MS_PER_CHAR));
}

const entries = flatten(OUTLINE);
const stepFor = id => map.steps.find(step => step.id === id);
const overviewAfter = id => map.extras.find(extra => extra.id === `overview-${id}`);

// One act per branch of the outline; the root gets its own opening act. The
// titles are the org headings, and nothing else is written above the frames.
const ACTS = [
  {id: 'start', title: 'KiDraw', quiet: true},
  {id: 'what', title: 'What is it?'},
  {id: 'point', title: "What's the point?"},
  {id: 'how', title: 'How does it work?'},
  {id: 'features', title: 'Important features?'},
];

let actId = 'start';
const byAct = new Map(ACTS.map(act => [act.id, []]));
for (const entry of entries) {
  if (entry.depth === 1 && entry.node.kind === 'q') actId = entry.node.id;
  byAct.get(actId).push(entry);
}

// How long a panel's window of scrolling is. Frames are paced by what they
// stand for; a caption or a still example gets most of a screen to be read on.
const VH_PER_SECOND = 10;
const READING_VH = 80;
const MIN_RUN_VH = 45;
const EXAMPLE_MS = 1600;

/** One frame of a step's run, as a panel entry. */
function stepFrames(node) {
  const step = stepFor(node.id);
  if (!step) throw new Error(`no frames for ${node.id}`);
  const portrait = mapMStep(node.id);
  const label = plain(node.t);
  return step.frames.map((entry, seq) => {
    const last = seq === step.frames.length - 1;
    // The two runs can diverge by a frame or two when one of them needs a
    // layout the other did not; pair only when the frame really matches.
    const twin = portrait && portrait.frames[seq];
    const paired = twin && kindOf(twin) === kindOf(entry) && portrait.frames.length === step.frames.length;
    return {
      src: `assets/map/${fileOf(entry)}`,
      mobile: paired ? `assets/map-m/${fileOf(twin)}` : null,
      ms: frameMs(entry, step.frames, label),
      alt: last ? `KiDraw after the box "${label}" was typed` : '',
    };
  });
}

/** The frames behind one example: a keymenu close-up, or a short drag. */
function exampleFrames(name) {
  if (name === 'avoid') {
    return demo.avoid.map((file, index) => ({
      src: `assets/demo/${file}`,
      mobile: demoM ? `assets/demo-m/${file}` : null,
      ms: EXAMPLE_MS,
      alt: index === 0 ? 'An arrow re-routing around a box dragged into it' : '',
    }));
  }
  const file = demo.digressions[name];
  if (!file) return [];
  const strip = file.endsWith('.png');
  return [{
    src: `assets/demo/${file}`,
    mobile: strip || !demoM ? null : `assets/demo-m/${file}`,
    size: strip ? MENU_SHOT : undefined,
    wide: strip,
    ms: EXAMPLE_MS,
    alt: strip
      ? 'The keymenu with a command key held down'
      : 'The whole window with a command key held down',
  }];
}

/**
 * An act, as a strip of panels.
 *
 * Consecutive boxes share one panel, so the build runs on unbroken; a caption
 * or an example closes the panel and takes the window for itself.
 */
function panelsFor(act) {
  const steps = byAct.get(act.id);
  const panels = [];
  let run = null;
  const intoRun = frames => {
    if (!run) panels.push(run = {kind: 'frames', frames: []});
    run.frames.push(...frames);
  };
  for (const {node} of steps) {
    intoRun(stepFrames(node));
    if ((node.bullets ?? []).length) {
      run = null;
      panels.push({kind: 'caption', bullets: node.bullets});
    }
    if (node.example) {
      const frames = exampleFrames(node.example);
      if (frames.length) {
        run = null;
        panels.push({kind: 'example', frames});
      }
    }
  }
  const closing = overviewAfter(steps[steps.length - 1].node.id);
  if (closing) {
    const portrait = mapMExtra(closing.id);
    intoRun([{
      src: `assets/map/${closing.file}`,
      mobile: portrait ? `assets/map-m/${portrait.file}` : null,
      ms: 1200,
      alt: 'The branch so far, zoomed out',
    }]);
  }
  for (const panel of panels) {
    const ms = (panel.frames ?? []).reduce((total, frame) => total + Math.max(frame.ms, 120), 0);
    panel.vh = panel.kind === 'caption'
      ? READING_VH
      : panel.frames.length === 1
        ? READING_VH
        : Math.max(MIN_RUN_VH, Math.round((ms / 1000) * VH_PER_SECOND));
  }
  return panels;
}

function panelMarkup(panel, index, first) {
  const body = panel.kind === 'caption'
    ? `\n            <ul class="panel-bullets">${panel.bullets.map(line => `<li>${esc(line)}</li>`).join('')}</ul>\n          `
    : `\n${panel.frames.map((frame, seq) => '            ' + picture(frame.src, frame.mobile, {
      classes: `frame${first && seq === 0 ? ' is-on' : ''}`,
      attrs: ` data-frame="${seq}" data-ms="${Math.max(frame.ms, 120)}"`,
      alt: frame.alt,
      lazy: !(first && seq === 0),
      size: frame.size,
    })).join('\n')}\n          `;
  const wide = (panel.frames ?? []).some(frame => frame.wide) ? ' data-wide' : '';
  return `          <div class="panel" data-panel="${index}" data-kind="${panel.kind}"${wide} style="--i:${index}">${body}</div>`;
}

function actSection(act) {
  const panels = panelsFor(act);
  const spans = panels.map((panel, index) =>
    `        <div class="act-span" data-span="${index}" style="height:${panel.vh}vh"></div>`);
  return `  <section class="act" id="${act.id}" aria-labelledby="${act.id}-title">
    <div class="wrap act-inner">
      <div class="act-scroll" aria-hidden="true">
${spans.join('\n')}
      </div>
      <div class="act-stage">
        <h2 id="${act.id}-title" class="act-title${act.quiet ? ' visually-hidden' : ''}">${esc(act.title)}</h2>
        <div class="stage-box">
          <div class="reel" data-reel>
${panels.map((panel, index) => panelMarkup(panel, index, index === 0)).join('\n')}
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function outlineMarkup(entry, depth) {
  const pad = '  '.repeat(depth + 3);
  const {node} = entry;
  const attrs = [`data-id="${node.id}"`];
  if (node.kind) attrs.push(`data-kind="${node.kind}"`);
  const open = `${pad}<li ${attrs.join(' ')}><span>${rich(node.t)}</span>`;
  const bullets = (node.bullets ?? []).map(line =>
    `${pad}    <li class="outline-note-item">${esc(line)}</li>`);
  const children = node.c.flatMap(child => outlineMarkup({node: child}, depth + 2));
  if (!bullets.length && !children.length) return [`${open}</li>`];
  return [
    open,
    `${pad}  <ul>`,
    ...bullets,
    ...children,
    `${pad}  </ul>`,
    `${pad}</li>`,
  ];
}

const template = readFileSync(join(here, 'page.head.html'), 'utf8');
const body = `${template}
<main id="main">
${readFileSync(join(here, 'page.hero.html'), 'utf8')}
${ACTS.map(actSection).join('\n')}

  <section class="wrap close">
    <p class="close-actions">
      <a class="button button-primary" href="https://alpha.kidraw.net">alpha.kidraw.net →</a>
      <a class="button button-ghost" href="review/">Older captures</a>
    </p>

    <details class="outline" id="outline" open>
      <summary>index.org</summary>
      <ul id="map-outline">
${outlineMarkup({node: OUTLINE}, 0).join('\n')}
      </ul>
    </details>
  </section>
</main>

<footer class="wrap">
  <div class="foot-row">
    <p><a href="https://bnjmnbrmn.com">Benjamin Berman</a></p>
    <p><a href="https://alpha.kidraw.net">alpha.kidraw.net</a> · <a href="https://github.com/bnjmnbrmn">github.com/bnjmnbrmn</a> · <a href="review/">capture review</a></p>
  </div>
</footer>

${readFileSync(join(here, 'page.script.html'), 'utf8')}
`;

writeFileSync(join(siteDir, 'index.html'), body);
const all = ACTS.map(panelsFor);
const count = kind => all.flat().filter(panel => panel.kind === kind).length;
console.log(`site/index.html — ${ACTS.length} acts, ${all.flat().length} panels ` +
  `(${count('frames')} runs, ${count('caption')} captions, ${count('example')} examples), ` +
  `${all.flat().reduce((total, panel) => total + (panel.frames ?? []).length, 0)} frames, ` +
  `${all.flat().reduce((total, panel) => total + panel.vh, 0)}vh of scrolling`);
