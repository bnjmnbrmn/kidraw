# KiDraw homepage brief

## September 6, 2026 — eighth revision (an approximate force layout, one box at a time)

Ben, on the seventh: follow an approximate force layout instead of running the
auto layout as the build goes along, so the transitions stop being jerky; show
all the tweens; do not start a box as a large square — it should be small and
expand as the label is typed; do not place a new box on top of an existing box
or edge; and the captions take too much scrolling to get past.

- **Nothing is laid out globally any more.** Each box is pinned once it has
  found its place (`Toggle Pin`, one press, box selected), and `applyLayout`
  only moves what is unpinned — so the Force layout that runs after each box
  moves *that box alone*, from the slot it was grown into to somewhere clear of
  the nodes and the edges already there. The tree layouts that used to run at
  each branch end, and again whenever a long label made a box overlap, are gone,
  and so is the jump they made. The end shape is an approximate force layout,
  arrived at one box at a time. Two things had to be got right: layout applies
  to the selection when there is one, so the selection is cleared first; and the
  pin markers the app draws with the grid are hidden before each shot.
- **Small box, growing.** A box is born the size of its text and each character
  grows it; the default-sized square is never on screen. This started as
  something the capture set on the node, and became the app's own default
  overflow the next day (dev-status 82), so the page and the app now show the
  same thing. The label is typed into the editor the grow itself opens, because
  typing appends to the *selection*, `Edit Text` re-picks the selection from
  whatever is under the crosshairs, and an edge crossing a small box wins that
  pick — after which the keystrokes go nowhere at all, silently. Five capture
  runs died on that before it was understood.
- **The tweens are the animation.** The layout glide and every camera step take
  a burst of frames rather than one, so the page plays the movement instead of
  cutting across it.
- **Placement.** Ghost targets are the parent's row and column plus midpoints,
  and the app already refuses a target whose box would land on an existing node.
  Landing on an *edge* it does not refuse, so the capture checks that itself now
  — the new box's rectangle against every edge and waypoint — and keeps walking
  until it finds a clear spot (four boxes out of twenty-eight had to settle). The walk list
  runs one to five steps in each direction, and because the Force pass moves a
  child off the slot it was grown into, the slot is free for the next one —
  nine children go in through a single `j`.
- **Captions are shorter to scroll past**: 45vh rather than 80, and a still
  example 55vh.

## September 5, 2026 — seventh revision (only the org file's words, on a reel)

Ben, on the sixth revision: cut all the text that did not come from
`index.org`; keep captions that come from its bullet points, and keep specific
examples of features; be more aggressive about moving the build sequence out of
the way for those captions and examples, which were sometimes occluded and never
took the screenshot's place as the reader scrolled; and link the animation
directly to the scroll — faster scrolling, faster animation, and no scrolling,
no frames.

- **The page writes nothing of its own.** What is left is the org headings —
  once each, as an act title over the window — and the org bullets, as captions.
  Gone: the act ledes and eyebrows, the per-box sentences in `outline.mjs`, the
  section headings and intros over the demos, the per-frame captions and the
  frame counter, the hero subtitle, tagline and byline, and the closing card's
  paragraphs. The alpha link keeps its own URL as its label. `smoke.mjs` now
  reads `index.org` and fails on any line of visible text that is not in it, and
  on any heading or bullet missing from the page.
- **One window, a strip of panels.** Each act is a sticky window with a reel
  behind it. Consecutive boxes share a panel so the build runs on unbroken; a
  caption or an example closes it and takes the window at full size. The last
  18% of a panel's scroll is the handover, so the frames slide up and out while
  the caption rises into the place they left. Nothing is beside or behind
  anything any more, so nothing occludes anything.
- **The examples moved into the reel.** The three keymenu close-ups no longer
  sit as thumbnails in a text column, and the edge-routing drag is no longer a
  separate section after the features act: each takes the window at the box it
  belongs to. On a phone the keymenu strip is drawn at 190vw and pans sideways —
  fitted to the width its labels are unreadable.
- **The scroll is the playback.** No timers. The reading line's position within
  a panel's spacer picks the frame, weighted by `data-ms`, so scrolling faster
  runs the typing faster, scrolling back winds it back, and standing still holds
  the frame. This replaces the play-on-arrival runs and, with them, the last of
  the flicker.

