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
const map = JSON.parse(readFileSync(join(siteDir, 'assets', 'map', 'map.json'), 'utf8'));
const demoPath = join(siteDir, 'assets', 'demo', 'demo.json');
const demo = existsSync(demoPath) ? JSON.parse(readFileSync(demoPath, 'utf8')) : {frames: [], drag: []};

const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = text => esc(text).replace(/"/g, '&quot;');
/** Org emphasis: =verbatim= becomes code, _underline_ becomes bold. */
const rich = text => esc(text)
  .replace(/=([^=]+)=/g, '<code>$1</code>')
  .replace(/_([^_]+)_/g, '<b>$1</b>');
const plain = text => text.replace(/[=_]([^=_]+)[=_]/g, '$1');

const entries = flatten(OUTLINE);
const frameFor = id => map.frames.find(frame => frame.id === id);
// The finished graph is ninety-six boxes tall, so "fit the whole thing" lands
// at 3% for the later branches — a dark thread, no shape to read. Only the two
// early overviews are worth showing.
const READABLE_OVERVIEWS = new Set(['overview-wip', 'overview-vim-curve']);
const overviewAfter = id => READABLE_OVERVIEWS.has(`overview-${id}`)
  ? map.frames.find(frame => frame.id === `overview-${id}`)
  : undefined;

// Acts: one per top-level branch, with "How does it work?" split at Advanced
// because its two halves are a beginner's manual and a reference.
const ACTS = [
  {id: 'start', eyebrow: 'The first box', title: 'It starts with one box',
   lede: 'Everything below is one graph, built in KiDraw as you scroll. These are frames from the app, not drawings of it.'},
  {id: 'what', eyebrow: 'Question one', title: 'What is it?',
   lede: 'Five answers, and the detail hanging off them.'},
  {id: 'point', eyebrow: 'Question two', title: "What's the point?",
   lede: 'Three reasons to build another diagram tool.'},
  {id: 'basics', eyebrow: 'Question three', title: 'How does it work?',
   lede: 'The five moves you need on day one. The numbers on those arrows are the order.'},
  {id: 'advanced', eyebrow: 'Question three, continued', title: 'The deep end',
   lede: 'Movement, styling, routing, layout, saving. None of it is needed to draw your first graph.'},
  {id: 'going', eyebrow: 'Question four', title: 'Where is this going?',
   lede: 'Planned, not built.'},
];

let actId = 'start';
const byAct = new Map(ACTS.map(act => [act.id, []]));
for (const entry of entries) {
  if (entry.depth === 1 && entry.node.kind === 'q') {
    actId = entry.node.id === 'how' ? 'basics' : entry.node.id;
  }
  if (entry.node.id === 'advanced') actId = 'advanced';
  byAct.get(actId).push(entry);
}

function stageFigure(act, steps) {
  const images = steps.map(({node}, index) => {
    const frame = frameFor(node.id);
    if (!frame) throw new Error(`no frame for ${node.id}`);
    const eager = index < 2 ? '' : ' loading="lazy" decoding="async"';
    return `            <img class="frame${index === 0 ? ' is-on' : ''}" data-frame="${index}" src="assets/map/${frame.file}"` +
      ` alt="The KiDraw canvas just after the box &quot;${attr(plain(node.t))}&quot; was typed"` +
      ` width="${map.viewport.width}" height="${map.viewport.height}"${eager}>`;
  });
  return `        <figure class="stage" data-stage="${act.id}">
          <div class="stage-frame">
${images.join('\n')}
          </div>
          <figcaption class="stage-caption"><span data-stage-caption></span><span class="mono" data-stage-count></span></figcaption>
        </figure>`;
}

function actSection(act) {
  const steps = byAct.get(act.id);
  const articles = steps.map(({node, depth}, index) => {
    const numbered = node.num ? `<span class="step-num">${node.num}</span>` : '';
    return `        <article class="step" data-frame="${index}" data-label="${attr(plain(node.t))}">
          <h3>${numbered}${rich(node.t)}</h3>
          <p>${esc(node.note)}</p>
        </article>`;
  });
  const closing = overviewAfter(steps[steps.length - 1].node.id);
  const overview = closing ? `
        <article class="step is-overview" data-frame="${steps.length}" data-label="the graph so far, zoomed out">
          <h3>The same graph, from further away</h3>
          <p>One press of Recenter fits everything on screen. The words go, the shape stays, and the box under the crosshairs is still drawn at readable size.</p>
        </article>` : '';
  const overviewImage = closing
    ? `\n            <img class="frame" data-frame="${steps.length}" src="assets/map/${closing.file}" alt="The whole graph so far, zoomed out" width="${map.viewport.width}" height="${map.viewport.height}" loading="lazy" decoding="async">`
    : '';

  return `  <section class="act" id="${act.id}" aria-labelledby="${act.id}-title">
    <div class="wrap act-inner">
      <div class="act-head">
        <p class="eyebrow">${esc(act.eyebrow)}</p>
        <h2 id="${act.id}-title">${esc(act.title)}</h2>
        <p class="act-lede">${esc(act.lede)}</p>
      </div>
      <div class="act-stage">
${stageFigure(act, steps).replace('          </div>', `${overviewImage}\n          </div>`)}
      </div>
      <div class="act-steps">
${articles.join('\n')}${overview}
      </div>
    </div>
  </section>`;
}

const demoFrame = name => demo.frames.find(frame => frame.name === name);
function shot(name, label, caption) {
  const frame = demoFrame(name);
  if (!frame) return '';
  return `      <figure class="shot">
        <img src="assets/demo/${frame.file}" alt="${attr(caption)}" width="1200" height="760" loading="lazy" decoding="async">
        <figcaption><span class="shot-label">${esc(label)}</span>${esc(caption)}</figcaption>
      </figure>`;
}

const menuBreak = `  <section class="wrap brk" aria-labelledby="menu-title">
    <div class="brk-head">
      <p class="eyebrow">A break from the map</p>
      <h2 id="menu-title">The keyboard on screen is the manual</h2>
      <p>A smaller graph, so the keyboard is easy to read. At rest it lights only the commands that do something in the current mode. Hold one down and it becomes that command's next choices.</p>
    </div>
    <div class="shots three">
${[
  shot('menu-rest', 'At rest', 'Normal mode. Add, Style, Layout, Undo, Search — the dark keys do nothing right now.'),
  shot('menu-add-held', 'Add held', 'The same keyboard now offers what Add can make: a box, a circle, a diamond, an edge, a label.'),
  shot('menu-add-target', 'Add, then Box', 'Dashed outlines mark where the new box could go. Pick one with h j k l and let go.'),
].filter(Boolean).join('\n')}
    </div>
    <p class="aside">Every frame on this page was taken the same way: a script pressed the keys and screenshotted the result.</p>
  </section>`;

function holdBreak(prefix, title, intro, labels) {
  const wanted = ['rest', 'hold', 'target', 'placed'].map(kind => map.frames.find(frame => frame.id === `${prefix}-${kind}`));
  if (wanted.some(frame => !frame)) return '';
  const cards = wanted.map((frame, index) => `      <figure class="shot">
        <img src="assets/map/${frame.file}" alt="${attr(labels[index][1])}" width="${map.viewport.width}" height="${map.viewport.height}" loading="lazy" decoding="async">
        <figcaption><span class="shot-label">${esc(labels[index][0])}</span>${esc(labels[index][1])}</figcaption>
      </figure>`);
  return `  <section class="wrap brk" aria-labelledby="${prefix}-hold-title">
    <div class="brk-head">
      <p class="eyebrow">A break from the map</p>
      <h2 id="${prefix}-hold-title">${esc(title)}</h2>
      <p>${esc(intro)}</p>
    </div>
    <div class="shots four">
${cards.join('\n')}
    </div>
  </section>`;
}

const dragSection = demo.drag.length ? `  <section class="wrap drag" id="reroute" aria-labelledby="reroute-title">
    <div class="brk-head">
      <p class="eyebrow">A break from the map</p>
      <h2 id="reroute-title">Move one box and watch the arrows re-route</h2>
      <p>Select+Drag is held while one box steps down. The arrows are not dragged along with it — they are computed again at every step, so the picture stays readable while you are still deciding where the box belongs. Scroll to step through the drag.</p>
    </div>
    <div class="drag-stage">
      <div class="stage-frame">
${demo.drag.map((file, index) => `        <img class="frame${index === 0 ? ' is-on' : ''}" data-drag="${index}" src="assets/demo/${file}" alt="Step ${index + 1} of the drag" width="1200" height="760"${index < 2 ? '' : ' loading="lazy" decoding="async"'}>`).join('\n')}
      </div>
      <p class="stage-caption"><span data-drag-caption>Holding Select+Drag, before the first step.</span><span class="mono" data-drag-count>1 / ${demo.drag.length}</span></p>
    </div>
    <div class="drag-steps">
${demo.drag.map((_, index) => `      <div class="drag-step" data-drag-step="${index}"></div>`).join('\n')}
    </div>
    <p class="aside">The last two frames are the release, and then one press of Layout putting the whole graph back into a tidy tree.</p>
  </section>` : '';

function outlineMarkup(entry, depth) {
  const pad = '  '.repeat(depth + 3);
  const {node} = entry;
  const attrs = [`data-id="${node.id}"`];
  if (node.kind) attrs.push(`data-kind="${node.kind}"`);
  if (node.num) attrs.push(`data-num="${node.num}"`);
  if (node.link) attrs.push(`data-link="${node.link}"`);
  const open = `${pad}<li ${attrs.join(' ')}><span>${rich(node.t)}</span>`;
  if (!node.c.length) return [`${open}</li>`];
  return [
    open,
    `${pad}  <ul>`,
    ...node.c.flatMap(child => outlineMarkup({node: child}, depth + 2)),
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
${holdBreak('basics', 'What the keyboard is doing while a box appears',
  'Four frames from the middle of this run, on the same graph. Every box on this page arrived this way.',
  [
    ['Standing on a box', 'Normal mode. The keyboard shows what is available: Add, Style, Layout, Undo, Search.'],
    ['Add held', 'The keyboard becomes what Add can make — a box, a circle, a diamond, an edge, a label.'],
    ['Then Box', 'Dashed outlines appear wherever a new box could go, and h j k l move between them.'],
    ['Target chosen', 'The one under the crosshairs is where it will land. Let go of Add and it is there, connected, ready to type into.'],
  ])}
${actSection(ACTS[4])}
${dragSection}
${actSection(ACTS[5])}

  <section class="wrap close">
    <div class="close-card">
      <p class="eyebrow">Before you open it</p>
      <h2>It is an alpha. Bring a keyboard.</h2>
      <p>Chrome, a physical keyboard, and some patience. Saving is local-only and Chrome-only, some arrows still route worse than you would draw them, and the navigation model will change. Anything on this page that is not in a frame is a plan, not a feature.</p>
      <p>The ${map.nodes} boxes above were typed into KiDraw by a script driving the real app — ${map.frames.length} frames, one per box, with Layout pressed after each. Fitted on screen the finished graph sits at 3% zoom, which is the honest reason navigation matters more than a minimap.</p>
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
console.log(`site/index.html — ${ACTS.length} acts, ${entries.length} steps, ${map.frames.length} map frames, ${demo.drag.length} drag frames`);
