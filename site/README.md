# kidraw.net introduction page

This directory contains KiDraw's public introduction page. It is deliberately
separate from the KiDraw editor: the editor is an Angular application with two
Konva canvases, while this page is plain HTML, CSS, and a small amount of
JavaScript. A homepage change therefore cannot break graph editing, and the
homepage can load without the editor's application bundle.

The page is built around one idea: the whole argument is a single diagram, and
you watch it get built. The page says "diagram" throughout, never "graph".

**The page writes almost nothing of its own.** Its words are `index.org` — the
headings and the bullets, which are all boxes in the diagram — plus three lines
of hero and the two links: the name, what it is, what it is for, and the
invitation to say what would make it better. Everything else on screen is the
running KiDraw app, filmed while a script pressed the keys. The smoke test
enforces the rule, comparing every line of visible text against the org file
plus that short list.

**The page is four videos.** One per branch of the outline, each under a
breadcrumb saying where in the diagram it has got to — `KiDraw › How does it
work? › Press and hold submenu keys` — which is what used to be a section
heading. Every one of the thirty-four boxes is made on camera: the crosshairs
ride the arrows up to the box it grows from, the camera pulls back, Add is held
and the aim walks the placement lattice, the release opens the label editor and
the camera flies in, and the label is typed. The org file's "breaks in the
sequence" are cut in where they belong: seven small demos, each on a graph of
its own called a, b, c, d.

The page used to be a flip-book — a screenshot per keystroke, played back by the
reader's scroll. Scroll is a lumpy clock: the same gesture ran at a different
speed for every reader, and a tween that took four screenshots looked like four
screenshots. A video runs at one speed, which is the speed it was recorded at.

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

- `index.org` is the argument, as Benjamin keeps it in org-mode. Headings and
  bullets are both boxes now: a bullet is a leaf hanging off the heading above
  it. `tools/capture/outline.mjs` is its machine-readable form, carrying each
  node, whether it is a heading or a bullet (`kind: 'note'`), and which nodes
  earn a demo. It holds no prose of its own. Nothing reads the `.org` file
  directly at build time, so the two are kept in step by hand when the outline
  changes; `smoke.mjs` does read it, and fails if the page says anything the org
  file does not.
- `index.html` is **generated** — see "How the page is made" below. Its
  `site-head` block still carries the title, fonts, and CSS, and `build.mjs`
  still wraps it, but edit `tools/capture/` and regenerate rather than editing
  it by hand.
- `assets/film/` holds the film: `what.webm`, `point.webm`, `how.webm`,
  `features.webm`, a poster frame for each, and `film.json` — the durations and
  the breadcrumb cues, which are what the page plays the trail against.
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
- the film manifest: four videos, each present, each with a poster, each long
  enough to show something, and a breadcrumb cue for every box in the outline;
- that the breadcrumb follows the playhead — seek to the last cue and the trail
  changes to match;
- that every visible line of text, breadcrumbs included, is an org heading, an
  org bullet, or one of the seven lines the page is allowed to say;
- the outline: one item per box, the bullets among them, and its collapse once
  the film is available;
- that a video plays where it is being looked at and stops when it is not;
- that `prefers-reduced-motion` leaves every video for the reader to start;
- no horizontal overflow at desktop and phone widths, and a full-width video on
  a phone;
- the no-JavaScript fallback: the outline stays open and complete and every
  video keeps its controls;
- the review page.

## How the page is made

```bash
npm start                            # the capture scripts drive the real dev server
node tools/capture/film-map.mjs      # ~8 min: the whole diagram, filmed box by box
node tools/capture/film-demos.mjs    # ~4 min: the seven small demos
node tools/capture/film.mjs          # cuts the four videos and writes film.json
node tools/capture/gen-page.mjs      # writes site/index.html
npm run site:build && npm run site:test
```

`film-demos.mjs` takes demo names, so a single one can be reshot:
`node tools/capture/film-demos.mjs layouts hop`. The raw frames live in
`.capture/`, which is not in git; the two passes can be run days apart, because
`film.mjs` only reads their manifests.

