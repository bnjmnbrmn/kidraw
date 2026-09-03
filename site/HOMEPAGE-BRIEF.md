# KiDraw homepage brief

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