## September 4, 2026 — sixth revision (drier, and closer to the app)

`site/current-homepage-criticism.org`: the page read as a sales brochure rather
than a description. The fixes, in the order they were raised:

- **Typography.** KiDraw is the biggest thing on the page, "A keyboard-first
  diagram editor" is a subtitle, the tagline is smaller still.
- **"Diagram", never "graph".** Applied everywhere, including the subtitle,
  which the criticism quoted with the old word.
- **Less text that is not in the screenshot.** No step heading repeating the
  label that is already in the frame, no caption repeating it either, no "It
  starts with one box". The opening act is one line — "The following
  description of KiDraw uses actual screenshots of KiDraw" — and a frame.
- **The author's own bullets, verbatim**, instead of paraphrases of them.
- **Boxes fit their text** (`Style > Overflow > Fit`), the box a step is about
  is **selected**, **centred between the header and the keymenu** rather than in
  the middle of the frame, and the whole thing is captured at **200%**.
- **Less auto-layout.** It runs when a branch finishes, or when there is
  actually no room — no free slot, or a long label overlapping a neighbour —
  and the Layout and Recenter keypresses are in the frames rather than applied
  between them.
- **More like a video.** One frame per character, at a fast typist's speed.
- **Three digressions** in "How does it work?": the keymenu alone with Move by
  Link held, the whole window with the same key held so the lit arrows show,
  and the keymenu alone with Add held so the release mark is visible.
- **The keymenu break is gone**, since those digressions cover it.

## September 4, 2026 — fifth revision (a shorter outline)

A new `index.org`: 28 headings instead of 96, no `List` numbering, no
`[[*cross-links]]`, and a new rule stated at the top — **headings correspond to
nodes, bullet points do not**. The bullets are the author's supporting lines;
they are folded into the prose beside each frame and kept verbatim in the
outline appendix, but they never become boxes.

Four branches, so five acts: the opening box, then What is it? / What's the
point? / How does it work? / Important features?. The org file also now asks for
breaks showing "closeups of the key menu **and demos of automatic edge
routing**", so the keymenu break sits after the first branch and the two routing
demos after the third and fourth.

Frame timing became honest at the same time. Every frame carries how long it
stays up: a label is typed in up to six chunks at about eight characters a
second, so a 62-character heading takes nearly eight seconds to appear, which is
what it would actually take. Overviews switched to the downward layout, because
fitting a tree-right graph on screen leaves an unreadable thread.

## September 3, 2026 — fourth revision (a portrait capture for phones)

The third revision was still wrong on a phone: a 820x700 frame at 390px wide is
a 333px strip, about a third of the screen. Ben wants the app to take the top two
thirds in portrait, and was right that it needs a second set of images.

So the capture runs twice. `CAPTURE_PROFILE=mobile` captures the same build at
820x1170 into `assets/map-m/` and `assets/demo-m/`; the page serves it through a
`<picture>` with a `(max-width: 61.99rem)` source. Both profiles are 820 wide
because that is the narrowest viewport the on-screen keyboard fits in — narrower
than that and it is clipped rather than scaled, so there is no such thing as a
phone-sized capture of this app.

On a phone the stage goes edge to edge and 65vh tall. The padding had to go: the
portrait frame is exactly the shape of the box, so any horizontal padding made
`object-fit` crop the keyboard off both sides.

## September 3, 2026 — third revision (animation and proportions)

Ben, on the second revision: the frames should take about two thirds of the page
rather than a third; zoom in so the text is legible on a phone; animate the
build so the tweens and the label going in are visible; make the capture window
narrower so the keymenu is not floating in empty canvas; keep the crosshairs off
to one side between animations so nothing is covered or highlighted; and add a
demo of dragging a box so its arrow has to route around another box.

All six are in. The capture window is 820x700, the stage column is `2fr` against
`1fr` of prose, every box is a five- or six-frame run played at ~130ms, `park()`
clears the selection and parks the crosshairs on the emptiest part of the canvas
for the settled frame, and the page carries one drag demo: dragging *Ship it*
down forces the *Plan → Ship it* arrow to bend over *Review* instead of running
behind it. A second one, where a box's own arrows follow it, is still captured
but was cut — one re-routing digression makes the point.

