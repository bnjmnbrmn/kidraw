---
title: Interaction surfaces — beyond the held-chord (live discussion)
type: discussion
status: in-progress
date: 2026-05-31
---

# Interaction surfaces — beyond the held-chord

> Live discussion note (resumable). Captures the framing as we converge. Not yet
> a decision. Started 2026-05-31 after wave-1/wave-2 prototypes proved that a
> single interaction grammar (the held-chord) doesn't fit every task.

## The problem being chewed on

kidraw today has **one interaction grammar**: the held-chord. Every action in
`normal` is "hold a prefix key → keymenu shows a submenu → tap a leaf." It's
great for small, known, one-shot actions, but it strains when:

- the task is **sustained** (place a row of nodes → fingers clamped the whole time);
- the task is **pick-from-a-set** where the set is **visual / numerous / user-defined**
  (choose a style to add to a palette → there is no natural mnemonic key for
  "the teal dashed one");
- the action is **rare** or lives in a **huge sparse namespace** (doesn't deserve a key at all).

Related existing notes: [idea-quick-settings-panel](idea-quick-settings-panel.md)
(already names the "exponential menu explosion" failure mode),
[idea-label-edit-overhaul](idea-label-edit-overhaul.md),
[idea-keymenu-class-hierarchy](idea-keymenu-class-hierarchy.md),
[architecture-mode-hierarchy](architecture-mode-hierarchy.md),
[architecture-keymenu-model](architecture-keymenu-model.md).

## Scope picked for this session (user)

In-scope primitives to design around:
- **Spatial picker overlay** — arrow-key-navigated menu drawn over the graph.
- **Held-chord** — keep, for short one-shot actions.
- **Text / command input** — typed escape hatch for rare / parameterized actions.
- **Additional modes/roots** — think about more top-level roots alongside
  normal/navigation and edit.

(User did *not* pick "sticky modes (tap)" as a separate primitive — see the
"sticky = persistence modifier" reconciliation below.)

## Framing (converged: the transition-function decomposition)

> The user reframed this better than my original "surfaces" idea. "Surface" was
> conflating two distinct inputs — a *keymap style* (held-chord) with a *thing
> you work on* (text box, picker). Superseded. The right question is: **how do
> we factor the inputs to the function that decides what happens on a key
> event?**

```
handle(event, mode, heldKeys, modeLocalState, target) → effects + nextState
```

`event ∈ { keyDown(k), keyUp(k), tick(now) }`. The inputs:

- **mode** — selects the active keymap (what keys *mean*) + the transition
  rules. Also names which target is focused.
- **target** — the thing keys *act on*: graph, settings panel, style picker,
  text box. Holds its own internal state (graph selection + crosshair; picker
  highlight; text cursor).
- **heldKeys** — physical key state (ground truth from the OS).
- **modeLocalState** — ephemeral state belonging to the current mode: shift-shift
  timer, tap-vs-hold pending timers, repeater state, and (for chord modes) the
  current key-path / active submenu.

### Refinement 1 — target type is determined by mode, but target state is independent; some targets outlive the mode

The graph is a long-lived target across every mode; pickers and text boxes are
transient, spun up on entry / torn down on exit. The palette case shows two
objects can be live at once: the picker has **focus** (gets the keys) but
operates against the graph **selection** as **context**. "The thing we're
working on" is sometimes focus + context, not a single object. Context isn't a
new input — it's the focused target's data.

### Refinement 2 — each mode reads only a subset of the inputs (and I1–I3 are chord-local)

Chord modes lean on `heldKeys` + key-path machinery; a text-box mode barely
cares about held keys; a picker mode cares about arrow keys + highlight, not
chords. **Consequence:** invariants I1–I3 (key-path, fresh-press, stale-key,
repeater lifetime) from [architecture-keymenu-model](architecture-keymenu-model.md)
are **chord-mode-local invariants, not universal**. They don't need to hold — or
even parse — inside a picker or text mode. The model currently presents them as
whole-system invariants; really they're the invariants of *one mode family*.
Worth nailing down before adding modes that don't obey them.

### vim modes as top-level peers

vim normal / insert / visual become **top-level peer modes** alongside
kidraw-normal — each just a `(keymap, transition rules, target=graph)` triple.
vim-visual differs from vim-normal only in keymap + a selection-anchor in
modeLocalState; same target. No special machinery.

**The live design question this surfaces:** once top-level modes are a flat-ish
peer set (kidraw-normal, vim-normal/insert/visual, style-picker, command…),
*switching among top-level modes* becomes its own interaction needing its own
keys. This is the same pressure [idea-quick-settings-panel](idea-quick-settings-panel.md)
flagged as "exponential explosion," relocated: we trade one deep chord tree for
several shallow modes, but now need a clean **mode-switch grammar** (dedicated
chord? sticky tap? command? leader key?). This is the real content of the
user's "additional roots" interest.

### 2. The selection rule (task shape → surface)

- **one-shot, small known set, want hands free after** → held-chord (stay in `normal`)
- **choose-from-a-visual/dynamic set** → spatial picker mode
- **rare / huge namespace / parameterized** → command (text) mode
- **sustained repetition of one action** → sticky variant of the held-chord

### 3. Sticky is a persistence *modifier*, not a new surface

"tap = sticky-insert, hold = transient submenu" (wave-1 Proposal B) is not a new
surface — it's the held-chord surface with its exit condition changed from
"on key release" to "on explicit exit." This is why it sits apart from the three
surface types. It can apply to any held-chord mode.

### 4. Entry respects keyboard-first + no-hardcoded-keys

Richer surfaces are **launched from the held-chord tree**: a leaf binding does a
*mode-switch* into the picker/command surface. e.g. `w` (style submenu) → leaf
"palette…" → mode-switch into the swatch picker. Keeps everything reachable from
the one root and respects "all bindings flow through KeymenuKeyAssignments."

### 5. Exit grammar stays uniform

Esc / Ctrl-[ / double-Shift exits any surface to its parent (same as `edit`
today). Picker: Enter/leaf commits+exits, Esc cancels+exits. Command: Enter
runs+exits, Esc cancels. CapsLock-state preservation rule still applies.

### 6. Validity conditions tie into greyed-options

An "apply palette style" picker is only valid when something is selected — this
is exactly [idea-greyed-submenu-options](idea-greyed-submenu-options.md). The
picker can render the set but disable commit, or the mode reverts if selection
clears (Mode validity condition from the keymenu model).

## Worked example — palettes (the user's motivating case)

Two sub-tasks, two surfaces:
1. **Define** a style (color × weight × dash × arrowhead): composing several
   attributes → a small *form* picker (multi-row spatial), or a sequence of pickers.
2. **Apply** a palette entry to a selection: choose one from a user-defined visual
   set → spatial swatch picker. Once the palette has ~8 entries, held-chord has
   no mnemonic for each → picker clearly wins.

Palettes are the poster child for the spatial picker: the set is user-defined
and visual.

## Open questions for the user (live)

- **The mode-switch grammar.** Flat-ish set of top-level modes ⇒ how do you
  enter/leave one? Dedicated chord, sticky tap, command, or leader key? This is
  the crux of "additional roots." → _pending_
- **Sticky = persistence modifier, not a peer mode** — still the right
  reconciliation under the new factoring? (It's a change to a chord mode's exit
  condition, i.e. modeLocalState, not a new mode.) → _pending_
- **Is `target` derived from `mode`, or a free input?** Working assumption:
  target *type* is determined by mode; target *state* is independent; graph is a
  shared long-lived target. Confirm. → _pending_

## The mode-DAG model (user's framing — working model)

Modes form a structure rooted at **kidraw-normal**. Other roots/nodes:
vim-insert, vim-normal, kidraw-command (ex-style), kidraw-style, … Entry into a
mode is flexible (many forward shortcuts); exit is structured: **ESC / ctrl-[ /
shift-shift / ctrl-g move you one step toward the root.**

Worked example:
- kidraw-normal → (hold `f`, tap `d`) → **vim-insert**
- vim-insert → ESC → **vim-normal**
- vim-normal → ESC → **kidraw-normal**

### Property: escape is static, not history-based

The example *proves* it: vim-insert was entered directly from kidraw-normal, but
ESC went to vim-**normal**, not back to kidraw-normal. So ESC is **not** "undo my
last switch" / a history stack. Each mode has a **static escape-parent** ("one
step toward root"); ESC walks that fixed pointer regardless of entry path. This
is vim's model (`i`/`a`/`o`/`c` all enter insert; ESC always → normal), wrapped
so vim-normal's escape-parent is kidraw-normal. Slogan: **flexible entry,
structured exit.**

### Structure: a general transition multigraph + a distinguished escape-tree

(User corrected "DAG" → this is cleaner.) Two layers:

- **Full transition structure** = a directed **multigraph**. Nodes = modes.
  Edges = transitions, each **labeled by trigger** and carrying an **entry
  effect**. Multigraph: two edges can share endpoints with different
  triggers/effects (vim `i` vs `a` both vim-normal → vim-insert, different entry
  state). **Cyclic** (normal → insert → normal). No acyclicity constraint.
- **Escape-tree** overlaid on it = a distinguished `escapeParent: Mode → Mode`,
  total except at the kidraw-normal root, forming an arborescence. The *only*
  part that must stay acyclic/rooted.

Two tidiness points:
1. **ESC + alternatives (ctrl-[, shift-shift, ctrl-g) are multiple *triggers*
   for the same escape edge, not multiple edges.** "One escape-parent per mode"
   survives even though several keys invoke it.
2. **Other rootward edges are ordinary transitions** that happen to point toward
   root (`:q`, vim `ZZ`, a "jump straight home" shortcut). Conveniences in the
   general graph; not part of the escape backbone.

### Candidate invariant — bounded escape to root

Because the escape-relation is a rooted tree: **from any mode, repeated ESC
reaches kidraw-normal in a bounded, deterministic number of steps.** The "I'm
lost → hammer ESC to get home" guarantee. The rest of the graph can be arbitrarily
tangled; this backbone is the universal escape hatch. Promote to a named invariant.

### Fork — ESC vs ctrl-g semantics

`ESC / ctrl-[ / shift-shift / ctrl-g` could all be "one step toward root," OR
split: **ESC = up one level**, **ctrl-g = all the way home** (`escapeParent*` to
root; emacs `keyboard-quit` "panic" semantics). No new graph structure either
way. **Open: decide later.**

### Two parallel nested stacks (keep distinct)

| Structure | Traverses | Push | Pop |
| :--- | :--- | :--- | :--- |
| **physical key-path** (within a mode) | held-chord submenus (I1d) | press & *hold* a prefix key | *release* the key (auto) |
| **logical mode-DAG** (across modes) | kidraw-normal → vim-insert … | a mode-switch transition (e.g. `d` leaf) | ESC / ctrl-[ / shift-shift / ctrl-g |

ESC pops the *logical* stack; key-release pops the *physical* one. Both nest
toward a root but one is tied to OS key state (auto-pop), the other is discrete
(explicit-pop). **Open sub-q:** ESC mid-held-chord → lean "collapse physical key-
path to mode root first, *then* next ESC pops the mode" (ESC = uniformly one step
toward the global root).

### CapsLock is an orthogonal modifier, not a DAG node

State is `(mode-DAG-node, capsLock: on|off)`, a product — not "capslock is a
parent mode." Caps survives mode changes and preserves across edit-exit
([architecture-mode-hierarchy](architecture-mode-hierarchy.md)). Keep it on a
separate axis so the DAG and the modifier don't muddle. **Open: confirm, or fold
caps into the DAG as real nodes?**

### Mapping to the existing keymenu model

- The keymenu model's **Mode switch** transition already "resets to the new
  mode's root submenu" — the DAG just says *which* modes connect and adds a
  static `escapeParent` per mode.
- ESC + alternatives become the bound trigger for the "switch to escapeParent"
  transition (via KeymenuKeyAssignments — no hardcoded literals).
- Each mode still owns its own internal key-path/submenu tree (or a non-chord
  surface like text/picker, per the transition-function framing above).

## Concrete modes & edges

### Modes that exist today (6, as a flat dict in `KeyMenu.modesForNames`)

| Mode | Target | Surface | Notes |
| :--- | :--- | :--- | :--- |
| `normal` | graph | chord tree | root. Move(hjkl) + Edit…/Insert…/Select+Drag/Style…/Layout… + utilities (move-speed, pan/zoom, move-by-node, move-by-graph, misc, ctrl) |
| `normalCaps` | — | locked | caps variant; only CapsLock works (→ normal). A "locked" state |
| `labelEdit` | label text buffer | text (faked as chord) | every letter/digit/punct = `INSERT_CHAR`; Backspace, Enter=newline, Shift→submenu, Ctrl→submenu |
| `labelEditCaps` | label text buffer | text | uppercase variant |
| `labelEditVimNormal` | label text buffer | chord-ish | **already a vim-normal!** `i`/`a`→insert, hjkl move (stubbed), x/Backspace delete |
| `labelEditVimNormalCaps` | label text buffer | chord-ish | caps variant |

### Edges that exist today

- `normal → labelEdit` — inserting/editing a label (`goInsert`, ADD_LABEL).
- `normal ↔ normalCaps` — CapsLock toggles.
- `labelEdit → labelEditVimNormal` — **Esc / ctrl-[** (first escape).
- `labelEditVimNormal → normal` — **Esc / ctrl-[** (second escape).
- `labelEditVimNormal → labelEdit` — `i` / `a` (two edges, same target — the multigraph!).
- `labelEdit ↔ labelEditCaps`, `labelEditVimNormal ↔ labelEditVimNormalCaps` — CapsLock.
- `any labelEdit* → normal/normalCaps` — **double-shift** (exits label-edit, preserves caps level).

**Escape-tree today (collapse caps):** `labelEdit → labelEditVimNormal → normal(root)`.
That is *exactly* the proposed model, already shipping — in the label-edit corner.

### Proposed new modes (target)

- **`kidraw-command`** (ex-style): target = command buffer. Enter from normal via
  `:` (or a misc leaf). escapeParent = normal; Enter runs then → normal.
- **`kidraw-style`** (palette picker): target = picker widget, with graph
  **selection as context**. Enter from normal's Style… leaf "palette…".
  Arrow-nav; Enter applies + → normal; Esc cancels + → normal. Validity: requires
  a selection ([idea-greyed-submenu-options](idea-greyed-submenu-options.md)).
- **`vim-normal` / `vim-insert` (graph-scoped)** — *optional/future*. Distinct
  from the existing text-scoped `labelEditVimNormal`. **Name-collision flag:** the
  existing vim-normal edits *text*; a graph vim-normal edits the *graph*. Don't
  conflate.

## Reconciliation with the code

- **R1 — the escape-tree already exists, but hardcoded.** `labelEdit →
  labelEditVimNormal → normal` is imperative `if (Escape) switchMode(...)`
  branching in `handleKeyDown` (keymenu.component.ts ~1097–1126), not a
  declarative `escapeParent`. Realizing the model = lift this into an
  `escapeParent` field on the Mode + route Esc/ctrl-[ through it generically.
- **R2 — double-shift already = "jump home" (ctrl-g semantics).** The Esc=step /
  ctrl-g=home fork is *already shipped*: Esc steps through the label-edit
  subtree; double-shift jumps straight to `normal`. Not hypothetical — needs
  generalizing + naming.
- **R3 — caps is materialized as duplicate modes, not a boolean axis.** The 6
  modes are really 3 logical modes × {caps, no-caps}. The `(mode, caps)` product
  is cleaner but a bigger refactor (every mode doubles). Recommend: keep
  duplicate-modes short-term, give each an escapeParent, revisit collapsing caps
  to an axis later. **Tension flagged.**
- **R4 — everything is forced through the submenu/chord abstraction, even text.**
  `labelEdit` is a flat `SubmenuConfig` with one `LabeledAction` per character.
  An arrow-navigated **picker is the first surface that won't fit the submenu
  mold** → needs a new Mode subclass (parallel to `USQwertyMode`) with its own
  render + input handling, plugged in via `modeConfig.createMode`. This is the
  main *new build*; the rest is refactor.
- **R5 — mode switches are hardcoded `switchMode('literal')` calls** scattered in
  the component; edges aren't data. The architectural move: a declarative
  **transition table** (per mode: triggers → target + entry-effect, plus
  `escapeParent`) that turns "6 hardcoded modes" into "a registry the model
  describes."
- **R6 — I1–I3 live in `USQwertyMode`'s submenu stack** — confirming they're
  chord-mode-local. The picker mode won't use the stack; it gets its own simpler
  invariants.

### Suggested sequencing (not yet ratified)

1. **Lift escape into data** (R1/R2/R5): add `escapeParent` + a step/home
   distinction, replace the hardcoded label-edit escape branching. Pure refactor,
   no new UX — de-risks everything else. Behavior-preserving; testable against
   current label-edit flow.
2. **Add the picker Mode subclass** (R4) as the first non-chord, non-text surface;
   land `kidraw-style` as the first user of it (the motivating palette case).
3. **Add `kidraw-command`** (reuses text-input plumbing from labelEdit).
4. **Graph-scoped vim modes** — only if wanted; biggest scope, least urgent.
5. **Collapse caps to an axis** (R3) — optional cleanup, independent of the above.

## Naming — `USQwertyMode` is misnamed (confirmed)

`USQwertyMode` is the *sole* concrete impl of the `KeyMenuMode<T>` interface
(`modes/us-qwerty.ts`). What it **is**: the **submenu-stack surface** — owns
`stack: KMSubmenu[]`, push/pop on hold/release, renders the cards. The name
fuses two unrelated things:
- interaction/surface = submenu-stack (both chord-nav *and* text-entry ride it;
  `labelEdit` is a flat submenu with one char-action per key);
- keyboard layout = US-QWERTY.

**The constructor already takes `keyboardLayout?: KeyboardLayout` as an injected
param** (us-qwerty.ts:20) → layout is *already* parameterized; "USQwerty" is
vestigial. **Proposal:** rename → `SubmenuStackMode` (names the surface), keep
keyboard-layout as the orthogonal injected axis. Clears runway for the picker
(R4) as a sibling `KeyMenuMode` impl (`PickerMode`). (Distinct from
[idea-keymenu-class-hierarchy](idea-keymenu-class-hierarchy.md), which is about
`KMKey` types, not Mode naming.)

## Caps-lock: a key-RESOLUTION transform, not a mode dimension (revised)

> **Supersedes** the earlier "caps = boolean axis the mode reads" proposal. The
> user's pushback (vim's `i` ≠ `I`) showed that was wrong.

**What vim actually does:** caps lock is OS-level. Caps on → pressing physical
`i` delivers `I` to the app; vim never reads a caps flag, it just receives `I`,
and `I` is a *distinct command* (`i`=insert-before, `I`=insert-at-first-nonblank).
**Caps only transforms letters** — `1`, `:`, `/` are unaffected. So caps-on is
the normal world with the 26 letter-keys rerouted to their uppercase bindings,
not a fully separate plane (a fully-parallel plane would duplicate every
non-letter binding).

**Clean model:** caps + shift are transforms from **physical keypress → logical
key**. A mode has **one binding table over logical keys**, with `i` and `I` as
independent entries. Caps decides whether physical-i resolves to `i` or `I`; the
mode dispatches on what it receives. Forces intentionality: `I` is just another
key — bind it, alias it to `i`, or leave it a no-op. Unifies caps + shift (both
produce uppercase letters; differ only sticky-vs-momentary, letters-only-vs-all).

**The current code made the opposite choice, explicitly:** `resolveKeyString`
(us-qwerty.ts:122) and `resolveTrackingKey` (keyMenu.ts:85) both
`toLowerCase()` A–Z at resolution, *discarding case*, then reintroduce uppercase
via separate `…Caps` modes. The clean inverse: stop lowercasing at **dispatch**;
let `I` flow through; bind both cases. Track hold/release by `event.code`
(physical identity); dispatch by the case-sensitive logical key. That split also
fixes the press-`i` / caps-on / release-`I` mismatch the lowercasing papers over.

**Ties to the naming bug:** `USQwertyMode` fused layout + mode because
key-resolution (layout concern) wasn't separated from binding (mode concern).
Separate them → caps/shift land in the resolution/layout layer = also the right
home for the **keyboard-layout worry** (IME / Chinese / non-Latin): how caps
behaves, or whether it exists, is a layout-layer decision; modes never care.

**Per-mode caps policy** (avoids hand-writing 26 uppercase bindings; *is* the
forcing function):
- `mirror` — uppercase aliases lowercase (caps behaviorally inert).
- `distinct` — uppercase keys are their own bindings; unbound = no-op (vim-faithful).
- `uppercase-text` — uppercase letter → insert uppercase char (replaces `labelEditCaps`).

**Result:** caps is NOT a boolean the mode reads, NOT duplicate modes. **Both
`labelEditCaps` and `labelEditVimNormalCaps` die** — caps was never a mode
dimension. Still 6 → 3 modes, cleaner reason. (`labelEditVimNormalCaps` was the
smoking gun: behaviorally identical to `labelEditVimNormal`, existing only as a
"caps was on" memory cell — exactly the symptom of mis-modeling caps as a mode.)

### Reframed S3 (PENDING USER) — graph-normal's uppercase layer

No longer "lockout vs ignore." **What should the uppercase-letter layer (`H J K
L`, `G`, `W`, `X`, …) do in graph-normal?**
- **mirror** — caps inert in graph mode (closest to today's "ignore" intent);
- **distinct command layer** — uppercase = a genuinely useful second set (vim
  `H`/`M`/`L`, `G`, `W`); makes the old lockout look purely vestigial;
- **undefined** — uppercase no-ops in graph mode for now.

→ _pending. Also pending: adopt the per-mode caps policy as the mechanism?_

### Scenario walk-through (under the resolution-transform model)

- **S1** `labelEdit` (policy `uppercase-text`): type `a`→'a'; CapsLock on; physical
  a-key now resolves `A` → 'A'. Mode unchanged; no `labelEditCaps`. ✓
- **S2 (the win)** `labelEdit`+caps → Esc → `vimNormal` → `i` → `labelEdit`;
  caps still on (it's OS state, not mode state) → next letter uppercase. No
  `…Caps` modes involved at all. ✓
- **S3** graph-normal + uppercase letters → mirror / distinct / undefined (above).
- **S4 (leak risk)** caps persists as you enter text — but that's *correct* now
  (matches every other app); no special lockout needed to "contain" caps.
- **S5 (impl)** `capsLockCtrlSwap` and the lowercase-normalization removal both
  live in the resolution layer — the natural place to touch.

## Correction — `edit` is NOT a non-chord surface (it's chord-implemented today)

Earlier glib claim ("edit is already a non-chord surface") was wrong at the
implementation level. `buildLabelEditSubmenuConfig` builds `edit` on the **same
submenu-stack machinery as normal** (`USQwertyMode`), and **Shift opens a held
submenu** (`config['Shift'] = LabeledSubmenuConfig('Shift...', …)`, us-qwerty
keymenu.component.ts:269; Ctrl:282). So typing `A` today is literally a chord:
hold Shift → shifted submenu → press `a`. `edit` *is* a chord surface as built.

**Why it nonetheless feels non-chord — the key distinction:**
- A **chord** is a held **non-modifier** key-path (hold `f`, then `d`); held keys
  are the menu's alphabet, release pops.
- A **modifier** (shift/ctrl/alt/caps) does *not* form a path — it **transforms**
  the next key. `Shift+a` = "the `a` key, shifted, = `A`", not "navigate to a
  shift menu, pick `a`."

So **"modifiers don't count as chord keys" = "modifiers belong to key-resolution,
not the chord key-path."** Strip modifiers into resolution → text entry has no
held prefix → `edit` becomes genuinely non-chord (single key → resolved char →
insert). The current Shift-submenu (`buildShiftSubmenuConfig`) is a *workaround
for the missing resolution layer*.

**Consequence:** `edit` is not proof "a non-chord surface already exists"; it's
proof of the **modifier-vs-chord-key conflation** → more evidence for the
resolution seam, same seam. The first genuinely non-chord surface is the
**picker**.

**Ctrl dual-use wrinkle:** modifiers resolve into compound logical keys
(`Shift+a`→`A`, `Ctrl+x`→`C-x`); a mode *binds* a logical key to an **action**
(`A`→insert) *or* a **submenu-open** (`C-x`→submenu). Modifier never enters the
chord key-path; action-vs-submenu is a binding decision. (Would change Ctrl from
"held-submenu" to "logical-key-that-opens-submenu" — release wouldn't auto-pop,
matching emacs. Behavior change, flag for later.)

## The resolution seam — physical vs logical, and what's actually shared

Questions about caps-policy detail, key-up detection, IME, event tagging, and
Apple-vs-Windows all converge on **one seam: separate key-resolution from
mode-dispatch.**

### IME (Input Method Editor)

Software layer that composes keystrokes into characters for large-charset
languages (CJK) or accented input — type pinyin, pick from a candidate list.
Sits between keyboard and app; during composition the browser emits
`compositionstart/end`, `event.isComposing`, `keyCode===229`. Relevant only to
**text** modes; proves "keypress → character" is a *layer's* job, not a mode's.
Don't preclude it; don't build it now.

### mirror / distinct / undefined caps policies (per-mode — confirmed)

For graph-normal with `k`=move-up:
- **mirror** — `K` does what `k` does; caps invisible (uppercase folds onto lowercase).
- **distinct** — `K` has its own binding (e.g. jump-to-top); caps = a second
  command layer (vim `i`/`I`, `g`/`G`).
- **undefined** — `K` unbound = no-op. (Really just "distinct, nothing bound yet";
  a safe default.)

Two real philosophies (mirror vs distinct); undefined is degenerate-distinct.
Policy is **per-mode**: text → `uppercase-text`, graph-normal → mirror or distinct,
picker → mirror / self-handled.

### Modes are NOT "pure binding tables" (correction)

A flat key→action table fits *chord* modes, fits *text* loosely ("any printable
→ insert it"), fits a **picker badly** (it's a navigation state machine). What's
*shared* across modes is **(1) they consume a resolved key event, (2) they
implement the same interface** (`handleKeyDown/Up` — already `KeyMenuMode`). The
table is one *implementation*, not the abstraction.

### The key-up problem forces the design

Dispatching/tracking on the *logical* (case-sensitive) key breaks key-up: press
physical-i caps-off → keydown `i`; caps turns on while held; release → keyup
`I`; `i` never clears → **stuck key**. This is *why* the current code lowercases
everything (a blunt fix that also discards the case we want).

### ResolvedKeyEvent — tag BOTH physical and logical (the fix)

```
ResolvedKeyEvent {
  physical: event.code,    // 'KeyI' — stable across caps/shift/layout
  logical:  resolvedKey,   // 'i' | 'I' — after layout + caps/shift
  modifiers: { shift, caps, ctrl, alt, meta }
}
```
- **Hold/release tracking, chord key-path, held set → keyed by `physical`.** No stuck keys.
- **Semantic dispatch → keyed by `logical`** (captured at keydown).
- **Design lever:** chords dispatch on **physical** (layout-independent muscle
  memory — works on Dvorak/AZERTY); text dispatches on **logical** (the actual
  character). Same event, two keys, each mode picks. Caps policy operates on the
  logical letter.

### Transform stack (finger → action) and where platforms bite

```
1 Hardware       physical key/scancode (Apple/Win/split differ mainly in MODIFIERS, firmware)
2 OS keymap      scancode→keysym: layout (QWERTY/Dvorak/AZERTY) + caps/shift/altgr; OS remaps (caps→ctrl)
3 IME (if on)    keysyms→composed chars (CJK)
4 Browser        KeyboardEvent: event.code=PHYSICAL (layout-independent); event.key=LOGICAL
5 kidraw resolve OUR policies: capsLockCtrlSwap, caps policy, cross-platform modifier normalization → ResolvedKeyEvent
6 Mode dispatch  consume ResolvedKeyEvent via uniform interface
```
- **Browser already hands us the physical/logical split for free** (`code` vs
  `key`). We currently *collapse* it; we just need to *keep* both.
- Layers 1–4 aren't ours. Our job = layer 5 (resolution) + layer 6 (modes).
- **Apple vs Windows bites at MODIFIERS, not letters** (Cmd vs Ctrl primary,
  Option/Alt, Meta, Ctrl/Caps/Win positions). `event.code` abstracts letter
  positions; platform modifier-normalization lives in layer 5, contained.
- **Split keyboards** send standard scancodes (or remap in firmware below the
  OS) → `event.code` unaffected, mostly free.

**Through-line:** the resolution seam (layer 5) is likely the *first* piece of
work — it subsumes the naming bug, the caps question, key-up correctness, IME
readiness, and platform differences. Modes (layer 6) then consume a stable
`ResolvedKeyEvent` and interpret it per-mode (table / rule / navigation machine),
each choosing physical-or-logical per binding + declaring a caps policy.

## "A key is a key" — no privileged modifier class (refines the modifier-vs-chord correction)

The previous section drew a hard modifier/non-modifier line. **User rejects that
as fundamental:** from the end-user's view a key is a key. There is no inherent
modifier class in kidraw's model — any key (Shift, Ctrl, Caps, `f`) can be a tap
(action), a held prefix (chord), or a transform. *Which* it is, is a **binding
decision, not a property of the key.** We only "compensate for the OS" making
that distinction.

**Reframes the resolution layer's purpose:** not "apply OS modifier semantics"
but **strip the OS's baked-in semantics and hand modes raw uniform facts** — a
*de-OS-ification* layer. Work from `event.code` + an explicit held-set + toggle
states, so a held Shift is just another key in the held-set and *we* decide what
`[Shift, a]` means.

**Dissolves "is `edit` a chord?":** no fact of the matter. Bind Shift as a held
prefix → chord; handle Shift as a character-transform → non-chord. A design
choice, because a key is a key.

**Honest caveats (the real OS-compensation boundary):**
- **Text + IME** — to insert `A`/`é`/CJK, lean on the OS *logical* char
  (`event.key`); don't reimplement per-layout keymaps. So **text binds on
  logical; commands/chords bind on physical.** (The real reason to tag both.)
- **OS-reserved combos** (Cmd+Q, Ctrl+T, Cmd+Tab) — browser/OS eats them; "a key
  is a key" fails here; avoid relying on them.
- **Caps Lock** — a hardware latch, not a momentary key → see twin-mode below.

So "a key is a key" holds cleanly for the **command/chord/menu world**; text and
reserved-combos are the pragmatic boundary.

### Resolution layer, restated (answers "what is layer 5")

A stage that doesn't exist yet, between the browser `KeyboardEvent` and a mode's
`handleKeyDown/Up`. Today: only ad-hoc lowercasing
(`resolveTrackingKey`/`resolveKeyString`), events near-raw to modes.

```
Input:  raw KeyboardEvent (+ getModifierState)
Output: ResolvedKeyEvent { physical(event.code), logical(event.key, case kept),
                           capsOn, modifiers, isComposing }
Owns:   keep BOTH physical+logical; caps/shift state; IME gating;
        capsLockCtrlSwap; Mac-vs-Windows modifier normalization
```
Modes consume `ResolvedKeyEvent` and choose physical-or-logical per binding.

## Caps lock = a TWIN MODE (decided: distinct; graph-normal = root, confirmed)

graph-normal's uppercase layer → **distinct** (chosen). Caps gives a different
enabled set ("twin menus per mode").

Model:
- **State = `(mode, capsOn)`.** `capsOn` flips *only* via CapsLock — never via
  ESC or a mode-switch.
- `(mode, capsOff)` and `(mode, capsOn)` are **twin menus**: CapsLock flips
  twins; ESC moves *within* a twin but never flips it. So caps is **outside the
  escape-tree** — an orthogonal sticky axis. Persists across mode switches.
- **Why caps is the principled exception to "a key is a key":** hardware latch
  (LED, `getModifierState('CapsLock')`, unreliable keydown/keyup across OSes) —
  the one key the OS forces us to model as sticky state. Hence twin-mode; hence
  no-ESC-out.
- **Modeled as *our* axis** (not OS letters-only caps) → the twin can differ on
  **any** key, not just letters. (OS letter-uppercasing only matters for text,
  which uses logical anyway.)
- **Menu warning: yes** — a visible CAPS badge; the twin silently changes
  behavior.

**Twin authoring: full-menu vs overlay (RECOMMEND overlay).**
- *Full-menu* — twin is a separate config sharing nothing unless re-declared.
  Max freedom; heavy duplication + drift (movement/escape/utilities repeated).
- *Overlay* — twin = caps-off menu **+ overrides**; unspecified keys fall through.
  DRY. **And overlay IS the mirror/distinct/undefined policy made per-key:**
  no override = mirror; override→action = distinct; override→no-op = undefined.
  Collapses twin-authoring and caps-policy into one mechanism at the right
  granularity (most keys mirrored, a few distinct). Full replacement still
  expressible (override all). **Decision: overlay-by-default + full-override.**

## Keyboard layout detection & configuration

- **Reassuring decoupling: layout knowledge is needed for DISPLAY, not
  correctness.** Commands bind physical (`event.code`) → right position on any
  layout, no detection. Text binds logical (`event.key`) → OS already applied
  the layout → Dvorak/Hebrew/accented users get correct chars automatically. So
  "know the layout" is a *rendering* concern (label the drawn keys with the
  chars they actually produce), not an input-correctness one.
- **Auto-detect API exists:** `navigator.keyboard.getLayoutMap()` → `event.code`
  → produced char (e.g. `KeyD`→`'e'` ⇒ Dvorak). **Chromium only** (Chrome/Edge/
  Opera; not Firefox/Safari), needs secure context. → auto-detect + auto-label
  where available; **manual picker required regardless** as fallback/override.
- **Manual UX:** on load try `getLayoutMap()`, else layout picker (first-run /
  settings). The "text looks off → prompt" heuristic is polish, not load-bearing
  (text is already correct via `event.key`).
- **The map is DISPLAY-ONLY; neither binding needs it.** Text input uses
  `event.key` live; command input uses `event.code` live. The map just paints the
  right letters on the on-screen keyboard. Proof: with no map at all, text still
  types right and commands still work — only the key *labels* are wrong.
- **For text, source from `event.key`, not physical+map.** Conceptually
  interchangeable given the map, BUT `getLayoutMap()` is *base-layer only* — no
  Shift, no dead-keys/AltGr (`´`+`e`→`é`), no IME. `event.key` already carries
  all of those. Going physical+map for text = re-implementing the keymap. So:
  doesn't matter in principle; logical wins in practice for text.
- **capsLockCtrlSwap is the embryo** of kidraw-level key-config: a *single
  targeted remap* vs a *whole* layout char-map — both live in the resolution
  layer (alongside caps policy, modifier normalization). The swap is the first
  hardcoded instance of the general config the layer formalizes.
- **Non-Latin payoff:** the physical/logical split lets a Hebrew/Dvorak user
  drive the spatial command menu (physical) AND type their script (logical)
  simultaneously, correctly.

### Rendering is a separate axis; text modes need not draw the keyboard

- **AltGr** = right-Alt on non-US layouts; a *third* character layer per key
  (German AltGr+`e`=`€`). Just another modifier the OS folds into `event.key`.
- **Pinyin/IME** = type Latin sounds (`ni hao`) → OS IME pops its *own* candidate
  window (你好…) and swallows keystrokes during composition; we receive final text.
- **Don't mirror IME/AltGr in our display.** Input is already correct via
  `event.key` + OS; the OS draws its own IME popup. Our job = get out of the way.
- **Rendering is per-mode, per-display-style, separate from input handling**
  (`KeyMenuMode` already splits `handleKeyDown` from `konvaGroup`). Text mode's
  natural display = text field / cursor / hint, **not** a full keyboard (cf the
  wave2 compact-keymenu prototype: placeholder instead of 50 letter rows).
- **Simplification (the two combine):** IME/AltGr/dead-keys are a *text* concern,
  but text modes don't draw the keyboard → that complexity never reaches the
  renderer. Drawing keyboard-with-labels (needs the base-layer map) is a
  *command*-mode concern, which has no IME/AltGr. **The hard display cases and
  keyboard-drawing never coincide.**

### Commands bind physical — DECIDED

Real choice was:
- **physical** — layout-independent muscle memory; mnemonics tied to QWERTY positions.
- **logical** — mnemonics follow layout; motion changes per layout, menu redraws.

**Decided: physical.** Rationale: the keymenu is *visual* — it always shows where
bindings are, so users don't depend on the mnemonic, removing physical's main
downside. (Text stays logical regardless.)

## Implementation sketch — `ResolvedKeyEvent` + the resolution stage

```ts
interface ResolvedKeyEvent {
  type:     'down' | 'up';
  physical: string;    // event.code — command modes read this
  logical:  string;    // event.key, case PRESERVED — text modes read this
  capsOn:   boolean;   // getModifierState('CapsLock') — drives twin axis
  shift: boolean; ctrl: boolean; alt: boolean; meta: boolean;
  isComposing: boolean; // IME in progress — text modes defer
  repeat:   boolean;
  raw:      KeyboardEvent; // for preventDefault etc.
}
```

**Slots in** between the raw `KeyboardEvent` and mode dispatch. Subsumes/replaces
the two current lossy half-versions: `resolveTrackingKey` (keyMenu.ts:78) and
`resolveKeyString` (us-qwerty.ts:114), both of which lowercase A–Z. A
`KeyResolver` runs first (`resolver.resolve(rawEvent,'down')`), everything
downstream consumes `rke`. `KeyMenu.keysDown` re-keys from the lowercased
tracking key to **`rke.physical`** → fixes the press-`i`/caps-on/release-`I`
stuck-key bug.

**Resolver owns:** keep both physical+logical (stop lowercasing); read caps via
`getModifierState`; apply `capsLockCtrlSwap` (moves *into* here); flag
`isComposing`; later Mac/Win modifier normalization. (Layout map is NOT needed
here — display-only.)

**Increments (early ones behavior-preserving → de-risked):**
0. Plumbing only: define type + `KeyResolver`, thread through `handleKeyDown/Up`
   signatures; consumers still derive keys the old (lowercased) way. Tests green.
1. Track held-set / key-path by `physical` (`event.code`). QWERTY-identical;
   fixes the case-change stuck-key bug.
2. Command modes dispatch on `physical`; text mode on `logical`. QWERTY-identical,
   now layout-correct.
3. Collapse caps → `(mode, capsOn)` twin axis (overlay); delete `labelEditCaps` /
   `labelEditVimNormalCaps`. First real behavior change; twin/overlay work lands here.
4. Later: `getLayoutMap()` display labeling + manual picker; `USQwertyMode →
   SubmenuStackMode` rename; the picker mode.

Steps 0–2 = "the resolution layer as the first work item," and are
behavior-preserving — lay the seam before anything visible moves.

## Decisions reached

Working direction (mode-DAG model). Confirmed properties: escape is
static/history-free; escape relation = a tree overlaid on a general transition
multigraph; a working instance (label-edit subtree) already ships hardcoded.
`USQwertyMode` confirmed misnamed (= submenu-stack surface).
`labelEditVimNormalCaps` confirmed a pure caps memory-cell duplicate.

User calls made this session:
- **"A key is a key"** — no privileged modifier class; tap/chord-prefix/transform
  is a per-binding choice. Resolution layer = de-OS-ification (raw uniform facts).
- **Caps = twin mode** — `(mode, capsOn)` axis, outside the escape-tree, flips
  only via CapsLock; graph-normal uppercase policy = **distinct**; show a CAPS
  warning in the menu. (graph-normal = the root mode, confirmed.)
- **Commands bind physical (`event.code`); text binds logical (`event.key`) —
  both DECIDED.** Tag both on `ResolvedKeyEvent`. *Dvorak example:* the keymenu
  is spatial, so "insert node = the D-slot" must fire on the physical position
  (and matches the drawn keyboard) regardless of layout; but typing a label in
  that same D-slot must insert `'e'` (what Dvorak types there), i.e. the logical
  char — else non-QWERTY/non-Latin users are forced to type as if on US-QWERTY.
  Same keypress, two fields, each mode reads the one it needs.
- **Twin authoring = overlay** (caps-off + overrides); overlay *is* the per-key
  mirror/distinct/undefined policy. Full-override still allowed.
- **First work item = the resolution layer** (`ResolvedKeyEvent` + `KeyResolver`),
  via behavior-preserving increments 0–2 before any visible change.

Still open: none blocking. Next concrete step: execute increment 0 (plumbing).
