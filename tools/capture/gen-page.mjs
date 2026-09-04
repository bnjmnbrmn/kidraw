#!/usr/bin/env node
/**
 * Generate site/index.html from the outline and the captured frames.
 *
 *   node tools/capture/gen-page.mjs
 *
 * Content lives in tools/capture/outline.mjs — one entry per node, with the
 * sentence or two that sits beside its frame. The frames come from
 * site/assets/map/map.json and site/assets/demo/demo.json.
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {OUTLINE, flatten} from './outline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = process.env.GEN_SITE_DIR ?? join(here, '..', '..', 'site');
const read = path => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const map = read(join(siteDir, 'assets', 'map', 'map.json'));
const demo = read(join(siteDir, 'assets', 'demo', 'demo.json')) ?? {menu: [], follow: [], avoid: []};
// The portrait set is optional: without it the page simply serves the desktop
// frames everywhere.
const mapM = read(join(siteDir, 'assets', 'map-m', 'map.json'));
const demoM = read(join(siteDir, 'assets', 'demo-m', 'demo.json'));
const PHONE = '(max-width: 61.99rem)';

/**
 * A frame, art-directed: the portrait capture on a phone, the wide one on a
 * desktop. The two sets are different shapes, which srcset cannot express, so
 * this is a <picture> with a media query rather than a responsive <img>.
 */
function frame(desktopSrc, mobileSrc, {classes, attrs = '', alt, lazy}) {
  const loading = lazy ? ' loading="lazy" decoding="async"' : '';
  const source = mobileSrc ? `<source media="${PHONE}" srcset="${mobileSrc}">` : '';
  const image = `<img src="${desktopSrc}" alt="${attr(alt)}" width="${map.viewport.width}" height="${map.viewport.height}"${loading}>`;
  return `<picture class="${classes}"${attrs}>${source}${image}</picture>`;
}

const mapMStep = id => mapM && mapM.steps.find(step => step.id === id);
const mapMExtra = id => mapM && mapM.extras.find(extra => extra.id === id);

// A manifest entry is either a bare filename (older captures) or {file, ms}.
const fileOf = entry => (typeof entry === 'string' ? entry : entry.file);
const kindOf = entry => fileOf(entry).replace(/\.webp$/, '').split('-').pop();

/**
 * How long a frame stays on screen.
 *
 * A quick typist runs at about eight characters a second, and a keystroke that
 * opens a menu takes a beat longer than one that adds a letter. Captures record
 * this now; for older ones it is worked back out from the frame's kind and the
 * length of the label being typed.
 */
const MS_PER_CHAR = 125;
function frameMs(entry, run, seq, label) {
  if (typeof entry !== 'string' && entry.ms !== undefined) return entry.ms;
  const kind = kindOf(entry);
  if (kind === 'target') return 820;
  if (kind === 'tween') return 450;
  if (kind === 'typed') return 420;
  if (kind === 'rest') return 0;
  // blank and typing: how much of the label lands before the next frame.
  const typing = run.filter(other => ['blank', 'typing', 'typed'].includes(kindOf(other)));
  const steps = typing.length - 1;
  const at = typing.findIndex(other => other === entry);
  if (steps < 1 || at < 0) return 300;
  const done = Math.round((label.length * at) / steps);
  const next = Math.round((label.length * (at + 1)) / steps);
  // Capped: an older capture split a long label into two frames, and holding a
  // still picture for three seconds reads as broken rather than as typing. A
  // re-captured run carries its own ms and is not clamped.
  return Math.min(900, Math.max(180, (next - done) * MS_PER_CHAR));
}

