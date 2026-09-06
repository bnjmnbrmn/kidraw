# kidraw.net introduction page

This directory contains KiDraw's public introduction page. It is deliberately
separate from the KiDraw editor: the editor is an Angular application with two
Konva canvases, while this page is plain HTML, CSS, and a small amount of
JavaScript. A homepage change therefore cannot break graph editing, and the
homepage can load without the editor's application bundle.

The page is built around one idea: the whole argument is a single diagram, and
you watch it get built. The page says "diagram" throughout, never "graph".

**The page writes nothing of its own.** Every word on it is `index.org`: the
headings, which are the boxes in the diagram, and the bullets, which are the
captions. Everything else on screen is a screenshot of the running KiDraw app,
taken by a script that pressed the keys. Each of the twenty-eight boxes is a
short animation — the keys held down with the dashed targets showing, a small
empty box, the label growing it letter by letter, the box gliding to the place
an approximate force layout finds for it, and the camera moving in to frame it,
selected — and the org file's "breaks in the sequence" are there too: three
keymenu close-ups and a drag where an arrow re-routes around a box pushed into
it. The smoke test enforces the rule, comparing every line of visible text
against the org file.

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

- `index.org` is the argument, as Benjamin keeps it in org-mode. Its own rule:
  **headings are nodes, bullets are not** — a bullet is supporting detail for
  the heading above it, and never becomes a box.
  `tools/capture/outline.mjs` is its machine-readable form, carrying each
  heading, its bullets, and which nodes earn an example. It holds no prose of
  its own. Nothing reads the `.org` file directly at build time, so the two are
  kept in step by hand when the outline changes; `smoke.mjs` does read it, and
  fails if the page says anything the org file does not.
- `index.html` is **generated** — see "How the page is made" below. Its
  `site-head` block still carries the title, fonts, and CSS, and `build.mjs`
  still wraps it, but edit `tools/capture/` and regenerate rather than editing
  it by hand.
- `assets/map/` and `assets/map-m/` hold the capture of the graph being built:
  five or six frames per box, with `map.json` listing each box's run in order.
  The two directories are the same run captured at two shapes — 820x700 for the
  frames that sit beside the prose, 820x1170 for the portrait ones that fill the
  top of a phone screen. File names match across the two.