### Filming

`tools/capture/record.mjs` is the camera. Chromium hands over a JPEG for every
frame it paints (`Page.screencastFrame`), each acknowledged before the next
arrives, so nothing is recorded while the app sits still. That is what makes the
recording usable: the run waits whole seconds for a layout to settle and for a
held-key surface to finish sliding in, and none of that is worth watching. Dead
air between two painted frames is capped at 130ms — well above the gap between
frames of anything that is actually moving, so a tween is never sped up by it —
and where the reader *should* sit and look, the script says so with `hold(ms)`.

`encode` then samples that timeline at the video's own frame rate rather than
giving every recorded frame a slot of its own. The compositor paints at sixty a
second when something moves; handing each of those a whole twenty-fifth would
play the movement back three times slower than it happened. The film runs at
`FILM_SPEED` (1.35 by default): the app has to be driven a little slower than a
person uses it, and a third again puts it back to the speed the page is
claiming — the same third everywhere, which is the point of using a video.

Playwright ships its own ffmpeg for recording video, and it is a very small
build: mjpeg in, VP8/WebM out. That is exactly this pipeline, so there is
nothing to install.

The page being filmed has to be the app and nothing else. A dev-server error
draws a Vite overlay across the whole window, and a run that is filming the
window films that too — the first cut of the map has a permission error on a
gcloud credentials file, which nothing in this project reads, sitting across
the middle of it for a second and a half. `driver.mjs` installs a
`MutationObserver` before any page script and takes `vite-error-overlay` off
the page the moment it appears, counting them so both passes can say at the end
if the dev server misbehaved.

`tools/capture/driver.mjs` dispatches keys the way `tools/playwright-screenshot.js`
does — `[a d j]` means "hold Add, press Box, press j, release Add" — with waits
long enough for the held-key surfaces to settle. `build.mjs` wraps that in the
operations the capture needs; `gestures.mjs` holds the ones that are about
making a keypress *legible* rather than getting a diagram made: holding a key
long enough to read the menu it opens, walking the crosshairs along the arrows,
putting a box down at a spot chosen by hand, typing at something like a real
hand.

**One browser at a time.** A capture run is about 700MB of Chromium, on a box
with under 4GB that is also running the dev server, and a run has been killed
for memory before now. So the passes are run one after another — never the map
and the demos together, and never a cut (which opens its own browser for the
lens) while either is filming.

Filming happens at 820x700. 820 is the narrowest viewport the on-screen keyboard
fits in — below it the keyboard is *clipped*, not scaled, so a genuinely
phone-sized capture is not an option. One shape now rather than the two the
flip-book needed: a video scales, where two sets of screenshots had to be
captured twice and paired frame for frame. On a phone the video runs edge to
edge to get the width back.

### Keeping the camera still

The film is a camera moving around a diagram, so a move the reader cannot
account for is worse than no move at all. Three sources of that:

- **The out-and-back.** `aimCamera` used to reach for the next box's parent
  before zooming out. At 400% — where editing a label leaves the camera — the
  parent is a screen and a half away, so the reach failed, the fallback fitted
  the whole diagram to find it, and the ladder then climbed back in to 100%.
  It pulls back first and reaches afterwards now.
- **Parking.** `park` moves the crosshairs off the label so the box reads. It
  took the emptiest point on the canvas, which at 400% is a far corner, close
  enough to the edge that the app panned to keep the crosshairs clear of it —
  sliding the box that had just been framed off centre. It takes the nearest
  clear point now, well inside the band.
- **Parking on an arrow.** Whatever the crosshairs come to rest on gets a
  hover trace, and an edge's is a fat white line drawn the length of it. `park`
  samples the edge polylines as well as the boxes.
