# KiDraw

**A diagramming tool you drive from the keyboard.** No palette, no dragging, no
hunting for a handle. You move a crosshair around a canvas with `hjkl`, and an
on-screen keyboard — the *keymenu* — shows you what every key does right now.
Hold a key and it opens a submenu; the card on screen changes to match. The
whole interaction model is "look at the keyboard, not at a toolbar".

Angular 19 + Konva. Currently a single-user, browser-only app with local file
and folder ("vault") storage.

> This file is a proposed replacement for the CLI-generated `README.md`.
> It is written for someone who last read this code a while ago.

---

## 1. See it work in five minutes

```bash
npm start          # log collector + dev server → http://localhost:4200
```

Then, with the browser focused (**don't** click anything — everything is keys):

| Type this | What happens |
| :--- | :--- |
| `a` | A node appears under the crosshair and you are in label-edit mode |
| `hello` `Esc` `Esc` | Types the label; first Esc → vim-normal within the label, second leaves editing |
| hold `a`, tap `k`, release | Adds a second node **above**, connected, and drops you into its label |
| `world` `Esc` `Esc` | Same as before |
| hold `b`, tap `j` | Lays the graph out as a downward tree |
| `z` | Cycles the menu: full keyboard → compact side panel → hidden |
| hold `Shift` | Shows the shifted layer (Redo on `u`, Prev Match on `n`) |
| `q` then `o` | File → Open… (vault) |

If you are lost, the menu is the documentation: whatever is on the cards is
what the keys do. `z` brings it back if you hid it.

**Reading a key card:** a chamfered (cut) bottom-right corner means the key has
children — hold it. A `↺` badge means the action repeats while held; `↑` means
it fires when you let go. Corners mean nothing; that is deliberate
([notes/design-keymenu-card-marks.md](notes/design-keymenu-card-marks.md)).

---

## 2. How it fits together

```
AppComponent .......... the shell. Owns display state, routes messages.
├── HeaderComponent ... title, zoom, mode chip, settings, file chip
├── DrawingAreaComponent ... the graph: one Konva stage, two layers
│      DrawingLayer ....... nodes + edges
│      CrosshairsLayer .... the crosshair and every overlay, always on top
└── KeymenuComponent ....... the on-screen keyboard: its own Konva stage
```

They are siblings, not nested. The keymenu floats **over** the drawing area,
and the drawing area is told how much space that costs it (`viewportInset`) so
the crosshair never walks under the card.

**One direction of traffic:**

```
key press → KeymenuComponent → DACommand → AppComponent → Subject<DACommand>
                                                              ↓
                                              DrawingAreaComponent.handleCommands()
                                                              ↓
                                          DANotification → AppComponent → header / keymenu
```

`DACommandType` (about 120 values) is the entire vocabulary between the two
halves. Nothing type-checks that a command sent has a handler — see
[house rules](#5-house-rules) — so `claude-proposed-tests/check-command-wiring.mjs`
checks it statically.

**The wrinkle worth knowing:** for some gestures the drawing area takes the
keyboard away from the keymenu (holding `a` over a node opens "grow mode"; the
go-to popup does the same). The keymenu is then *suspended* — it still draws a
card for that surface, but the drawing area's own `@HostListener` handles the
keys. If a key seems to do nothing, ask which of the two is listening.

---

## 3. Just enough Angular

If your Angular is rusty, the good news is that **most of this codebase is not
Angular**. It is plain TypeScript and Konva. What you actually need:

- **Standalone components** (no NgModules). Four of them, listed above.
- **`@Input()` / `@Output()`** on those components, wired in
  `app.component.html`. That is the whole template layer — there is no router,
  no forms, no state library.
- **`@HostListener('document:keydown')`** — how both the keymenu and the
  drawing area hear the keyboard.
- **One RxJS `Subject<DACommand>`** in `AppComponent`. If you know
  `.next()` and `.subscribe()`, you know the reactive parts.
- **Change detection**: default. Two places emit state from outside Angular's
  zone (Konva callbacks) and call `detectChanges()` deliberately — those are
  commented where they happen.

One wart to know rather than copy: `AppComponent` pushes state into the header
by **assigning fields on a `@ViewChild`** (`this.headerComponent.mode = …`)
instead of binding inputs. That is what
[notes/bug-header-mode-chip-stale.md](notes/bug-header-mode-chip-stale.md) is
about, and it is on the cleanup list below.

Everything else — layout, routing, hit-testing, text wrapping, the caret — is
maths over Konva shapes, testable without a browser.

---

## 4. Where things live

| File | Lines | What it owns |
| :--- | ---: | :--- |
| `drawing-area/drawing-area.component.ts` | **8,518** | Everything on the canvas: commands, navigation, grow mode, overlays, label editing, viewport. Too big; see cleanup. |
| `keymenu/keymenu.component.ts` | 2,033 | Builds the menu tree from key assignments; intercepts chords; mirrors the menu into the compact panel |
| `drawing-area/da-node.ts` | 1,241 | A node: box, label, text overflow modes, the caret model |
| `drawing-area/graph-layout.ts` | 1,084 | Force / tree / radial layouts, ordering optimiser, pierce repair. **Pure functions** |
| `drawing-area/da-edge.ts` | 885 | An edge: path, arrowheads, waypoints, labels |
| `drawing-area/drawing.layer.ts` | 667 | The node/edge collection, snapshots, identity defaults |
| `keymenu/config/key-assignments.ts` | — | **Every key binding, both profiles.** Start here for anything keyboard |
| `lib/keymenu/**` | ~2,200 | The reusable on-screen-keyboard library: cards, keys, submenu stack |
| `extensions/todo-graph.extension.ts` | — | The one "identity" (diagram type): node defaults, status tags |
| `services/` | — | Theme, keyboard config, visual config, vault + draft storage, samples |
| `notes/` | — | The project's memory: decisions, designs, bugs. Read `notes/README.md` first |
| `tools/repro-*.js` | 50 files | Playwright scripts, one per fixed bug. The best regression evidence here |

`dev-status.md` is the running log of where things stand — the most recent
entries are usually the fastest way back into context.

---

## 5. House rules

Each of these exists because breaking it produced a bug someone had to report:

1. **A chord must be physically possible.** Same-hand hub+child may not use
   middle+ring (the fingers the hand cannot separate), and never the same
   finger. [notes/design-chord-ergonomics.md](notes/design-chord-ergonomics.md)
2. **A chord's meaning must not depend on timing.** Submenus open on a ~350ms
   hold, so anything that means something as a chord (Ctrl-R, Shift-U, Shift-N)
   is intercepted in `handleKeyDown` and *also* shown on a card.
3. **One geometry, one owner.** The caret, hit-testing and overlays read the
   *label's* box, never the node's — they differ by the padding inset. The same
   rule killed the CSS-vs-TypeScript duplication of the keymenu's position.
4. **Overlays are not memories.** Anything drawn from a node's box must be
   rebuilt when geometry changes, from the common exit every mutation goes
   through.
5. **Distances scale with the boxes.** Placement and layout spacing derive from
   node size; absolute pixel constants read as chasms in one graph and squeezes
   in another.
6. **No keystroke is silent.** A command that declines says why in the status
   line. A silent no-op is indistinguishable from a bug.
7. **Every command has a handler.** Nothing enforces this at compile time.

---

## 6. Running things

```bash
npm start                                   # dev server + log collector
npx ng build                                # must be clean before committing

CHROME_BIN=~/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
  npx ng test --watch=false --browsers=ChromeHeadless      # ~530 unit tests

node tools/repro-<name>.js                  # one Playwright regression script
node claude-proposed-tests/repro-health.mjs # all 50, against a baseline
node claude-proposed-tests/check-command-wiring.mjs
```

**Gotchas that will cost you an hour otherwise:**

- `CHROME_BIN` is not set anywhere. `npx ng test` fails without it.
- This box is memory-starved: karma disconnects mid-suite while `ng serve` is
  running. Run a subset with `--include`, or stop the dev server.
- The repro scripts need `npm start` running; they drive the real app.
- `tools/draft-mirror.json` (Ben's live graph, readable by the agents) only
  updates when the browser tab reloads or closes. If it looks stale, it is.
- The dev-server watcher has gone stale before; if edits stop hot-reloading,
  restart `npm start`.

---

## 7. Where this is going

**Cleanup, in order of payoff:**

1. **Break up `drawing-area.component.ts`.** The pure modules already extracted
   (`graph-layout`, `gather-fisheye`, `grow-ghost-targets`) are the easiest and
   safest files in the project to change. Next candidates: `overlays.ts` (hover
   trace, landing ghost, grow ghost), `label-edit.ts` (caret + wrapped lines +
   vim motions), `grow-mode.ts` (the held-Add state machine).
2. **Make the invariants executable**, not just documented — see
   `claude-proposed-tests/README.md` for the argument and the tests.
3. **Give the repro scripts a baseline** so their rot is visible.
4. **Header restyle** — below, because it is more interesting than it looks.

### The header, and why it is an architecture question

The header today is a full-width light-blue bar in the flex column: fixed
`3em` line-height, its own CSS variables (`--kd-header-bg`, `--kd-zoom-bg`), and
state pushed into it by field assignment from the shell.

Restyling it to match the keymenu — rounded, floating, chip-like — touches
three things worth deciding *before* anyone writes CSS:

- **Shared visual tokens.** The mode chip, the compact panel header, the
  keymenu cards and the hint pills already agree on a look (opaque chip,
  6–8px radius, a slate border, a light/dark pair). The header would be the
  fifth copy of those values. Extract them once — `--kd-chip-bg`,
  `--kd-chip-border`, `--kd-chip-radius` in `styles.css`, with the dark variants
  beside them — and let all five read from there. That is the difference
  between a restyle and a fifth divergent style.
- **It stops being part of the layout.** A floating header no longer occupies a
  row in the flex column, so the drawing area gets that height back — and, like
  the keymenu, it must then declare what it covers through
  `viewportInset.top`, which is currently hardcoded `0`. That is a five-line
  change *if* the inset stays the single source of truth for "what is covering
  the canvas".
- **Its state should arrive as inputs.** While the header is being rebuilt
  anyway, replacing the `@ViewChild` field assignments with `@Input()` bindings
  removes the stale-chip failure mode by construction.

Nothing else in the app depends on the header's shape, so this is a
self-contained piece of work — as long as the tokens come out of it shared
rather than copied a fifth time.

---

## 8. Further reading

- [`notes/README.md`](notes/README.md) — map of the project's zettelkasten
- [`AGENTS.md`](AGENTS.md) — how agents are expected to work in this repo
- [`dev-status.md`](dev-status.md) — what happened recently, newest last
- [`notes/philosophy-keyboard-first.md`](notes/philosophy-keyboard-first.md) —
  why the keyboard, and what "diagram at the speed of thought" is meant to mean
