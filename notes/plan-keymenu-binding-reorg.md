---
title: Keymenu binding reorg — f for graph nav, File menu cleanup
type: plan
status: implemented (2026-07-13) — decisions below
---

# Keymenu binding reorg

Triggered by the move-by-graph rework (see `dev-status.md` → "Move by graph…
rework"): graph traversal is becoming a primary interaction flow, but it sits
on `g` while `f` — the best left-index held-key position — is spent on the
Insert submenu. At the same time the `m` (Misc) submenu has accreted three
generations of file I/O, two of which are obsolete since the vault landed
([decision-vault-model](decision-vault-model.md)).

## Current inventory (root level, vim profile)

| Key | Binding | Kind |
| :-- | :-- | :-- |
| `h j k l` | Move crosshairs | held-repeat |
| `s` / `d` | Coarse / Fine move modifier | hold-submenu |
| `i` | Edit/Insert (context-sensitive) | tap + hold-submenu |
| `f` | Insert… | hold-submenu |
| `v` | Select+Drag… | hold-action-submenu |
| `w` | Style… | submenu |
| `b` | Layout… | submenu |
| `r` | Pan/Zoom… | submenu |
| `t` | Move by node… | hold-submenu |
| `g` | Move by graph… | hold-submenu |
| `m` | Misc… | submenu |
| `x` | Delete | action |
| `c` | Clear Selection | action |
| `u` | Undo | action |
| `/` `n` `p` | Search / Next / Prev match | actions |
| `Ctrl` | More Ctrl (z undo, r redo, [ escape) | submenu |
| `CapsLock` | NORMAL mode | mode switch |

**Free at root (vim):** `a e o q y z ;` and most punctuation. (ijkl profile
differs in movement/edit keys but has the same submenu skeleton.)

Current `m` (Misc…) contents: `r` Reload, `s` Save Graph *(localStorage)*,
`l` Load Graph *(localStorage)*, `g` New Graph, `f` Open File…, `a` Save As…,
`z` Export Zip…, `d` Cycle Display, `t` Todo Graph, `v` Vault: Connect…,
`o` Vault: Open…, `w` Vault: Save As…, `p` Toggle key profile.

## Findings

1. **`m` mixes three file-I/O generations.** Gen-1 manual localStorage
   Save/Load Graph (`m→s` / `m→l`) is fully obsolete: the v2 draft
   auto-saves on every mutation and vault files auto-save debounced. Gen-2
   picker/blob Open File / Save As (`m→f` / `m→a`) survives only as the
   non-Chromium fallback and as import/export of files *outside* the vault.
   Gen-3 vault flows (`m→v/o/w`) are the primary path but carry awkward
   keys (`w` for Save As) because the mnemonic keys were already taken by
   the obsolete generations.
2. **Graph nav deserves `f`.** The rework makes hold-`g` + right-hand
   traversal the workhorse navigation. `f` is the strongest left-index hold
   position, and the open tier-question (Q3: coarse/fine while the submenu
   is held) resolves more comfortably from `f` — `f`+`s`/`f`+`d` are natural
   same-hand chords; `g`+`s`/`g`+`d` are a stretch.
3. **Insert is less load-bearing than it was.** Context-sensitive `i`
   already covers insert-node / add-label / add-waypoint in the common
   cases. `f`'s unique value is the shape-picker inserts (Circle/Diamond/
   Junction/Invisible) and the directed-edge flow — worth a good key, but
   not the best key.
4. **Dead config:** `biggest`/`smallest` in `moveSpeed`, `dragSpeed`, and
   `panZoom.speed` are declared in `KeymenuKeyAssignments` and populated in
   both profiles but never referenced by any submenu builder.
5. **Layout submenu (`b`) is half dev-tool.** Six node layouts plus four
   router entries; the router picker exists to compare BF-WC/Desiderata/
   IDv2/IDv3 during the routing workstream. Once a winner is declared, this
   should collapse to one Route action (or a `Route…` sub-submenu).
6. **dev-status drift:** the rework spec says vim `j`/`k` are unbound in the
   move-by-graph submenu; in code they are bound to Forwards
   (`FOLLOW_SELECTED_EDGE`) / Backwards (`NAVIGATE_BACK`). The rework
   repurposes them as Next/Previous Edge regardless.

## Proposal

### A. Swap `f` and `g` (both profiles)

- `f` → **Move by graph…** (consider relabeling "Follow…" — mnemonic for f).
  Becomes a `LabeledActionSubmenuConfig` per the rework spec (fires
  `FOCUS_SELECTED_FOR_GRAPH_NAV` on entry).
- `g` → **Insert…** unchanged in content. Hold-`g` + `d`/`s`/`a` left-hand
  follow-ups keep the same hand pattern as today's `f`.

Rejected alternatives: Insert on `a` ("add" mnemonic, but pinky-hold plus
`d`/`s` follow-ups crowds the left hand); Insert on `o` (vim "open line"
mnemonic, but right-hand hold conflicts with right-hand directional
follow-ups).

### B. `m` becomes **File…** (both profiles)

Remove Save Graph / Load Graph (and, if nothing else uses them, the
`SAVE_GRAPH` / `LOAD_GRAPH` commands + drawing-area handlers). Rebind with
mnemonics now that the letters are free:

| Key | Entry | Today |
| :-- | :-- | :-- |
| `n` | New Graph | `g` |
| `o` | Open… (vault) | `o` |
| `s` | Save As… (vault) | `w` |
| `v` | Vault: Connect… | `v` |
| `i` | Import File… (picker; non-vault/fallback) | `f` "Open File…" |
| `e` | Export File… (blob download) | `a` "Save As…" |
| `z` | Export Zip… | `z` |
| `d` | Cycle Display | `d` |
| `t` | Todo Graph (type binding) | `t` |
| `p` | Toggle key profile | `p` |
| `r` | Reload Page | `r` |

The Import/Export relabel makes the vault flows read as *the* Open/Save and
the legacy picker/blob flows read as explicit interop. `t` (type binding)
will likely outgrow this menu when extensions add more diagram types — a
future `Type…` submenu; not part of this change.

### C. Drop dead speed-key config

Remove `biggest`/`smallest` from `SpeedModifierKeys` (or rename the
interface to the two-member reality). Pure cleanup; no behavior change.

### D. Deferred / follow-ups

- Collapse the Layout submenu's four router entries after the routing
  workstream declares a winner.
- Add `nextEdge` / `prevEdge` to the `moveByGraph` block (both profiles) as
  part of the rework itself.
- Revisit `c` Clear Selection if/when [idea-cut-copy-paste](idea-cut-copy-paste.md)
  wants `c`.

## Decisions (Ben, 2026-07-13) + what shipped

1. **Insert → `a`** ("add"), not the recommended `f`↔`g` swap — `g` is now
   unbound at root in both profiles. Knock-ons: vim's insert-submenu Label
   key moved `a`→`f` (the held key can't be its own child), and ijkl's
   fine-move modifier moved `a`→`s` (root `a` was taken there).
2. **Full File… restructure** as tabled above; the root `m` submenu is
   labeled "File...". Vault entries are labeled plain "Open…"/"Save As…";
   picker/blob flows are "Import File…"/"Export File…".
3. Label stays **"Move by graph…"** (rename wasn't chosen).

Also shipped: `SAVE_GRAPH`/`LOAD_GRAPH` commands, handlers, and the dead
`loadGraphFromStorage()` removed (`saveGraphToStorage()` stays — it's the
`beforeunload` draft writer); `biggest`/`smallest` dropped from
`SpeedModifierKeys`. Verified by `tools/repro-binding-reorg.js` (15 checks)
plus the existing repro suites and 235/235 unit tests.