const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = text => esc(text).replace(/"/g, '&quot;');
/** Org emphasis: =verbatim= becomes code, _underline_ becomes bold. */
const rich = text => esc(text)
  .replace(/=([^=]+)=/g, '<code>$1</code>')
  .replace(/_([^_]+)_/g, '<b>$1</b>');
const plain = text => text.replace(/[=_]([^=_]+)[=_]/g, '$1');

const entries = flatten(OUTLINE);
const stepFor = id => map.steps.find(step => step.id === id);
const overviewAfter = id => map.extras.find(extra => extra.id === `overview-${id}`);

// Acts: one per top-level branch, with "How does it work?" split at Advanced
// because its two halves are a beginner's manual and a reference.
const ACTS = [
  {id: 'start', eyebrow: 'The first box', title: 'It starts with one box',
   lede: 'Everything below is one graph, built inside KiDraw as you scroll. These are frames from the running app, not drawings of it.'},
  {id: 'what', eyebrow: 'Question one', title: 'What is it?',
   lede: 'Three answers.'},
  {id: 'point', eyebrow: 'Question two', title: "What's the point?",
   lede: 'One answer, in three parts.'},
  {id: 'how', eyebrow: 'Question three', title: 'How does it work?',
   lede: 'Five things to know about the keyboard.'},
  {id: 'features', eyebrow: 'Question four', title: 'Important features?',
   lede: 'What is built today.'},
];

// One act per branch of the outline; the root gets its own opening act.
let actId = 'start';
const byAct = new Map(ACTS.map(act => [act.id, []]));
for (const entry of entries) {
  if (entry.depth === 1 && entry.node.kind === 'q') actId = entry.node.id;
  byAct.get(actId).push(entry);
}

function stageFigure(act, steps, closing) {
  const images = [];
  steps.forEach(({node}, index) => {
    const step = stepFor(node.id);
    if (!step) throw new Error(`no frames for ${node.id}`);
    const portrait = mapMStep(node.id);
    const label = plain(node.t);
    step.frames.forEach((entry, seq) => {
      const last = seq === step.frames.length - 1;
      images.push('            ' + frame(
        `assets/map/${fileOf(entry)}`,
        portrait && portrait.frames[seq] ? `assets/map-m/${fileOf(portrait.frames[seq])}` : null,
        {
          classes: `frame${index === 0 && last ? ' is-on' : ''}`,
          attrs: ` data-step="${index}" data-seq="${seq}" data-ms="${frameMs(entry, step.frames, seq, label)}"`,
          alt: last
            ? `The KiDraw canvas after the box "${label}" was typed and the graph re-laid out`
            : '',
          lazy: index >= 1,
        },
      ));
    });
  });
  if (closing) {
    const portrait = mapMExtra(closing.id);
    images.push('            ' + frame(
      `assets/map/${closing.file}`,
      portrait ? `assets/map-m/${portrait.file}` : null,
      {classes: 'frame', attrs: ` data-step="${steps.length}" data-seq="0"`, alt: 'The branch so far, zoomed out', lazy: true},
    ));
  }
  return `        <figure class="stage" data-stage="${act.id}">
          <div class="stage-frame">
${images.join('\n')}
          </div>
          <figcaption class="stage-caption"><span data-stage-caption></span><span class="mono" data-stage-count></span></figcaption>
        </figure>`;
}

function actSection(act) {
  const steps = byAct.get(act.id);
  const articles = steps.map(({node}, index) => {
    const numbered = node.num ? `<span class="step-num">${node.num}</span>` : '';
    return `        <article class="step" data-frame="${index}" data-label="${attr(plain(node.t))}">
          <h3>${numbered}${rich(node.t)}</h3>
          <p>${esc(node.note)}</p>
        </article>`;
  });
  const closing = overviewAfter(steps[steps.length - 1].node.id);
  const overview = closing ? `
        <article class="step is-overview" data-frame="${steps.length}" data-label="the branch, zoomed out">
          <h3>The same graph, from further away</h3>
          <p>One press of Recenter fits the branch on screen. The words go, the shape stays.</p>
        </article>` : '';

  return `  <section class="act" id="${act.id}" aria-labelledby="${act.id}-title">
    <div class="wrap act-inner">
      <div class="act-head">
        <p class="eyebrow">${esc(act.eyebrow)}</p>
        <h2 id="${act.id}-title">${esc(act.title)}</h2>
        <p class="act-lede">${esc(act.lede)}</p>
      </div>
      <div class="act-stage">
        <p class="stage-head" aria-hidden="true"><span class="stage-eyebrow">${esc(act.eyebrow)}</span>${esc(act.title)}</p>
${stageFigure(act, steps, closing)}
      </div>
      <div class="act-steps">
${articles.join('\n')}${overview}
      </div>
    </div>
  </section>`;
}

const demoFrame = (file, alt, options = {}) => frame(
  `assets/demo/${file}`,
  demoM ? `assets/demo-m/${file}` : null,
  {classes: options.classes ?? 'shot-frame', attrs: options.attrs ?? '', alt, lazy: options.lazy !== false},
);

function shot(file, label, caption) {
  if (!file) return '';
  return `      <figure class="shot">
        ${demoFrame(file, caption)}
        <figcaption><span class="shot-label">${esc(label)}</span>${esc(caption)}</figcaption>
      </figure>`;
}

const menuBreak = demo.menu.length === 3 ? `  <section class="wrap brk" aria-labelledby="menu-title">
    <div class="brk-head">
      <p class="eyebrow">A break from the map</p>
      <h2 id="menu-title">The keyboard on screen is the manual</h2>
      <p>A four-box graph, so the keyboard is easy to read. At rest it lights only the commands that do something in the current mode. Hold one down and it becomes that command's next choices.</p>
    </div>
    <div class="shots three">
${[
  shot(demo.menu[0], 'At rest', 'Normal mode. Add, Style, Layout, Undo, Search — the dark keys do nothing right now.'),
  shot(demo.menu[1], 'Add held', 'The same keyboard now offers what Add can make: a box, a circle, a diamond, an edge, a label.'),
  shot(demo.menu[2], 'Add, then Box', 'Dashed outlines mark where the new box could go, and h j k l move between them.'),
].filter(Boolean).join('\n')}
    </div>
    <p class="aside">Every frame on this page was taken the same way: a script pressed the keys and screenshotted the result.</p>
  </section>` : '';

/** A scroll-scrubbed sequence: sticky frames, and a column of spacers to
 *  step through them. */
function scrubber(id, title, intro, frames, captions, aside) {
  if (!frames.length) return '';
  return `  <section class="wrap drag" id="${id}" aria-labelledby="${id}-title">
    <div class="brk-head">
      <p class="eyebrow">A break from the map</p>
      <h2 id="${id}-title">${esc(title)}</h2>
      <p>${esc(intro)}</p>
    </div>
    <div class="drag-stage" data-scrub="${id}">
      <div class="stage-frame">
${frames.map((file, index) => `        ${demoFrame(file, captions[index] ?? `Step ${index + 1}`, {
        classes: `frame${index === 0 ? ' is-on' : ''}`,
        attrs: ` data-scrub-frame="${index}"`,
        lazy: index >= 2,
      })}`).join('\n')}
      </div>
      <p class="stage-caption"><span data-scrub-caption>${esc(captions[0] ?? '')}</span><span class="mono" data-scrub-count>1 / ${frames.length}</span></p>
    </div>
    <div class="drag-steps">
${frames.map((_, index) => `      <div class="drag-step" data-scrub-step="${index}"></div>`).join('\n')}
    </div>
    <p class="aside">${esc(aside)}</p>
  </section>`;
}

const followCaptions = [
  'Select+Drag held, before the first step.',
  ...Array.from({length: 8}, (_, i) => `Step ${i + 1}. Both arrows were recomputed, not dragged along.`),
  'Released. The arrows keep the routes they found.',
  'One press of Layout, and the graph is tidy again.',
];
const avoidCaptions = [
  'Three boxes. Plan points at Ship it; Review sits below, out of the way.',
  'Select+Drag held on Ship it.',
  'Step 1. Ship it moves down. The arrow into it is recomputed on the press.',
  'Step 2. The straight line would now run through Review, so it stops being straight.',
  'Step 3. The arrow is routed over the top of Review rather than under it.',
  'Released. The route holds, and nothing was drawn by hand.',
];

const followSection = scrubber('reroute', 'Move one box; its arrows find new routes',
  'Select+Drag is held while one box steps down. The arrows are not dragged along with it — they are computed again at every step, so the picture stays readable while you are still deciding where the box belongs. Scroll to step through the drag.',
  demo.follow, followCaptions,
  'The last two frames are the release, and then one press of Layout putting the whole graph back into a tidy tree.');

const avoidSection = scrubber('avoid', 'Push a box into an arrow, and the arrow goes around it',
  'This is the routing goal that matters most: an arrow should not disappear behind a box. Plan points at Ship it, with Review sitting below them. As Ship it is dragged down, the straight line between Plan and Ship it would run through Review — so the router bends it over the top instead, on every keypress.',
  demo.avoid, avoidCaptions,
  'The small circle on the line is the point the route is being pulled through. Drop one of those by hand and it becomes a waypoint you control.');

function outlineMarkup(entry, depth) {
  const pad = '  '.repeat(depth + 3);
  const {node} = entry;
  const attrs = [`data-id="${node.id}"`];
  if (node.kind) attrs.push(`data-kind="${node.kind}"`);
  if (node.num) attrs.push(`data-num="${node.num}"`);
  if (node.link) attrs.push(`data-link="${node.link}"`);
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
${actSection(ACTS[0])}
${actSection(ACTS[1])}
${menuBreak}
${actSection(ACTS[2])}
${actSection(ACTS[3])}
${followSection}
${actSection(ACTS[4])}
${avoidSection}

  <section class="wrap close">
    <div class="close-card">
      <p class="eyebrow">Before you open it</p>
      <h2>It is an alpha. Bring a keyboard.</h2>
      <p>Chrome, a physical keyboard, and some patience. Saving is local-only and Chrome-only, some arrows still route worse than you would draw them, and the navigation model will change. Anything on this page that is not in a frame is a plan, not a feature.</p>
      <p>The ${map.nodes} boxes above were typed into KiDraw by a script driving the real app — ${map.frames}${mapM ? ' frames of it, captured twice so a phone gets a portrait shape and a desktop a wide one' : ' frames'} in all, roughly ten per box: the keys held down, the empty box, the label going in a few characters at a time, the layout tween, and the graph at rest. Each frame is held for about as long as the keys it stands for would take to press.</p>
      <div class="close-actions">
        <a class="button button-primary" href="https://alpha.kidraw.net">Open alpha.kidraw.net →</a>
        <a class="button button-ghost" href="review/">Older captures</a>
      </div>
    </div>

    <details class="outline" id="outline" open>
      <summary>The whole map, as an outline</summary>
      <p class="outline-note">The same list the graph was built from, and the file this page began as. Numbers mark ordered steps; <span class="mono">↗</span> marks a box that also points at a box in another branch.</p>
      <ul id="map-outline">
${outlineMarkup({node: OUTLINE}, 0).join('\n')}
      </ul>
    </details>
  </section>
</main>

<footer class="wrap">
  <div class="foot-row">
    <p>KiDraw — a keyboard-first graph editor by <a href="https://bnjmnbrmn.com">Benjamin Berman</a>.</p>
    <p><a href="https://alpha.kidraw.net">alpha.kidraw.net</a> · <a href="https://github.com/bnjmnbrmn">github.com/bnjmnbrmn</a> · <a href="review/">capture review</a></p>
  </div>
</footer>

${readFileSync(join(here, 'page.script.html'), 'utf8')}
`;

writeFileSync(join(siteDir, 'index.html'), body);
console.log(`site/index.html — ${ACTS.length} acts, ${entries.length} steps, ${map.frames} map frames` +
  `${mapM ? ` (+${mapM.frames} portrait)` : ''}, ${demo.follow.length + demo.avoid.length} scrub frames`);
