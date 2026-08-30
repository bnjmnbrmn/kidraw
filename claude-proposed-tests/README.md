# Fewer bugs: what to change, and what to test

Written 2026-08-30, from the evidence of the last week's work rather than from
general principle. Every claim below names the bug that motivated it.

There is a companion set of runnable tests in this folder — see
[Running these](#running-these) at the end.

---

## 1. Where this week's bugs actually came from

| Bug | Root cause | Class |
| :--- | :--- | :--- |
| Dashed outline beside its node (2026-08-29) | Overlay is a snapshot; a reflow moved the node | **Derived state cached, never invalidated** |
| Caret drawn mid-word, would not walk to the end (2026-08-30) | Caret measured at the node's width; label had moved inside a padding inset | **The same geometry expressed twice** |
| Circle style unreachable (da-537) | `w`+`e` is ring+middle: the hand cannot make the chord | **Physical constraints not encoded anywhere** |
| Shift+U did Undo (2026-08-29) | Submenu opens on a ~350ms hold; a fast chord fell through to the root binding | **Timing-dependent input semantics** |
| Placement "feels too far" (da-369, da-559) | Absolute slot constants, blind to node size, plus grid rounding | **Absolute numbers in a relative world** |
| `z` untypeable in a label (2026-08-29) | A global intercept ahead of every binding | **Global interception with no mode guard** |
| da-345 "missed" | Implemented for one of two paths; the repro drove that path | **Two routes to one behaviour, one tested** |
| Three crossings | Layout's own objective skips edge pairs sharing an endpoint | **The measurement excluded the failure** |
| `tree-down` crash in `repro-layout-clear.js` | Layout removed 2026-08-28; script never re-run | **Regression evidence that nobody runs** |

Two things stand out. Most of these are not logic errors — they are **two
descriptions of one fact drifting apart**. And nearly all were found by Ben in
the running app, days after they landed, because nothing else was looking.

---

## 2. Code changes, by leverage

### 2.1 Make derived state derived, not remembered

`crosshairHoverHighlight` and `navigationLandingGhost` are Konva shapes built
from a node's box at the moment the crosshairs moved. Every path that changes
geometry has to remember to refresh them; the fix on 2026-08-29 was to hook the
one exit they all happen to share (`updateEdgesForResizedNodes`), which is a
coincidence, not a contract.

**Change:** give the drawing area one `invalidateOverlays()` entry point and
call it from a single post-mutation hook, or rebuild overlays in a
`layer.on('draw')` pass so they cannot be stale by construction. The same
applies to `compactRows`, `activeKeyPath`, `growGhostTargets` and the mode
label — all snapshots of something else.

**Test:** `overlay-freshness.spec.ts` (in this folder) pins the contract for the
two overlays that have already bitten.

### 2.2 One geometry, one owner

The caret bug and the `bottom: 9px` / `HOST_BOTTOM_GAP_PX = 9` pair are the same
mistake at different scales: a number that must agree with another number, with
nothing checking.

**Change:**
- The label's box (`x`, `y`, `width`, `height`) is the only input to caret,
  selection and hit-testing maths. Never `_nodeWidth` again. (Done for the
  caret; `setCursorFromLocalPoint` and the label-edit ghost want the same audit.)
- Export the keymenu's layout constants from TypeScript and set the CSS from
  them (a CSS custom property written once at startup), so `bottom` cannot
  disagree with `HOST_BOTTOM_GAP_PX`.
- `getCardDimensions()` is already the single source for the card; make
  `occludedHeightPx()` the only reader of the host geometry, and assert in a
  test that the rendered host matches it.

**Test:** `caret-geometry.spec.ts` here; plus a proposed `geometry-contract`
spec that renders the keymenu and compares computed styles against the TS
constants (not written — it needs a DOM fixture and I did not want to guess at
your CI shape).

### 2.3 Encode the hand

`notes/design-chord-ergonomics.md` now states the rule (middle+ring is the pair
the hand cannot separate). A note cannot fail a build.

**Change:** keep the finger map in code — a small table in `key-assignments.ts`
— and let the invariant test read it.

**Test:** `keymap-invariants.spec.ts` walks every submenu of both profiles and
fails on a hub/child pair that shares a hand with the enslaved fingers. It also
catches duplicate keys within a submenu (an object literal silently drops them,
so the symptom is a *missing* action), bindings on keys the card does not draw,
and hub labels that still carry an ellipsis.

### 2.4 Kill timing-dependent meaning

A chord that means something must not depend on how long a modifier was held.
Shift+U meant Redo or Undo depending on ~350ms.

**Change:** any binding that is a *chord* (modifier + key) is intercepted in
`handleKeyDown` and mirrored in the corresponding card for discoverability —
never left to the hold. That is now true for Ctrl-Z/R, Shift-N and Shift-U;
make it a rule rather than three instances.

**Test:** a proposed `chord-timing` spec — for every intercepted chord, dispatch
it with 0ms and with 400ms between modifier and key and assert the same command
both times. Not written: it needs a keyboard-event harness that mirrors
`handleKeyDown`'s expectations, which is worth doing properly rather than
sketching.

### 2.5 Absolute numbers are almost always wrong

Placement, layout spacing, edge-margin bands, the "too small to read" font
threshold, the crosshair keep-out band: all were fixed pixels in a world where
node sizes vary by 6x between Ben's cards and the defaults.

**Change:** derive from the boxes involved, with bounds. Done for placement and
layout spacing; `navigationGhostReasons`' `FONT_SIZE < 12`, the `BASE = 60`
crosshair band and `RESIZE_REFLOW_GAP = 16` are the same shape of mistake
waiting to happen.

**Test:** `placement-invariants.spec.ts` runs a matrix of anchor sizes against
both identities' default new-node sizes and asserts no overlap, a sane gap band,
and that above is tighter than beside.

### 2.6 Global intercepts need a mode guard

The `!visible && key === toggleVisibility` intercept ran ahead of every binding
and made `z` untypeable while the menu was hidden.

**Change:** every early return in `handleKeyDown` states which modes it applies
to. Several already do; the pattern should be uniform, and a comment saying
*why* the guard is safe in text-entry modes.

### 2.7 Break up `drawing-area.component.ts`

**8,518 lines**, 124 command cases, and every fix this week landed in it. The
extracted modules — `graph-layout.ts`, `gather-fisheye.ts`,
`grow-ghost-targets.ts`, `edge-node-overlap-resolution.ts` — are exactly the
files that were easy to test and cheap to change, because they are pure.

**Change, in order of payoff:**
1. `overlays.ts` — hover trace, landing ghost, grow ghost, node grid. Pure
   functions from (node box, viewport, palette) to shapes.
2. `label-edit.ts` — caret model, wrapped-line ranges, vim motions. Already
   nearly pure (`lineRangesFromWrapped`, `innerWordRange` are separate); the
   caret geometry should join them and stop reaching into `_nodeWidth`.
3. `grow-mode.ts` — the held-Add state machine, ~600 lines with its own
   vocabulary.

Each extraction is a mechanical move plus a spec file, and each one removes a
few hundred lines from the file everything touches.

### 2.8 Close the type escapes

`keymenu.component.ts` has **60** `as any` casts, nearly all
`(config as any)['Shift']` because `SubmenuConfig` is keyed by `KeyString` and
the modifier keys are not in it. Widen the key type; the casts disappear and
with them the ability to bind a key that does not exist.

---

## 3. Interface changes that prevent bugs

### 3.1 No keystroke should be silent

The one genuinely good pattern in the codebase is `SET_TASK_STATUS` on a plain
graph: it emits *"⚠ Status needs a Todo Graph"* instead of doing nothing. Most
other preconditions fail silently — copy with nothing under the crosshairs, a
layout on an empty selection, a style applied with no target. A silent no-op is
indistinguishable from a bug, which is exactly how da-537 was reported.

**Rule:** every command handler that can decline states why, once, in the status
line. A test can enumerate handlers and assert each declines audibly.

### 3.2 Show the modes you can be in

The mode chip (da-432) already pays for itself. Two gaps remain: an intercepted
chord is invisible unless its card lists it (fixed for Shift, still true for
Ctrl+O/Ctrl+I jumplist), and a *suspended* keymenu (grow, nav popup) looks like
normal mode with different cards.

### 3.3 Say what a destructive action did

Applying a layout silently drops every unpinned waypoint. That is right, but it
should say so — *"Layout applied — 14 manual waypoints dropped, 4 cross-links
routed"* — because the alternative is what happened this week: crossings that
looked like a layout bug and were stale routing.

### 3.4 Undo granularity should match intent

Adding a node and typing its label is two undos: the text, then the node. It
should be one, or the status line should say what the next undo will do.

### 3.5 Make the draft mirror live

`saveGraphToStorage()` runs only on `beforeunload`, so every analysis of Ben's
graph is as old as his last tab reload. This has cost real work twice this week
(a graph read at 16:28 that had already changed, and a "three crossings" report
against a layout two commits old). Debounced save on mutation, as the todo says.

---

## 4. Infrastructure

1. **Nothing runs the tests.** No CI workflow, no pre-push hook. 454 unit tests
   and 50 repro scripts exist and are run by hand, when someone remembers.
2. **`CHROME_BIN` is unset**, so `npx ng test` fails out of the box — a papercut
   that has been in `dev-status.md` for two days. One line in `package.json`.
3. **The box is memory-starved**: karma disconnects mid-suite with `ng serve`
   running (it failed to capture Chrome twice while writing this file). Either
   more RAM, or a `test` script that does not compete with the dev server.
4. **Repro scripts have no baseline** — see `repro-health.mjs` below.

---

## 5. Running these

The four specs live in `src/claude-proposed-tests/` — inside `src/` because
that is where Angular's karma builder looks; the node scripts and this document
stay here at the root. No build config was touched.

```
CHROME_BIN=~/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
  npx ng test --watch=false --browsers=ChromeHeadless \
  --include='src/claude-proposed-tests/**/*.spec.ts'
```

**64 of 64 green** as of 2026-08-30, after the findings below were either fixed
or explicitly accepted in the specs.

| File | What it pins | Status |
| :--- | :--- | :--- |
| `src/claude-proposed-tests/keymap-invariants.spec.ts` | chord ergonomics, duplicate keys, undrawn bindings, ellipsis labels — both profiles, every submenu | green (2 findings fixed, 6 accepted) |
| `src/claude-proposed-tests/caret-geometry.spec.ts` | caret sits where the text is painted, across shapes and overflow modes | green |
| `src/claude-proposed-tests/overlay-freshness.spec.ts` | dashed trace follows its node through moves and resizes, and matches its shape | green |
| `src/claude-proposed-tests/placement-invariants.spec.ts` | a placed node never lands on its anchor; gap stays in band; above is tighter than beside | green |
| `check-command-wiring.mjs` | every menu command has a handler; nothing stranded | passing — 1 stranded command found |
| `repro-health.mjs` | the 50 repro scripts, against a baseline | working; baseline seeded with 7 |

### What they found on main today

| Finding | Where | Disposition |
| :--- | :--- | :--- |
| `g` + `r` is the **same finger** — hold Move-by-node, press "quadrant rings" with the same index | vim profile, `moveByNode.strategy` | **fixed**: moved to `u` |
| `e` + `d`/`c`/`x`/`s`/`w` — the Add hub chorded with middle and ring | ijkl profile | accepted in the spec, with the reason; re-keying that hub is Ben's call |
| `Ctrl-[` is bound but never drawn | Ctrl submenu | accepted: vim muscle memory, `[` is deliberately off the card |
| `OPEN_INSERT_SUBMENU` declared, never sent, never handled | `command.model.ts` | reported, not touched |
| Caret vs Konva line width disagree by ~1.3px on an unbreakable word | `da-node.ts` | tolerance set to 2px, noted in the spec |

If one of these specs fails later, read it as a finding first: they encode
contracts the code is supposed to hold, and every one of them is a bug Ben has
already reported once in some other form.

```
node claude-proposed-tests/check-command-wiring.mjs
node claude-proposed-tests/repro-health.mjs --update    # first time, all 50
node claude-proposed-tests/repro-health.mjs             # thereafter
```

Baseline today (7 of 50 seeded): `repro-grow-mode` 17 failures,
`repro-label-edit-flow` 2, `repro-tree-crossings` 1 (deliberate — it asserts the
crossing-free fan we do not yet draw). The rest pass.

---

## 6. If you only do three things

1. **`repro-health.mjs --update` and wire it to a hook.** It costs one command
   and turns 50 pieces of rotting evidence into one signal.
2. **`keymap-invariants.spec.ts`.** The menu is the product's surface and its
   contracts are currently only in Ben's hands.
3. **Extract `overlays.ts` and `label-edit.ts`.** Two of this week's three
   worst bugs lived in geometry that a pure module would have made obvious —
   and both are testable without a browser, which this box badly needs.
