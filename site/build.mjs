#!/usr/bin/env node
/**
 * Build the homepage, its capture review, and its static screenshots.
 *
 * site/index.html is written the way a Claude artifact wants it — page
 * content only, no <!doctype>, <html> or <head> — so the same file can be
 * previewed as an artifact and served as the real site. This adds the head a
 * real site needs (charset, viewport, description, social cards), writes
 * site/dist/index.html, and copies review/ and assets/ into the same output
 * tree.
 *
 *   node site/build.mjs
 */
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'index.html'), 'utf8');
const HEAD_START = '<!-- site-head:start -->';
const HEAD_END = '<!-- site-head:end -->';

const headStart = source.indexOf(HEAD_START);
const headEnd = source.indexOf(HEAD_END);
if (headStart === -1 || headEnd === -1 || headEnd <= headStart) {
  throw new Error(`site/index.html must contain ${HEAD_START} and ${HEAD_END}`);
}
const pageHead = source.slice(headStart + HEAD_START.length, headEnd).trim();
const pageBody = `${source.slice(0, headStart)}${source.slice(headEnd + HEAD_END.length)}`.trim();

const TITLE = 'KiDraw — Connect your thoughts, at the speed you have them';
const DESCRIPTION =
  'KiDraw is a keyboard-first graph editor for connecting ideas as quickly as they arrive, ' +
  'with an on-screen keymenu, automatic layout, and precise manual control.';

const document = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${DESCRIPTION}">
<meta name="color-scheme" content="dark">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://kidraw.net/">
<meta property="og:site_name" content="KiDraw">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="https://kidraw.net/">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>%E2%8C%A8%EF%B8%8F</text></svg>">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
${pageHead}
</head>
<body>
${pageBody}
</body>
</html>
`;

rmSync(join(here, 'dist'), {recursive: true, force: true});
mkdirSync(join(here, 'dist'), {recursive: true});
writeFileSync(join(here, 'dist', 'index.html'), document);
cpSync(join(here, 'assets'), join(here, 'dist', 'assets'), {recursive: true});
cpSync(join(here, 'review'), join(here, 'dist', 'review'), {recursive: true});
console.log(`site/dist/ — homepage, capture review, and static captures (${(document.length / 1024).toFixed(0)} KB HTML)`);
