# kidraw.net introduction page

This directory contains KiDraw's public introduction page. It is deliberately
separate from the KiDraw editor: the editor is an Angular application with two
Konva canvases, while this page is plain HTML, CSS, and a small amount of
JavaScript. A homepage change therefore cannot break graph editing, and the
homepage can load without the editor's application bundle.

The page is built around one idea: the whole argument is a single graph, and
you watch it get built. Every picture is a screenshot of the running KiDraw app
taken by a script that pressed the keys. Each of the ninety-six boxes is a short
animation — the keys held down, the empty box, the label going in, the layout
tween, the graph at rest — and two scroll-scrubbed sequences show arrows
re-routing while a box moves. The content of that graph is `index.org`.

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

- `index.org` is where the argument started: the outline Benjamin keeps in
  org-mode. `tools/capture/outline.mjs` is its machine-readable form, with the
  sentence or two of prose that sits beside each box. Nothing reads the `.org`
  file directly.
- `index.html` is **generated** — see "How the page is made" below. Its
  `site-head` block still carries the title, fonts, and CSS, and `build.mjs`
  still wraps it, but edit `tools/capture/` and regenerate rather than editing
  it by hand.
- `assets/map/` holds the capture of the graph being built: five or six frames
  per box, with `map.json` listing each box's run in order.
- `assets/demo/` holds the small graphs: the keymenu at rest and under a held
  key, an eleven-frame drag where a box's own arrows re-route, and a six-frame
  drag where an arrow bends over a box that got in its way.
- `assets/captures/` holds the older August capture set. The homepage no longer
  uses it; it backs the review page, which is kept as a record.
- `review/index.html` is the durable contact sheet for those older captures.
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

## How the page is made

```bash
npm start                        # the capture scripts drive the real dev server
node tools/capture/map.mjs       # ~23 min: builds the graph, a run of frames per box
node tools/capture/demo.mjs      # the small graphs, the keymenu, the two drags
node tools/capture/shrink.mjs 0.6 0.68   # re-encode the frames that only flash past
node tools/capture/gen-page.mjs  # writes site/index.html
npm run site:build && npm run site:test
```

`tools/capture/driver.mjs` dispatches keys the way `tools/playwright-screenshot.js`
does — `[a d j]` means "hold Add, press Box, press j, release Add" — with waits
long enough for the held-key surfaces to settle. `build.mjs` wraps that in the
operations the capture needs: type a label (Shift held for capitals and shifted
punctuation, which is what the label-edit keymenu expects), grow a child, apply
tree-right layout, fit the camera, zoom.

Captures are taken at 820x700 — narrow enough that the on-screen keyboard fills
the frame instead of floating in a wide empty canvas, which is also what makes
the app readable when the frame is scaled down on a phone. The stage takes two
thirds of the page width for the same reason.

Three things about the capture are worth knowing:

- **Placement is trial and error, and that is fine.** Which dashed ghost is
  free depends on what the layout has already put around the parent, so `grow`
  tries placements in order and checks after each one that a *new box joined to
  the parent* appeared. A placement that drew an edge to an existing box, or
  left a box floating, is undone before the next try. Layout decides the final
  position anyway.
- **The last frame of every run is deliberately boring.** `park()` clears the
  selection and moves the crosshairs to the emptiest point on the canvas, so
  the frame a reader actually sits on has nothing covered by a crosshair and
  nothing lit up because it happens to be underneath.
- **Moving the crosshairs to a named box is the one call that is not a key
  press.** `goTo` calls the same `moveCrosshairsBy` the movement keys call,
  with the delta worked out for it, because a person would press `hjkl` until
  they arrived and a hundred-node run cannot afford to guess. The camera has to
  be pulled back first when the target is off screen — the crosshairs cannot
  leave the viewport.

Known gap: the three cross-branch links in the outline (`↗`) are *not* in the
captured graph. Drawing an edge between two boxes that already exist needs a
target-picking step the held-key surface does not currently offer, so the links
live in the outline and the prose but not in the frames.

## How the scroll-stepped frames work

The page is six acts, one per branch of the outline, with "How does it work?"
split at Advanced. Each act is a grid: a sticky `.act-stage` holding every frame
for that act stacked on top of each other, and a column of `.step` articles
beside it — one per box, carrying its label and its sentence or two.

Each frame carries `data-step` (which box it belongs to) and `data-seq` (where
it sits in that box's run). Only one frame has `is-on`. When a step becomes
active the script plays its run once at about 130ms a frame and holds the last
one, which is the sharp, settled, nothing-selected frame. `prefers-reduced-motion`
skips straight to that last frame.

The two drag sections work differently: their frames are scrubbed rather than
played, by a column of empty `.drag-step` spacers, so the reader's scroll speed
is the playback speed.

Without JavaScript the page is the prose, the first frame of each act, and the
outline at the bottom, which is open until the script collapses it. A script
failure loses the stepping, not the content.

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