The character-by-character typing is three frames per label (empty, about half,
all of it) rather than one frame per character — the page already carries ~560
frames at about 9MB, and a frame per character would multiply that. Frames that
only flash past are stored smaller and cheaper than the one the reader sits on.

## September 3, 2026 — second revision (real captures)

Ben's feedback on the first revision: keep the spacing and placement of the
nodes, but use **actual screenshots of the graph being built in KiDraw** — the
button presses, the zooming in on relevant nodes, the overviews — instead of an
SVG redrawing of the same graph. Give each node **one or two sentences**, and
cut the purple prose and the overstatement. Replace the seven-node demo graph
with something smaller. And show, properly, how edges re-route while a node is
dragged.

So the hand-drawn SVG is gone. `tools/capture/map.mjs` drives the running dev
server, types all ninety-six boxes with real key presses, applies tree-right
layout after each one, and screenshots the result — one frame per box, plus an
overview at the end of each branch. `tools/capture/demo.mjs` builds a four-box
graph for the keymenu frames and an eleven-frame drag sequence. The page is
generated from `tools/capture/outline.mjs`, which holds the outline and the
prose together, so the sentences and the graph cannot drift apart.

The prose target is now: short, concrete, no invented numbers, no rhetorical
flourish. Where something is a plan rather than a feature, the sentence says so.

Two honest gaps, both recorded rather than hidden:

- The three cross-branch links (`↗` in the outline) are not in the captured
  graph. Connecting two boxes that already exist has no target-picking step in
  the held-key surface today, so the links live in the outline and the prose.
- The capture moves the crosshairs to a named box by calling the app's own
  `moveCrosshairsBy`, rather than pressing `hjkl` until it arrives. Everything
  that appears in a frame — adding, typing, layout, camera — is a real press.

## September 3, 2026 revision (superseded)

`site/index.org` — Benjamin's own outline of KiDraw — is now the spine of the
page. The instruction that came with it: *as the user scrolls down, they should
see a diagram be built*, with breaks in the sequence of diagram screenshots
(closeups of the keymenu, for instance), and where the outline says `List`, the
edges to those children carry numbers as labels.

So the page became five sticky stages, one per branch of the outline, each
drawing that branch node by node as the reader scrolls, with the four capture
sets breaking the sequence between them. (The drawing was replaced by real
captures the same day — see above.) The outline itself ships as markup at
the bottom of the page; the diagram is drawn from it, and it is what a reader
without JavaScript gets. The frame-sequence widgets from the August 31 version
are gone — the diagram carries the motion now, and the captures are static.

Two spellings were normalised from the org file for a public page: *Geneology*
to *Genealogy*. *Discover-able* was left as written.

Everything below is the August 31 record and still governs voice, audience, and
the capture set.

## August 31, 2026 design session

This document preserves the homepage decisions made in the August 31, 2026
design session. It is written for someone who has not used KiDraw, read its
source, or worked with Angular.

## What KiDraw is

KiDraw is a browser-based tool for making directed graphs: boxes represent
ideas or tasks, and arrows express relationships between them. Unlike most
diagram editors, its primary interface is the keyboard. A crosshair replaces
the mouse pointer for most work, and an on-screen keyboard shows the commands
that are available at that exact moment.

KiDraw is an alpha. It is useful today, but some interactions and visual
details are still experimental.

## The page's job

The homepage should make one outcome immediately clear:

> Connect your thoughts, at the speed you have them.

The audience is broader than programmers. It includes Obsidian users, people
who organize projects or thoughts, technical and nontechnical friends,
potential collaborators, and investors. The page should explain the product
without assuming that the reader knows graph terminology, modal editors,
keyboard chords, or Angular.

The page is an argument in Benjamin Berman's voice, not a grid of generic
feature cards. It should first show the result, then explain the interaction
model through real screenshots. The live alpha at <https://alpha.kidraw.net>
must remain prominent.

Byline:

> Benjamin Berman — <https://bnjmnbrmn.com>, <https://github.com/bnjmnbrmn>

## The three product ideas to communicate

