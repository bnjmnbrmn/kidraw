# kidraw.net introduction page

This directory contains KiDraw's public introduction page. It is deliberately
separate from the KiDraw editor: the editor is an Angular application with two
Konva canvases, while this page is plain HTML, CSS, and a small amount of
JavaScript. A homepage change therefore cannot break graph editing, and the
homepage can load without the editor's application bundle.

The page is built around one idea: the whole argument is a single graph, and
it is drawn branch by branch as the reader scrolls, with real screenshots
breaking the sequence. The content of that graph is `index.org`.

The settled editorial and design decisions are in
[`HOMEPAGE-BRIEF.md`](HOMEPAGE-BRIEF.md). Start there if you did not take part
in the design conversation.

## Public surfaces

- `https://kidraw.dev.bnjmnbrmn.com/homepage/` — staged introduction page
- `https://kidraw.dev.bnjmnbrmn.com/homepage/review/` — capture contact sheet,
  including known problems in the current screenshots
- `https://alpha.kidraw.net` — the live KiDraw editor, linked by every primary
  call to action

The production homepage is intended for `https://kidraw.net/` when its hosting
and DNS are moved to the new page.

## Files

- `index.org` is the source of the argument: the outline Benjamin keeps in
  org-mode. `index.html` transcribes it; nothing else reads the `.org` file.
- `index.html` is the homepage source. Its `site-head` block contains the page
  title, fonts, and CSS. The rest is body markup, the outline the diagram is
  drawn from, and the script that draws it.
- `assets/captures/` contains real screenshots from the app. The build keeps
  them as separate files so the browser can cache them.
- `review/index.html` is the durable contact sheet for those captures.
- `build.mjs` makes a complete HTML document in `dist/index.html`, then copies
  the review and assets into `dist/`.
- `smoke.mjs` builds the site, serves it locally, and checks the generated
  document in desktop, mobile, and reduced-motion browser contexts.
- `HOMEPAGE-BRIEF.md` explains the audience, voice, product argument, visual
  story, roadmap, and decisions still open.

## Build and test

From the repository root:

```bash
npm run site:build
npm run site:test
```

`npm run site:build` replaces `site/dist/` with a complete deployable tree.
`npm run site:test` needs Chromium. If the standard Playwright browser is not
available, point `CHROME_BIN` at a Chromium executable.

The smoke test checks, among other things:

- title, byline, canonical URL, and landmark structure;
- removal of the rejected playable demo;
- all fourteen capture files, used on the page, and the review page;
- the outline: item count, the twenty-one numbered edges, the three
  cross-branch links, and its collapse once the diagram is drawn;
- five stages that each draw nodes, edge labels, and cross links;
- scrolling: the caption, the counter, the step highlight, more revealed nodes,
  and a camera transform rather than a reflow;
- a still camera when `prefers-reduced-motion` is set;
- no horizontal overflow at desktop and phone widths, and a sticky stage on a
  phone;
- the no-JavaScript fallback: the outline stays open and complete;
- successful loading of every screenshot.

## How the scroll-drawn diagram works

There is one source of truth for the diagram: the nested `<ul id="map-outline">`
at the bottom of `index.html`, inside a `<details>` element. It is ordinary
markup — a `<li>` per node, `<span>` for the label, `data-num` for a numbered
edge, `data-link` for a cross-branch arrow, `data-id` so steps can name a node.

The script at the bottom of the page reads that list, measures every label on a
canvas, lays the graph out as a left-to-right tidy tree, and draws an SVG into
each act's sticky stage. Each act renders every node revealed up to the end of
that act, so later stages carry the earlier branches as context.

Reading order is driven by the `.step` articles beside the stage:

- `data-reveal` names what appears — `id` for one node, `id+` for a node and
  its children, `id*` for a whole subtree;
- `data-focus` names what the camera frames, defaulting to `data-reveal`;
- `data-edges` (`from>to`) reveals a cross-branch link;
- `data-fit="all"` frames the entire graph;
- `data-caption` is the line under the stage.

On scroll the last step above the reading line becomes active. Its nodes and
edges get `is-on`, older edges get `is-dim`, and the `.cam` group's CSS
transform moves the camera. Nothing reflows, so the transition is a pan and a
zoom rather than a redraw. `prefers-reduced-motion` removes those transitions
and leaves the stepping intact.

Without JavaScript the page is the prose plus the open outline: a script
failure loses the picture, not the content. The `.js` class that hides the
unrevealed parts is only added once the diagram has been built.

## Updating screenshots

The current screenshots came from a seven-node synthetic graph. `Copy` has two
parents, which demonstrates a topology that cannot be represented by a simple
indented outline. Before replacing a file, keep its filename or update every
reference in `index.html`, `review/index.html`, and `smoke.mjs`.

The contact sheet lists the current capture defects. A future recapture should
fix those rather than silently deleting the list first. In particular:

- move the crosshair away from the `Docs` text;
- keep the complete top row in routing frames;
- use current per-axis horizontal-tree spacing;
- avoid placing the crosshair over a link in the growth frames;
- decide whether compact and full keymenus should appear in the same sequence;
- add by-node/by-link navigation only after the interaction is stable enough
  that the capture will not immediately become misleading.

## Deployment

The Hetzner staging deployment is:

```bash
deploy/install-homepage.sh
```

It runs the build, copies the entire `site/dist/` tree into
`/var/www/kidraw-homepage`, validates the nginx configuration, and reloads
nginx. The script does not deploy the Angular editor.

The build leaves the canonical URL as `https://kidraw.net/`, because the dev
host is a staging location rather than the final public identity of the page.
