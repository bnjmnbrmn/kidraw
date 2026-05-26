---
title: Keymenu organization — held-key submenus vs sticky modes vs alternatives
type: idea
---

# Keymenu organization — held-key submenus vs sticky modes vs alternatives

How the keymenu groups commands today, and three concrete alternatives we could try
instead (or in addition). Background reading: [architecture-keymenu-model](architecture-keymenu-model.md),
[architecture-mode-hierarchy](architecture-mode-hierarchy.md), [architecture-key-profiles](architecture-key-profiles.md),
[architecture-invariants](architecture-invariants.md), [decision-interaction-model](decision-interaction-model.md),
[philosophy-keyboard-first](philosophy-keyboard-first.md).

## Where commands live today

The `normal` mode root submenu (vim profile) currently exposes these top-level keys:

| Key       | Behaviour              | Style                     |
| :-------- | :--------------------- | :------------------------ |
| `h j k l` | Move crosshairs        | direct action + repeater  |
| `f`       | Insert submenu         | **held submenu**          |
| `i`       | Edit submenu / tap-i = edit selected | held submenu + tap-action |
| `v`       | Select+Drag            | **held action+submenu**   |
| `w`       | Style submenu          | held submenu              |
| `b`       | Layout submenu         | held submenu              |
| `r`       | Pan/Zoom submenu       | held submenu              |
| `t`       | Move-by-node submenu   | held submenu              |
| `g`       | Move-by-graph submenu  | held submenu              |
| `m`       | Misc submenu (save/load/profile/...) | held submenu |
| `x`       | Delete                 | direct action             |
| `c`       | Clear selection        | direct action             |
| `u`       | Undo                   | direct action             |
| `s`/`a`/`d`/`q` | Coarse/fine move-speed submenus | held submenu     |
| `Ctrl`    | More-Ctrl submenu      | held submenu              |
| `CapsLock`| Switch to `normalCaps` mode | mode switch          |

There are also four real **modes** (`normal`, `normalCaps`, `labelEdit`, `labelEditCaps`),
plus the new label-edit vim-normal pair. Mode switches happen on tap-CapsLock,
on entering label-edit (via insert-node finalize, double-Shift back, etc.).

**The dominant pattern is the held-key submenu.** Everything organized into a
group — insert, style, layout, pan/zoom, navigation, misc, even the speed
modifiers — is rooted at a letter you hold down while tapping the leaf key. The
opposite hand provides the leaf (so f-d for "insert box" is held-by-left-index,
tapped-by-left-middle, which is fine; v-h for "drag left" is held-by-left-index,
tapped-by-right-index, even better). Release the held key and you're back at the
root. This is fast in muscle memory but invisible to a first-time user, and it
makes long-running tasks awkward: you can't let go of `f` to take a breath or
look at the canvas without dropping out of the insert context.

In the keymenu library, a "submenu" and a "mode" are the same shape underneath
(both are a `KMSubmenu` keyed by `KeyString`), but they differ in lifetime:

- **Submenu** — pushed/popped by the keypath, **lives only while keys are held**
  (invariant I1c). Renders as a sliding card on top of the keyboard.
- **Mode** — a top-level switch on `KeyMenu.currentMode`, **lives independently
  of held keys**, has its own Konva group, and is selected by name. Switching
  modes also resets state (`beforeSwitchOut` pops the stack, cancels tweens,
  etc.).

So today, the *only* sticky containers are the four actual modes. Everything
else is held-only. The proposals below are about which extra containers are
worth promoting from "held submenu" to "sticky mode" (or moving sideways into
some other organization entirely).

## Proposal A — Pure sticky modes (vim-style)