- `assets/demo/` and `assets/demo-m/` hold the small graphs, in the same two
  shapes: the keymenu at rest and under a held key, a six-frame drag where an
  arrow bends over a box that got in its way, and an eleven-frame drag where a
  box's own arrows re-route — still captured, but no longer shown: one
  re-routing digression is enough.
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
node tools/capture/demo.mjs      # the small graphs, the keymenu, the drags
CAPTURE_PROFILE=mobile node tools/capture/map.mjs    # ~23 min: the portrait set
CAPTURE_PROFILE=mobile node tools/capture/demo.mjs
node tools/capture/shrink.mjs 0.6 0.68 map     # the frames that only flash past
node tools/capture/shrink.mjs 0.6 0.68 map-m
node tools/capture/gen-page.mjs  # writes site/index.html
npm run site:build && npm run site:test
```

`tools/capture/driver.mjs` dispatches keys the way `tools/playwright-screenshot.js`
does — `[a d j]` means "hold Add, press Box, press j, release Add" — with waits
long enough for the held-key surfaces to settle. `build.mjs` wraps that in the
operations the capture needs: type a label (Shift held for capitals and shifted
punctuation, which is what the label-edit keymenu expects), grow a child, apply
tree-right layout, fit the camera, zoom.

Captures are taken at 820 wide in both profiles. That is the narrowest viewport
the on-screen keyboard fits in — below it the keyboard is *clipped*, not scaled,
so a genuinely phone-sized capture is not an option. The two profiles differ in
height: 820x700 for the wide frames that sit beside the prose, 820x1170 for the
portrait ones, whose shape matches a phone screen closely enough that the frame
fills the top 65% of it without cropping.

The window the frames play in is centred and as wide as it can be without
growing taller than the screen; on a phone it is edge to edge and takes the top
two thirds.

What each frame of a box's run is doing, in order: Add held with the dashed
targets showing; a *small* empty box — `fit` is the app's default overflow now,
so a box is born the size of its text and the label grows it rather than filling
a square that was already there; one frame per character typed at about eight
characters a second; the Layout key going down and the box gliding to where Force puts it;
and the camera moving in on the box, selected, zoomed to 200%, centred between
the bottom of the header and the top of the keymenu, with the crosshairs parked
somewhere empty.

The label is typed into the editor the grow itself opened, and never through
`Edit Text`. Typing appends to the **selection**, and `Edit Text` re-picks the
selection from whatever is under the crosshairs — so leaving the editor and
coming back works right up until an edge crosses the small box, at which point
the edge wins the pick, the box is not selected, and every keystroke goes
nowhere at all, silently. The grow's own editor is already on the new box,
already in insert, already selected. All three facts are checked before a
character is typed, and the label is read back afterwards.

**The diagram is never laid out globally.** A box that has found its place is
pinned — `Toggle Pin`, one press, with the box selected, and by label rather
than by "the newest node", since the layout has just moved it and may have
carried it off screen — and `applyLayout`
only moves what is unpinned. So the Force layout that runs after each box moves
that box and nothing else: it slides from the slot it was grown into to
somewhere clear of the nodes *and* the edges already on the canvas (the "clear"
variant adds node-to-edge repulsion), while everything around it stays exactly
where the reader last saw it. The whole-graph tree layouts, which used to run at
each branch end and whenever a box would not fit, are gone; so is the jump they
made. The shape the diagram ends up in is an approximate force layout, built one
box at a time.

Two details make that work. Layout applies to the *selection* when there is one,
so the selection is cleared before the key goes down — a selected box would be
laid out on its own, with none of the edges or neighbours that decide where it
belongs. And the app draws a small square on a pinned node whenever the grid
indicators are up, which is every frame here; the capture hides those markers
before each shot, since they are an artefact of how the run is driven rather
than anything the reader is being shown.

**Anything that moves is photographed while it moves.** The layout glide and
every camera step — each zoom press, each pan press — take a burst of frames, so
the page can play the tween instead of cutting across it. Those frames are
stored leaner and carry a short `data-ms`, so they cost little scroll and little
weight.

Three things about the capture are worth knowing:

- **Placement is trial and error, and that is fine.** The ghost targets are a
  lattice around the parent, three cells each way and diagonals included; a
  press steps one cell in that direction. `growEmpty` walks one to five steps in each direction in turn and
  checks after each try that a *new box joined to the parent* appeared. A try
  that drew an edge to an existing box, or left a box floating, is undone —
  nodes and edges both, since a placement that landed on an existing box adds an
  edge without adding a node. It also has to land **clear of the edges**: the
  app refuses a target whose box would cover an existing *node*, but nothing
  stops one landing on a line, so the walk continues until the new box's
  rectangle misses every edge and waypoint on the canvas, and settles for an
  overlap only when there is no alternative (four boxes out of twenty-eight).
  The Force layout then decides where the box actually sits, which is also what
  frees the slot for the next child: nine children all went in through a single
  `j`.
- **The last frame of every run is the point of it.** The box is selected, so
  the blue highlight says which one the step is about; `park()` moves the
  crosshairs to the emptiest point on the canvas, well clear of the edges,
  because moving them near one pans the view and would undo the centring.
- **Moving the crosshairs to a named box is the one call that is not a key
  press.** `goTo` calls the same `moveCrosshairsBy` the movement keys call,
  with the delta worked out for it, because a person would press `hjkl` until
  they arrived and a hundred-node run cannot afford to guess. The camera has to
  be pulled back first when the target is off screen — the crosshairs cannot
  leave the viewport.

Known gap: an edge between two boxes that *already exist* cannot be drawn by
key press today — holding Add and choosing Edge offers only Self Loop, with no
way to pick a target. The current outline is a plain tree so nothing needs it,
but a cross-branch link would have to be faked or added to the app first.

Overviews are captured at the end of each branch by Recenter alone (`[r p]`),
which is a camera move: the diagram is already in the shape the reader watched
it grow into, and re-laying it out for the photograph would undo the point.

## How the reel works

The page is five acts, one per branch of the outline. An act is one window with
a strip of full-size panels behind it, and a column of empty `.act-span` spacers
that gives the act its length. The spacers and the window share a single grid
cell, so the window can be `position: sticky` for exactly as long as the spacers
last, with no negative margins.

A panel is either a run of frames or a caption:

- **Frames.** Consecutive boxes share one panel, so the build runs on unbroken.
  The panel also stands for one *example* — a keymenu close-up, or the six-frame
  drag where an arrow re-routes around a box.
- **Caption.** The bullets under one org heading, set large, centred, alone.

A caption or an example closes the frames panel and takes the window for itself,
which is the point: the build sequence is wound out of the way rather than
sitting beside or behind the thing being explained. Each panel gets one spacer,
so `.act-span` heights are what pace the page — a run's height comes from how
long its keystrokes would take, a caption or a still example gets 80vh.

**The scroll is the playback.** Nothing advances on a timer. The reading line is
the middle of the window; the script finds which spacer that line is in and how
far through, and that fraction picks the frame. Scrolling faster runs the
animation faster, scrolling back winds it back, and standing still holds the
frame exactly where it is. Within a panel, frames are weighted by `data-ms` —
how long the keystrokes they stand for would take a quick typist — so a label
typed letter by letter takes more of the panel's scroll than the pause after it.
`map.mjs` records these while capturing; `gen-page.mjs` works them back out for
older captures from the frame's kind and the length of the label.

The last 18% of a panel's spacer is the handover: the reel winds on by one
window, so the frames slide up and out while the caption or example rises into
the place they just left.

Each frame is a `<picture>`: a `<source media="(max-width: 61.99rem)">` pointing
at the portrait capture, and an `<img>` with the wide one. The two sets are
different shapes, which `srcset` cannot express, so this is art direction rather
than a responsive image. Only one frame carries `is-on`, and the one it replaced
keeps `is-under`, stacked underneath rather than cross-faded — there is no fade
at all, since a fade can only lag a scroll it is chasing. A frame whose image
has not arrived is not put up: the last one holds until it lands, because
painting a transparent picture over the last one double-exposes the two.

A keymenu close-up is a strip eight times wider than it is tall. Fitted to the
width of a phone its labels are unreadable, so there it is drawn at 190vw and
the panel pans sideways, starting centred on the picture.

Without JavaScript the page is the first frame of each act and the outline at
the bottom, which is open until the script collapses it. A script failure loses
the stepping, not the content.

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