- **`frameAbove` arguing with Recenter View.** It measured the floor as the
  keymenu element's top, but that element carries transparent padding above the
  card it draws, so `[r p]` — which fits to the app's own inset, about 32px
  lower — always left it something to correct. It reads the component's own
  `viewMinY`/`viewMaxY` now, with 14px of slack, and does nothing after a
  recenter.

### What one box's run shows

In order: the crosshairs riding the links from the box just finished up to the
one this one grows from (Move by Link held, the arrows it can follow lit, the
view travelling with it); the camera pulling back to 100% where the placement
lattice has room, the whole zoom ladder inside a single hold of Pan/Zoom so it
reads as one movement of the camera rather than four; Add held, the grid of
spots showing, and the aim stepping across it; the release, which opens the
label editor — the app takes the camera to 400% and centres the box by itself,
which is the behaviour being shown — and the label typed into it; then the box
sits, selected, with the crosshairs parked somewhere empty.

There is no separate "frame the box" move any more. The box is already centred
at 400% when its label is done, and the zoom back out to 100% for the next box
doubles as the shot that puts it in its place in the diagram.

The label is typed into the editor the grow itself opened, and never through
`Edit Text`. Typing appends to the **selection**, and `Edit Text` re-picks the
selection from whatever is under the crosshairs — so leaving the editor and
coming back works right up until an edge crosses the small box, at which point
the edge wins the pick, the box is not selected, and every keystroke goes
nowhere at all, silently. The grow's own editor is already on the new box,
already in insert, already selected. All three facts are checked before a
character is typed, and the label is read back afterwards. A spoilt take is
backspaced and typed again, and the recorder is told to look away while that
happens — as it is for a placement that has to be rolled back.

### Placement

**The diagram is not laid out as it is built.** Every box is grown straight onto
a chosen cell of the held-Add lattice — the grid of placement spots, which is
what that grid is for — so the shape of the finished diagram is the capture's
own decision, and nothing ever jumps. `rankGrowCells` picks the spot: it scores
every cell the app is offering on whether it carries on the way the branch is
already heading, whether it sits a comfortable distance out, and how much clear
space it leaves against the boxes and the arrows already drawn. A spot is judged
on the box it will *become* once the label is in it, not on the empty 50px one
that lands, and clearance to an arrow is measured along the whole arrow rather
than at its corners. Covering an arrow or a box is disqualifying. The four
questions take a quarter of the canvas each; below them a family fans around the
direction its own branch is going, so a subtree keeps to its own part of the
page.

**A child has to end up further out than its parent.** Not as a preference — as
a refusal. Scored on heading, distance and clearance alone, a crowded arc in the
right direction costs more than an empty cell in the wrong one, and "currently
Chrome only" once landed beside the *root*, four cells back the way its branch
had come, with a long detour of an arrow reaching up to the box it belongs to.
So `rankGrowCells` takes the point the branch grew out of — the grandparent —
and throws out any cell that is not further from it than the parent already is.

The walk to a chosen cell checks after every press what the app thinks is aimed
at. A node standing in the way takes the aim — that is the connect-two-nodes
gesture — and the walk carries on through it, counting cells itself, because a
diagonal spot is only ever reached through its orthogonal neighbours.

Layout runs **once**, as the finale: after the last box the camera pulls back,
Force runs on the whole diagram, and the reader watches it tidy the thing they
have just watched being built by hand. It waits until then because the idea has
to be introduced first (*Node/edge layout on demand*, which has a demo of its
own), and because a box placed into a freshly reorganised diagram is a box
placed into a tangle. Force pulls the diagram in on itself, so the view is
fitted again afterwards and that zoom is part of the film. Layout applies to the
*selection* when there is one, so the selection is cleared before the Layout key
goes down.

**Moving the crosshairs to a named box is the one call that is not a key
press.** `goTo` calls the same `moveCrosshairsBy` the movement keys call, with
the delta worked out for it, because a person would press `hjkl` until they
arrived and a thirty-four-box run cannot afford to guess. The camera has to be
pulled back first when the target is off screen — the crosshairs cannot leave
the viewport.

