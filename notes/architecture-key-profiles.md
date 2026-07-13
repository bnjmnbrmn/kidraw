---
title: Key-assignment profiles
type: architecture
---

# Key-assignment profiles

A **profile** is one full instantiation of the `KeymenuKeyAssignments` interface (`src/app/keymenu/config/key-assignments.ts`) — a mapping from semantic actions ("move left", "open insert submenu", "delete") to physical keys. Profiles are intentionally non-stable and swappable so we can iterate on ergonomic theories.

Both profiles satisfy the interface contract; switching is a single export change plus a localStorage value.

## Shipping profiles

| Profile | Movement | Insert | Edit | Graph nav | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `vim` | `h j k l` | `a` | `i` | `f` | Default. See [vim-is-canonical-profile](vim-is-canonical-profile.md). |
| `ijkl` | `i j k l` | `a` | `e` | `f` | The original right-hand-dominant layout. Selectable from the header dropdown. |

Both currently use `v` for Select+Drag, `x` for Delete, `p`/`y` for zoom out/in.
Insert moved `f`→`a` and Move-by-graph `g`→`f` in the 2026-07-13 reorg
([plan-keymenu-binding-reorg](plan-keymenu-binding-reorg.md)).

## Why two profiles at all

It documents that **the design supports profile multiplicity** — the code paths that build the keymenu must not assume a particular set of bindings. If we ever collapse to a single profile, the interface stays; the contract is what matters.

## Tradeoff: cardinal-only vs diagonal movement

The shipping profiles use one key per cardinal direction (hjkl / ijkl). That's clean and vim-familiar, but diagonal movement requires two simultaneous keypresses, which is awkward. See [idea-diagonal-movement-profile](idea-diagonal-movement-profile.md) for a possible third profile with a 2×2 / diagonal-cluster layout.

A future left-hand-dominant profile is sketched in [idea-left-hand-profile](idea-left-hand-profile.md).

## Open questions

- Zoom key assignments are still being tuned per profile.
- Whether a context-sensitive single Edit/Insert key (instead of two separate submenu triggers) reduces or increases cognitive load.
- ~~When the user is holding the insert submenu key, the movement keys are on the *same* hand as the held trigger — finger conflicts arise.~~ Largely resolved by the 2026-07-13 reorg: Insert is `a` (left hand) in both profiles while movement is right-hand, so the held trigger and the directional follow-ups no longer collide. The insert submenu's *shape/edge* child keys (`d`/`s` in vim) are still left-hand chords with the held `a`; watch for discomfort in dogfooding.
