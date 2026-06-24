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

This complements the **key-path** notation in
[`architecture-keymenu-model.md`](architecture-keymenu-model.md): a key path
`[f, d, s]` describes a *held configuration* (a submenu address). This note
describes the *event stream* that produces and unwinds such configurations,
including releases and taps that a key path can't express.

## Atoms

Time flows **left → right**. Each atom is one physical event from the OS.

| Atom  | Meaning                          |
| :---- | :------------------------------- |
| `↓K`  | `K` pressed (physical `keyDown`) |
| `↑K`  | `K` released (physical `keyUp`)  |

The **held set** at any point in a sequence is exactly the keys with a `↓` and
no later `↑`. That's the whole model — everything below is shorthand over these
two atoms.

```
↓f ↓d ↑d ↑f          held set goes: {f} → {f,d} → {f} → {}
```

## Shorthand

| Form   | Expands to        | Meaning                                                  |
| :----- | :---------------- | :------------------------------------------------------- |
| `K!`   | `↓K ↑K`           | a **tap** — down then up with nothing between            |
| `[K]`  | `↓K`, never released in this scenario | `K` is **held through** to the end (emphasis) |
| `A∥B`  | `↓A ↓B` **or** `↓B ↓A` | both **held, arrival order unspecified** — use to claim both orders must behave identically |
| `⟨…⟩`  | —                 | inline annotation of the held set, e.g. `⟨held: f,d⟩`    |

`∥` is the key tool for the chord bugs: writing `A∥B` is a *claim that order
must not matter*. A bug is "`A∥B` is specified but the two expansions diverge."

## Bridge to key paths

A key path `[a, b, c]` corresponds to the prefix `↓a ↓b ↓c` with all three
still held (`⟨held: a,b,c⟩`). The keymenu invariants restate cleanly as
predicates over event streams:

- **I2 (fresh press / stale key).** `↓K` fires `K`'s action only if `K` was not
  in the held set immediately before, *and* `K` is bound in the active submenu
  at that instant. In `↓f ↓i ↓f'`… the second `f` reference is stale.
- **I1d (key-path release).** On `↑K` where `K` is in the active key path, the
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
working:  ↓m ↓x ↑x ↑m      repeater for m stops at ↑m            ✓
broken:   ↓m ↓x ↑m ↑x      repeater should stop at ↑m, keeps firing  ✗
```

The invariant to enforce: the `m` repeater dies on `↑m` **regardless of the
held state of any other key**. The bug is that keyup bookkeeping assumes `m`
is released last.

**Bug B — chord into submenu is order-sensitive.**

```
spec:     left∥fine        both held ⇒ fine submenu active + "move left"
                           i.e. ↓fine ↓left and ↓left ↓fine must be equivalent
today:    only one expansion reaches the submenu                       ✗
```

Both bugs share a root cause: **order-dependent chord resolution**. The fix
target is that the held *set* (not the held *sequence*) determines repeater
liveness and submenu reachability, except where I1d/I2 deliberately make order
significant (key-path prefixes and stale-press suppression).

## Conventions

- Prefer explicit `↓`/`↑` when ordering is the point; use `K!`, `[K]`, `∥` only
  as readability sugar.
- When a scenario's outcome depends on the held set at a specific instant,
  annotate it: `↓f ↓d ⟨held: f,d⟩ ↑f`.
- This notation is descriptive, not a parser format — keep it human-readable.

## See also

- [`architecture-keymenu-model.md`](architecture-keymenu-model.md) — the state
  machine these events drive (definitions, transitions, invariants I1–I3).
- [`valid-key-combos.md`](valid-key-combos.md) — the chord catalog; its
  "first key held + second tapped" entries are `↓A B!` in this notation.
- `dev-status.md` → Known bugs → key-handling — the two bugs above.
</content>
</invoke>
