#!/usr/bin/env node
/**
 * Generate site/index.html from the outline and the film.
 *
 *   node tools/capture/gen-page.mjs
 *
 * The page carries no prose of its own. Its words are site/index.org — the
 * headings and the bullets, which are all boxes in the diagram now — and
 * everything else on screen is the app itself, filmed.
 *
 * One video per branch, from site/assets/film/film.json, under a breadcrumb
 * that says which box is being made. The breadcrumb replaced the section
 * headings: it names the branch the same way a heading did, and it goes on
 * saying where in the tree the video has got to.
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {OUTLINE} from './outline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = process.env.GEN_SITE_DIR ?? join(here, '..', '..', 'site');
const filmPath = join(siteDir, 'assets', 'film', 'film.json');
const film = existsSync(filmPath) ? JSON.parse(readFileSync(filmPath, 'utf8')) : {acts: []};

const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = text => esc(text).replace(/"/g, '&quot;');
/** Org emphasis: =verbatim= becomes code, _underline_ becomes bold. */
const rich = text => esc(text)
  .replace(/=([^=]+)=/g, '<code>$1</code>')
  .replace(/_([^_]+)_/g, '<b>$1</b>');

/** The breadcrumb, as the markup the script keeps up to date. */
const crumbs = trail => trail.map(step => `<span class="crumb">${esc(step)}</span>`).join('');

/**
 * One act: a breadcrumb and a video.
 *
 * The first act loads its metadata so the player has a duration to show; the
 * rest load nothing until they are wanted. Every one of them keeps its poster,
 * so the page looks the same before a byte of video has arrived.
 */
function actSection(act, first) {
  const opening = act.cues.length ? act.cues[0].trail : [act.title];
  return `  <section class="act" id="${act.id}" aria-labelledby="${act.id}-title">
    <div class="wrap">
      <h2 id="${act.id}-title" class="visually-hidden">${esc(act.title)}</h2>
      <div class="film">
        <p class="crumbs" data-crumbs="${act.id}">${crumbs(opening)}</p>
        <div class="film-frame">
          <video data-act="${act.id}" width="${film.width}" height="${film.height}"
                 poster="${attr(act.poster)}" preload="${first ? 'metadata' : 'none'}"
                 muted playsinline controls
                 aria-label="${attr(act.title)}">
            <source src="${attr(act.src)}" type="video/webm">
          </video>
        </div>
        <script type="application/json" data-cues="${act.id}">${
          JSON.stringify(act.cues).replace(/</g, '\\u003c')}</script>
      </div>
    </div>
  </section>`;
}

/** The org file's tree, as the org file's tree: headings, and the bullets that
 *  hang off them — which are boxes in the diagram now, and bullets here. */
function outlineMarkup(node, depth) {
  const pad = '  '.repeat(depth + 3);
  const note = node.kind === 'note';
  const attrs = [`data-id="${node.id}"`];
  if (node.kind) attrs.push(`data-kind="${node.kind}"`);
  const open = `${pad}<li ${attrs.join(' ')}${note ? ' class="outline-note-item"' : ''}>` +
    `<span>${rich(node.t)}</span>`;
  const children = node.c.flatMap(child => outlineMarkup(child, depth + 2));
  if (!children.length) return [`${open}</li>`];
  return [open, `${pad}  <ul>`, ...children, `${pad}  </ul>`, `${pad}</li>`];
}

const template = readFileSync(join(here, 'page.head.html'), 'utf8');
const body = `${template}
<main id="main">
${readFileSync(join(here, 'page.hero.html'), 'utf8')}
${film.acts.map((act, index) => actSection(act, index === 0)).join('\n')}

  <section class="wrap close">
    <p class="close-actions">
      <a class="button button-primary" href="https://alpha.kidraw.net">alpha.kidraw.net →</a>
      <a class="button button-ghost" href="review/">Older captures</a>
    </p>

    <details class="outline" id="outline" open>
      <summary>index.org</summary>
      <ul id="map-outline">
${outlineMarkup(OUTLINE, 0).join('\n')}
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
const seconds = film.acts.reduce((total, act) => total + act.seconds, 0);
console.log(`site/index.html — ${film.acts.length} videos, ` +
  `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s of film, ` +
  `${film.acts.reduce((total, act) => total + act.cues.length, 0)} breadcrumb changes`);