**Mental model.** Each top-level submenu becomes a real mode. Tap `f` to *enter*
"insert mode"; the keymenu now shows the insert submenu's bindings at the root
(no held-key visualisation needed). Tap a leaf to act and stay in mode (so you
can build many nodes in a row). Esc / Ctrl-[ / double-Shift returns to the
parent mode. The header chip and the mode label both reflect the current sticky
mode prominently.

**Pros.**

- **Discoverability:** the keyboard card is *always* showing your real choices.
  No "go discover what's under `f`" by physically holding it.
- **Sustained tasks become natural.** "Add 7 nodes in a row" is `f` → 7×(direction)
  → Esc, instead of "hold `f` the whole time and remember not to slip."
- **Aligns with the only existing sticky container we have** — `labelEdit`. The
  pattern is already there; the alternatives just don't use it.
- **No same-hand chord problems.** A long-standing pain point (see
  [architecture-key-profiles](architecture-key-profiles.md) → "When the user is
  holding the insert submenu key, the movement keys are on the same hand …
  finger conflicts arise") evaporates if you don't have to hold the trigger.

**Cons.**

- **Mode error.** Vim's notorious failure mode. If you forget you're in insert
  mode, your `j` keypresses don't do what you expected. We already have this in
  label-edit and it's manageable, but multiplying the mode count multiplies the
  surface area.
- **An extra keystroke per task** (Esc/double-Shift to exit, where today releasing
  the held key is the exit). For one-off tasks this is a regression in speed.
- **Loses the elegant "hold = speculative, release = commit/exit" UX** that
  things like `v` (Select+Drag — pick up item, look around, release to drop)
  depend on. Some held submenus *want* to be held.
- **Mode-stack model needs design work.** Today modes are siblings, not a tree.
  We'd need to decide whether "insert mode" lives at the same level as
  `normal` / `labelEdit` (i.e. a peer) or as a child of `normal` (i.e. a stack
  you can pop). Either has consequences for the existing CapsLock / labelEdit
  rules ([architecture-mode-hierarchy](architecture-mode-hierarchy.md)).
- **Invariant churn.** I1c (every key in the path is physically held) is the
  defining invariant of the *current* state machine. Pure-mode design needs a
  parallel set of invariants — basically the labelEdit invariants — for the
  new modes.

**Fit with kidraw.** Mixed. For "insert many nodes" and "lay out and drag
several things" workflows it's a clear win; for one-shot actions (style change,
single delete, navigate-by-graph one hop) it's slower.

## Proposal B — Hybrid: held for one-shot, sticky for sustained (recommended)

**Mental model.** Keep held-key submenus exactly as they are for *one-shot*
tasks (style, layout, pan/zoom, navigation, misc, speed modifiers, edit-on-
selection). Promote the genuinely-sustained tasks to sticky modes:

- **Insert mode.** Today's `f`-held insert submenu becomes a sticky mode entered
  by tap-`f`. While in insert mode the movement keys still move the crosshairs;
  tap a node-shape leaf to drop a node and stay in mode (so you can place a
  whole tree). Tap `f` again, or Esc / double-Shift, to exit. Held-`f` could
  *also* still work for backwards compatibility — releasing exits the mode —
  giving the muscle-memory user the option of either pattern.
- **Drag mode.** Today's `v`-held Select+Drag becomes a sticky mode entered by
  tap-`v`. In drag mode the directional keys drag the selection; Esc exits.
  Held-`v` keeps working as "quick reposition" for users who like it.
- **Label edit.** Already sticky. No change.

Everything else (style, layout, pan/zoom, etc.) stays held-only, because those
submenus are short visits — you go in, pick one of 4–6 options, and leave. They
don't benefit from stickiness.

**Pros.**

- **Best of both worlds.** Short tasks stay fast (no extra Esc); long tasks
  stop being physically uncomfortable.
- **Solves the same-hand-chord problem only where it actually bites** (insert
  mode's `f` is left-index, movement is right hand — but if you ever need to
  hit `g` or `t` or any same-hand key while inserting, you're stuck). Sticky
  insert frees up both hands.
- **Incremental.** Can ship per-submenu. Start with insert (highest
  pain), measure, then decide about drag.
- **No mode hierarchy redesign needed.** "Insert mode" can sit as a sibling of
  `normal` and behave just like `labelEdit` does (entered from `normal`, Esc
  returns to `normal`).
- **Backwards-compatible.** Held-key behaviour can be preserved while sticky
  mode is added — same trigger key serves both interactions, distinguished by
  hold-vs-tap. (This is how `i` already works for "tap to edit selected, hold
  to enter edit submenu.")

**Cons.**

- **Two patterns means two mental models.** A user has to learn which submenus
  are held-only, which are sticky-only, and which are both. The card visuals
  need to disambiguate clearly.
- **Tap-vs-hold detection.** Already used for `i` but adds complexity wherever
  introduced. Need a consistent threshold across modes (and visible feedback
  during the threshold window) — see [idea-keymenu-discoverability](idea-keymenu-discoverability.md)
  for the related "auto-show on idle hold" idea, which actually fits well.
- **More modes = more state. The "what mode am I in?" UI** needs to be very
  clear. Today the mode label exists but is small; would want to make it more
  prominent for any new sticky mode.

**Fit with kidraw.** Excellent. The two submenus that *most* benefit from
sticky are insert (build a graph node-by-node) and drag (reposition many
things), and those are exactly the ones that currently force the user to keep
a finger pressed down for awkward durations. The rest of the menus are
genuinely brief and held-only is fine for them.

## Proposal C — Spatial / page-based (no holding)

**Mental model.** Each "page" is the entire keymenu re-rendered for a context.
Tap `f` to flip to the Insert page — every key on the keyboard now shows its
insert action (or blank). Tap an action key to fire and return to the root page.
Tap Esc or `f` again to return without firing. No keys held, ever; every
transition is a tap. Conceptually this is a single-layer state machine where
each state is one of ~10 named pages.

**Pros.**

- **Maximum visibility.** Every key shows what it does right now. No "hold to
  reveal," no breadcrumb stack. Discoverability is essentially perfect.
- **Conceptually simple.** No fresh-press / stale-key invariants, no key-path
  stack, no held-while-tapping ergonomic constraints.
- **More keys available per page.** A page can use the whole keyboard for its
  action set, not just the keys that are chord-compatible with the trigger.

**Cons.**

- **Throws away the entire current model.** All of invariants I1–I3 plus the
  hold-based held-key-mode design ([decision-interaction-model](decision-interaction-model.md))
  go in the bin. This is a flag-day rewrite, explicitly out of scope.
- **Loses speed.** Held-key submenus collapse the round trip — hold-tap-release
  is two events and zero mode transitions; page-tap-action-tap-back is three
  events and two transitions.
- **Loses the "held = speculative, release = commit" UX.** Things like
  Select+Drag-and-release-to-drop and held-while-watching-the-canvas don't
  translate.
- **Modal trap.** Page-mode error every time the user forgets which page they're
  on.

**Fit with kidraw.** Poor. The keyboard-first philosophy is "high-frequency
actions live on the home row or within easy reach without moving the hand"
([philosophy-keyboard-first](philosophy-keyboard-first.md)); page-mode adds a
tap-and-think delay before every action. Worth knowing about as a reference
point, not as a serious candidate.

## Proposal D — Chord (emacs-style)

**Mental model.** No submenus at all. Instead, top-level commands are
tap-sequences: `b p` (tap-and-release) creates a box, `b c` creates a circle,
`s d` sets directedness to directed, etc. Each "submenu" becomes a prefix; each
leaf is a postfix. The keymenu UI shows the prefix tree and highlights the
current prefix.

**Pros.**

- **Very fast for two-key commands** once memorised — no holding, no waiting
  for cards to animate in.
- **Tons of binding space.** A two-tap chord namespace is ~26×26 ≈ 676 commands
  per prefix layer; never run out of keys.
- **Familiar to emacs/spacemacs users.**

**Cons.**

- **Doesn't fit kidraw's interaction model at all.** kidraw's "Add+Drag"
  fundamentally depends on the trigger key being held so you can drag the just-
  inserted node before releasing ([decision-interaction-model](decision-interaction-model.md)).
  Chord sequences are tap-only and can't express "while this key is held, the
  movement keys drag the new node."
- **Tap-sequence detection needs timeout heuristics** — when is `b` "I want box"
  vs. "I'm starting a `b p` chord"? Either you wait (latency) or you commit
  early (no chords possible). Emacs uses prefix-only keys to avoid this; kidraw
  would need to reserve a key like leader / Space.
- **The visible keyboard overlay stops being a live reflection of "what does
  each key do right now."** It becomes a prefix tree — useful but a different
  kind of object.

**Fit with kidraw.** Poor for primary interaction. Worth borrowing the *idea*
for the misc / save-load / settings menus, which are already tap-only and
don't benefit from holding.

## Recommendation

**Proposal B (hybrid).** Specifically:

1. Promote **insert** to a sticky mode entered by tap-`f`, with held-`f`
   preserved as the existing behaviour. The two are distinguished at keyup
   time, just as `i` already distinguishes tap-i (edit selected) from hold-i
   (enter edit submenu). On any held-`f` action being taken, the keyup is the
   exit and we never enter sticky mode. On bare tap-`f` (no leaf pressed),
   the keyup enters sticky `insertMode`, which shows the insert leaves at the
   root and routes the directional keys to "create a node in that direction
   and stay in insert mode." Esc / double-Shift / tap-`f` again exits.
2. Defer **drag mode** to a second iteration. The held `v` is short-duration
   in practice (a couple of seconds at most), so the pain is smaller. Once
   sticky insert is working and we know the visual / mode-label / exit-rule
   pattern, drag is a straightforward repeat.
3. Leave all other submenus held-only. They're short, fast, and don't suffer.

This minimises invariant disruption (no change to I1–I3; the new mode is a
sibling of `normal` and behaves exactly like `labelEdit` does), preserves
muscle memory for existing users, and targets the workflow most users
complained about (building many nodes without the trigger finger cramping).

The prototype lands as a separate commit so the proposal and the
implementation can be reviewed independently.

## Open questions

- **Which keys are live in the new sticky insert mode?** At minimum the insert
  leaves (`d` = box, `i` = invisible, `s` = edge, etc.) plus movement keys plus
  Esc. Should `v` (select+drag) and `x` (delete) still work? Probably yes — you
  want to delete a misplaced node without exiting. Should `f` re-tap stack
  another sticky-insert-inside-sticky-insert? No — it just exits.
- **Visual cue.** The mode label already exists; do we also tint the
  crosshairs, the canvas background, or add a corner badge? Start with mode
  label only; add more if user-testing shows mode-error.
- **Header chip integration.** [overall-ux-review](agents/overall-ux-review.md)
  cares about the mode badge in the header. Coordinate before shipping.
- **Naming.** "insert mode" collides with vim's vocabulary inside labelEdit
  (`labelEditVimNormal` already uses "insert" to mean "back to typing"). Maybe
  "build mode" or "node mode" or just "Insert" with title-case to disambiguate.
