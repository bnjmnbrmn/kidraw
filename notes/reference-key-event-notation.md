---
title: Key-event notation — held chords, taps, release order
type: reference
---

# Key-event notation — held chords, taps, release order

A small notation for writing down *physical key-event sequences* precisely:
what is pressed, what is held, what is released, and **in what order**. We
need this because the keymenu's hard cases are all about ordering — and prose
like "first key held + second key tapped" or bare `[left][fine]` is ambiguous
about what is still held vs. already released.

> **Status: draft, actively evolving.** The atoms below are settled; several
> extensions are still open — see [Open questions](#open-questions) at the end.

This complements the **key-path** notation in
[`architecture-keymenu-model.md`](architecture-keymenu-model.md): a key path
`[f, d, s]` describes a *held configuration* (a submenu address). This note
describes the *event stream* that produces and unwinds such configurations,
including releases and taps that a key path can't express.

## Atoms

Time flows **left → right**. Each atom is one physical event from the OS.
The prefixes are chosen to be typeable on any keyboard (no `↓`/`↑`):

| Atom  | Meaning                          |
| :---- | :------------------------------- |
| `\K`  | `K` pressed (physical `keyDown`)  |
| `/K`  | `K` released (physical `keyUp`)   |

Mnemonic: `\` goes *down*, `/` comes *up*.

The **held set** at any point in a sequence is exactly the keys with a `\` and
no later `/`. That's the whole model — everything below is shorthand over these
two atoms.

```
\f \d /d /f          held set goes: {f} → {f,d} → {f} → {}
```

## Shorthand

| Form   | Expands to        | Meaning                                                  |
| :----- | :---------------- | :------------------------------------------------------- |
| `K!`   | `\K /K`           | a **tap** — down then up with nothing between            |
| `[K]`  | `\K`, never released in this scenario | `K` is **held through** to the end (emphasis) |
| `⟨…⟩`  | —                 | inline annotation of the held set, e.g. `⟨held: f,d⟩`    |

## Bridge to key paths

A key path `[a, b, c]` corresponds to the prefix `\a \b \c` with all three
still held (`⟨held: a,b,c⟩`). The keymenu invariants restate cleanly as
predicates over event streams:

- **I2 (fresh press / stale key).** `\K` fires `K`'s action only if `K` was not
  in the held set immediately before, *and* `K` is bound in the active submenu
  at that instant.
- **I1d (key-path release).** On `/K` where `K` is in the active key path, the
  new path is the prefix up to (not including) `K`; later-held keys are dropped
  even though still in the held set.
- **I3 (repeater lifetime).** A repeater for `K` runs only while `K` was
  fresh-pressed *and* its owning submenu is still in the stack; it must stop the
  instant either fails.

## Worked cases — the two open bugs

Let `m` = a movement/repeat key (has a repeater), `x` = any second key,
`left` = a movement key, `fine` = a coarse/fine submenu trigger.

**Bug A — repeat fails to turn off on out-of-order release.**

```
working:  \m \x /x /m      repeater for m stops at /m            ✓
broken:   \m \x /m /x      repeater should stop at /m, keeps firing  ✗
```

The invariant to enforce: the `m` repeater dies on `/m` **regardless of the
held state of any other key**. The bug is that keyup bookkeeping assumes `m`
is released last.

**Bug B — chord into submenu is order-sensitive.**

```
order 1:  \fine \left      enters fine submenu, "move left" ?
order 2:  \left \fine      enters fine submenu, "move left" ?
```

We want *at least one* of these to reach the fine-movement state, and the bug
is that today neither (or only one) does. **But whether both orders should be
equivalent is exactly the open question below** — see Open questions, "order
generally matters." Don't assume `\left \fine` ≡ `\fine \left` yet.

## Open questions

The list of things still to design. **Order matters by design** in the
keymenu — the whole model is built on held *sequences*, not held *sets* — so
none of these should casually erase ordering.

1. **The `A∥B` "order-irrelevant" idea is suspect.** An earlier draft proposed
   `A∥B` to mean "both held, arrival order unspecified, must behave
   identically." That cuts against the keymenu's foundation, where order is
   meaningful. Bug B may be a *narrow special case* where two specific keys
   should commute (e.g. a movement key and a coarse/fine modifier), not a
   general primitive. Decide: is order-insensitivity a per-binding property of
   certain key pairs, or never a primitive at all? Until resolved, **do not use
   `∥`** — write both orders out explicitly (`\a \b` vs `\b \a`).

2. **Escape sequences.** `\ / ! [ ] ⟨ ⟩` are now metacharacters, but real keys
   include `\`, `/`, `!`, brackets, etc. Need an escaping mechanism. Tension:
   `\` is both the down-prefix *and* the obvious escape char — resolve that
   collision (candidate: a quoting form like `` `\` `` or `key(\)`).

3. **Sequences of submenu / action names.** A way to write the *named* path
   being traversed (submenu names, action names), not just raw physical keys —
   so a scenario can say "Insert → Box → down-direction" symbolically and stay
   readable when key assignments change between profiles.

4. **Hierarchies of menus and bindings.** A convenient notation for declaring
   the menu tree itself — submenus, their key paths, and each key's
   action/submenu bindings — so we can sketch and review a profile's structure
   compactly (adjacent to, but distinct from, `key-assignments.ts`).

## Conventions

- Prefer explicit `\`/`/` when ordering is the point; use `K!`, `[K]` only as
  readability sugar.
- When an outcome depends on the held set at a specific instant, annotate it:
  `\f \d ⟨held: f,d⟩ /f`.
- This notation is descriptive, not a parser format — keep it human-readable.

## See also

- [`architecture-keymenu-model.md`](architecture-keymenu-model.md) — the state
  machine these events drive (definitions, transitions, invariants I1–I3).
- [`valid-key-combos.md`](valid-key-combos.md) — the chord catalog; its
  "first key held + second tapped" entries are `\A B!` in this notation.
- `dev-status.md` → Known bugs → key-handling — the two bugs above.
</content>