### The demos

Seven, each on its own three- or four-box graph called a, b, c, d, because the
point of these is the gesture and not the words in the boxes. Each is filmed in
its own browser so it starts from an empty canvas, and only the demonstration
itself is recorded — building the graph is setup, and the recorder is off for
it.

| demo | the box it belongs to | what it shows |
| --- | --- | --- |
| `hold` | Press and hold submenu keys | half a second before the press, the key held, half a second after the release — twice, because the first time the reader is still working out what changed |
| `navkeys` | Some submenu keys allow you to change how you navigate | the same home row under Pan/Zoom, Move by Link and Move by node |
| `release` | Some submenu keys have an action on release | Add held with the dashed spots up and nothing made yet, then let go |
| `routing` | Automatic edge routing | b dragged down until the arrow into it swings across c, and bends around it |
| `layouts` | Node/edge layout on demand | an untidy graph, then Tree →, Tree ↓, Force |
| `hop` | Navigate by hopping from node to node | along the row, down to the box nothing joins, and back — changing direction |
| `links` | Navigate by following edges | four traversals of the arrows, there and back |

`hold` and `navkeys` are **lensed**: the frame is cropped towards the home row
over about four tenths of a second, held there, and let back out at the end, so
`d` through `k` can be read. The crop is widened to the video's own shape first,
so nothing is ever letterboxed. It is applied when the film is cut, not when it
is shot — the recording is the whole window either way.

Three of the demos need a box put down at a spot the placement lattice would
never offer — a free-standing box for hopping to, an obstacle in an arrow's way
— so those are spawned by hand: the crosshairs moved to a point and Add tapped.
Everything else is grown on the lattice like the map's own boxes, which is both
less code and a better demonstration.

A spawn is judged against the **visible band**, not the viewport: the header is
drawn over the top of the stage and the keymenu over the bottom three hundred
pixels of it, so the middle of the stage is behind the keyboard. Getting this
wrong is what put the first cut's layout demo in a heap — the offsets were
worked out from a camera that had since flown to 400% to edit a label, so three
boxes landed on top of each other and the edges between them came out as curls.
Anything that measures the stage now fits the camera first.

Where a drag has to *end* somewhere in particular, the distance is measured
rather than assumed: one press of Select+Drag moves a box a fixed number of
drawing units, so how far that is on screen depends on the zoom. The routing
demo presses until the arrow has actually swung onto the obstacle, and pulls
the camera back a step first so the swing fits in the band at all.

## How the page plays the film

The page is four `<section class="act">`, one per branch of the outline. Each
holds a breadcrumb and a `<video>`; there are no section headings, because the
breadcrumb says the same thing and goes on saying it.

**The breadcrumb is the video's clock.** `film.json` carries, for each act, a
list of `{t, trail}` cues in the video's own seconds — written when the film was
cut, from a `crumb()` the capture emitted as it started each box. The page
listens to `timeupdate` and `seeked` and puts up the trail whose cue has passed.
A demo, filmed separately and carrying no cues of its own, therefore keeps the
breadcrumb of the box it belongs to, which is what it is about.

The chevrons between the steps are drawn by CSS, not written into the markup:
every word on this page comes out of `index.org`, and a chevron is not one of
its words.

**A video plays where it is being looked at.** An `IntersectionObserver` starts
it at 55% visible and pauses it when it leaves, muted, so there is no autoplay
to be blocked. Someone who pauses a video meant to pause it, so scrolling back
into it does not start it up again. Only the first act asks for anything before
the reader gets to it (`preload="metadata"`); the rest load nothing until they
are in view, and every one of them keeps a poster frame, so the page looks the
same before a byte of video has arrived.

Under `prefers-reduced-motion` nothing plays itself: the videos are there with
their controls and their posters, for the reader to start.

Without JavaScript the page is four playable videos and the outline at the
bottom, which is open until the script collapses it. A script failure loses the
breadcrumb tracking and the play-on-sight, not the content.

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