1. **Keep your hands on the keyboard.** Creating, connecting, moving, editing,
   and arranging ideas should not require repeated trips between keyboard and
   mouse.
2. **The menu is the documentation.** The keymenu is drawn like a keyboard.
   At rest it lights only the commands that work now. Holding a command key
   changes the menu to show that command's possible next steps, so the user
   can act without memorizing a manual.
3. **Use automatic layout or manual fine tuning.** KiDraw can arrange a graph,
   but it also lets the author move a particular node and see its links reroute.
   The intended balance is machine help without surrendering control.

## Visual story

Use real app captures rather than a simulated or playable homepage demo.
Screenshots are easier to inspect and less likely to misrepresent the product.
Small frame sequences may behave like a restrained GIF, but must also have
buttons, captions, and reduced-motion support.

The current capture set is under `site/assets/captures/`:

- `grow-0.png` through `grow-2.png`: a graph grows from two to four to seven
  nodes, including a multi-parent relationship that an outline cannot express.
- `menu-root.png`, `menu-held.png`, and `menu-held-drag.png`: the keymenu at
  rest, while Add is held, and while Select+Drag is held.
- `reroute-0.png` through `reroute-final.png`: a node moves and its attached
  links follow it.
- `reroute-relaid.png`: the same graph after a full automatic layout.
- `ghost-before.png` and `ghost-after.png`: possible node locations appear
  while adding.
- `fix-release-zoom.png`: the release-on-key-up corner mark.

The capture review page records the images honestly, including imperfections
that should be corrected in future recaptures. In particular, the crosshair
overlaps the word “Docs” in several frames; one routing sequence is cropped at
the top; compact and full keymenu views are both represented; and the current
navigation experiment is not yet captured.

## Story outline

- Open with the tagline, a short explanation, the alpha link, and the graph
  growth sequence.
- Explain why mouse-first diagramming interrupts thought.
- Show the root and held-key menu states side by side. Explain that holding a
  key changes both the available actions and the canvas preview.
- Show node movement and rerouting, then the full auto-layout result.
- Show landing ghosts and discuss movement between graph items rather than raw
  pixels. By-node and by-link navigation remain works in progress and should
  be described that way, inline—not hidden and not elevated into a generic
  “honesty” section.
- Compare fairly with Obsidian Canvas out of the box: Canvas is mouse-first for
  creation, connection, and layout, while community plugins and hotkeys can
  extend it. Do not imply that Obsidian is incapable of keyboard workflows.
- Include a concrete now/next/later roadmap based on the real project state.
- End with the larger experiment: AI-assisted development makes trying unusual
  interfaces cheaper, and KiDraw itself is partly built by agents working from
  a task graph kept in KiDraw.
- Close with a clear alpha warning and another link to try it.

## Voice and presentation

- First person, specific, calm, and candid.
- Outcome first; implementation details only when they make the interaction
  easier to understand.
- Dark canvas visual language that belongs to KiDraw, with cyan links and
  yellow arrowheads as accents.
- Long-form reading rhythm with screenshots breaking up the argument. Avoid a
  conventional SaaS card wall.
- Do not use “honesty” as a heading. Simply state limits where they matter.
- Avoid autoplay when the reader requests reduced motion. All controls must be
  keyboard accessible and the page must work on a narrow phone even though
  the product itself expects a physical keyboard.

## Open product questions, not homepage blockers

- The by-node and by-link navigation models are still being judged by feel.
- Edge routing is actively improving. The design goal is to avoid crossings
  and, when a crossing cannot be avoided, keep the intersection angle small
  and readable. Say explicitly that this is still being iterated.
- Competitor references beyond the fair Obsidian Canvas comparison have not
  been selected.
- The exact final placement and length of the AI-assisted-development story can
  change as the page is edited.

## Architecture note for future editors

The homepage is deliberately independent of the Angular application. Its
source is `site/index.html`, a single HTML/CSS/JavaScript page. `site/build.mjs`
wraps that source in a complete HTML document and copies its static images to
`site/dist/`. `site/smoke.mjs` opens the built page in a headless browser and
checks its structure, responsive layout, links, and frame controls. This keeps
marketing-page changes from depending on the editor's much larger Angular and
Konva canvas implementation.
