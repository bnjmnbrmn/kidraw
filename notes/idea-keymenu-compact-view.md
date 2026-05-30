---
title: Keymenu compact view — which-key-style alternatives to the full keyboard render
type: idea
---

# Keymenu compact view — which-key-style alternatives to the full keyboard render

## Worktree note

This branch was started from a snapshot of `main` that predates the
`notes/`, `AGENTS.md`, and routing-eval infrastructure. The harness
prevented `git merge --ff-only main` during this session, so the doc
lives here alongside a delta against an older HEAD. When this branch is
rebased / merged onto current `main`, the file will slot into the
existing `notes/` zettelkasten cleanly. The keymenu source on this
branch is byte-identical to `main` apart from a handful of routing-only
key-assignment removals, so the implementation is portable.

## 1. The current full-keyboard render

`KeymenuComponent` hosts a Konva `Stage` (`#keyMenu` div) whose CSS
height is **27em** and width is **100vw**. The renderer (`KMSubmenu` +
`cardRenderer`) draws a full QWERTY layout: every key has a key rect
+ chamfered top + a label box. Submenus are stacked as offset "cards"
that slide in from the bottom, with cutouts showing the held parent
keys. The visible keyboard makes the spatial mapping between physical
key positions and bindings explicit — which is genuinely valuable for
learning a fresh profile.

**The cost:**

- 27em of vertical real estate that's permanently consumed regardless
  of whether the user is currently navigating a submenu or not.
- Once a user has internalised the bindings, they mostly need to be
  reminded of *what's bound in the current submenu*, not where every
  key sits on the keyboard.
- For demo videos or screenshots showing the canvas, the keymenu
  dominates the frame.
- On smaller displays the drawing area can shrink below useful.

## 2. The which-key analogy

[which-key](https://github.com/justbur/emacs-which-key) is an Emacs
package that, after you press a prefix key (say `C-x`), pops up a
two-column list of every key that's bound under that prefix and what
it does — so you can browse from prefix to leaf without memorising
the full keymap. Vim has [vim-which-key](https://github.com/liuchengxu/vim-which-key);
Neovim's [folke/which-key.nvim](https://github.com/folke/which-key.nvim)
is the modern equivalent.

The defining traits:

1. **Just the relevant subset.** Only keys bound under the current
   prefix appear — no full keyboard image.
2. **Triggered, not permanent.** Usually appears after a short dwell
   delay (e.g. 300 ms) when a prefix is held, then vanishes when the
   command completes. Some configs pin it on.
3. **Spatial layout is `key → label` rows**, not physical key
   positions. The visual is a list, not a keyboard.

This translates almost directly to our keymenu: at any moment the
"active submenu" is exactly the set of keys we'd want to enumerate.

## 3. Compact-view proposals

### 3.1 Side panel list (always visible)

```
┌────────── normal > Insert ──────────┐
│                                      │
│  Held: f                             │
│                                      │
│  f  →  Edge                          │
│  d  →  Box →                         │
│  s  →  Circle →                      │
│  a  →  Diamond →                     │
│  q  →  Junction →                    │
│  e  →  Invisible                     │
│  r  →  Label                         │
│  w  →  Waypoint                      │
│                                      │
│  ◯ submenu  ▸ action+submenu  ● action│
│                                      │
└──────────────────────────────────────┘
```

Vertical strip on the right (or left) of the viewport. Always rendered.
Auto-updates as submenus push/pop.

**Pros**
- Permanent, predictable location — eyes can flick once.
- Frees the bottom 27em for canvas.
- Each row is searchable text (good for accessibility / find-in-page).
- Easy to render in pure HTML (no Konva), so it's cheap and themeable.

**Cons**
- Steals horizontal space rather than vertical, which is usually
  scarcer on wide displays. Mitigated by making it narrow (~16em).
- No spatial mapping cue — beginners lose the "what's under my
  middle finger" benefit of the keyboard image.

### 3.2 Bottom strip / floating breadcrumb (always visible)

```
normal > Insert   [f] Edge  [d] Box→  [s] Circle→  [a] Diamond→  ...
```

A single-row horizontal strip across the bottom of the canvas (or the
top, near the header). Shows all current submenu's keys inline.

**Pros**
- Smallest footprint of all options (one row, maybe 2em tall).
- Doesn't move with the cursor — predictable.
- Easy to scan left-to-right.

**Cons**
- Submenus with many keys (style, label-edit) overflow horizontally.
  Either wrap (loses the "one row" win) or truncate.
- Label-edit mode shows ~40 character keys — completely impractical
  on one line. Would have to special-case to "press any letter".

### 3.3 Floating overlay on dwell (which-key proper)

A floating panel appears near the crosshairs (or in a fixed corner)
**only after a brief dwell** on a prefix. As long as no submenu is
active, nothing is shown — full canvas, no clutter. After the user
holds the prefix key for ~300 ms, the panel fades in showing children
of the current submenu. Letting go of the prefix dismisses it.

**Pros**
- Zero footprint when idle. The canvas owns the screen.
- Discovery is on-demand: confident users never see it; learners get
  helpful reminders.
- Mirrors which-key's actual UX, which is well-loved.

**Cons**
- The keymenu's stale-key + repeater rules mean "dwell on prefix"
  is awkward: the prefix may have an action-on-release that we
  don't want to suppress. Need careful integration with `_repeatConfig`
  and the existing `editPending` / `selectDragHoldActive` flags.
- Held-modifiers without dwell never see hints — they have to wait.
- Floating elements near cursor can occlude graph content.

### 3.4 Pinned + ephemeral (hybrid)

Combine 3.1 and 3.3:

- A **slim always-visible chip** in a corner (one line):
  `normal > Insert  (9 keys, hold for full list)`
- On dwell or on a dedicated hotkey, expand into the full panel from
  3.1.

**Pros**
- Best of both: cheap baseline visibility + on-demand depth.
- Mirrors the existing `activeKeyPath` breadcrumb idea (already
  rendered as the mode label in the Konva stage).

**Cons**
- Two render modes to maintain.
- More moving parts; first-pass complexity is higher.

## 4. Recommendation

**Implement 3.1 (side panel list) as the first compact view.**

Reasons:

1. **Lowest implementation risk.** Pure HTML/CSS panel inside
   `KeymenuComponent`, reading from the existing `activeKeyPath` +
   `currentMode.stack[top].keys`. The reactive plumbing is already
   wired (`refreshActiveKeyPath` runs on every keydown / keyup), so
   Angular change detection picks it up for free.
2. **No interaction-model risk.** Doesn't touch `kmSubmenu`'s dwell /
   repeat logic. The Konva stage code path stays bit-identical when
   compact view is off.
3. **Most informative per pixel.** A vertical list with `key → label`
   rows is what a learner actually wants to read; the keyboard image
   is overkill for everyone past day 3. Bottom strip (3.2) chokes on
   wide submenus. Dwell overlay (3.3) requires changing the keymenu
   state machine.
4. **Composable.** Once 3.1 lands, adding the dwell behaviour from
   3.3 or the pinned chip from 3.4 becomes a CSS-level toggle on the
   same data.

**Toggle mechanism.** Use the existing `KeyboardConfigService`
pattern: add a `compactView: boolean` field persisted in localStorage,
plus a URL-param override `?compact=1` so the user can A/B without
clicking through settings UI. The configChanged Subject already
triggers `rebuildKeyMenu`, so the component just has to read the
flag in its template via `*ngIf` and swap which subtree mounts.

The full Konva keyboard stays the **default**. Compact view is opt-in.

**Position.** Right-hand side, fixed, ~16em wide, full height minus
the header. The keymenu's `:host` element drops its 27em height when
compact is on (drawing area expands to fill). The right-panel is
rendered as a sibling `<aside>` with `position: fixed; right: 0`.

**Out of scope for first pass** (intentional punts):

- Themeing: just use the existing palette CSS vars; no per-depth
  colour ladder.
- Highlight-on-press animation: omit; the active key path / mode
  label is enough feedback.
- Repeat / release indicators (`◯ ▸ ●` in the sketch above): omit
  initially; can be added once the basic panel is proven useful.
- Label-edit mode: render a placeholder ("Label edit — any letter
  inserts; double-shift exits"); enumerating all 50 letter keys in a
  side panel is noise.

## 5. Test plan

1. Default (no `?compact=1`, no localStorage flag): existing Konva
   keyboard renders unchanged. All existing keymenu specs continue
   to pass.
2. Compact on:
   - Side panel appears on the right.
   - Bottom keyboard area is collapsed (height: 0).
   - Drawing area takes the freed vertical space.
   - Navigating into Insert submenu (`f`) updates the panel to show
     Insert's children with the breadcrumb `normal > Insert`.
   - Releasing `f` restores the root submenu's keys.
   - Switching to `labelEdit` mode shows the placeholder message.
3. Toggle via URL param flips the panel without a reload.

## 6. Future work

- **Spatial groups in the side panel.** Sort keys by physical row (top
  row, home row, bottom row) and add subtle dividers — recovers some
  of the spatial cue from the full keyboard.
- **Held-prefix dwell overlay** (proposal 3.3) — once the side panel
  is stable, add a fade-in overlay version for when the user wants
  even less chrome.
- **Header chip integration.** The mode label that currently floats
  inside the Konva canvas could move into the header chip so the
  side panel doesn't duplicate it.
- **Density / theming controls.** Once usage data exists, decide
  whether the panel needs density modes (compact / comfortable).
