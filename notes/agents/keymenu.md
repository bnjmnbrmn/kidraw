# keymenu agent

## Mandate

Owns the keymenu — both the visual keyboard overlay and the state machine that maps physical keys to `DACommand` emissions. Includes key assignments (the two profiles), submenu structure, the active-submenu / key-path model, fresh-press / stale-key rules, and the keymenu Konva rendering.

## Scope

- `src/app/keymenu/**` — `keymenu.component.{ts,html,css}`, the spec, `config/key-assignments.ts`.
- `src/app/lib/keymenu/**` — the reusable library: `KeyMenu`, `USQwertyMode`, `KMSubmenu`, `KMKey` hierarchy, layouts (`us-qwerty/**`), key models.

## Out of scope

- What a command *does* once it reaches the drawing area. The keymenu only emits the command; **drawing-area** handles it.
- Header chips that reflect the keymenu's state (mode badge, etc.) — owned by **header**.
- Settings persistence (`KeyboardConfigService`) — owned by **plumbing**.

## Invariants

- **No hardcoded key literals in action logic.** Always reference `this.keyAssignments.*`. This is invariant #9 in [`architecture-invariants`](../architecture-invariants.md) and the most common rule to violate.
- **Vim is the canonical profile.** Default + the one the user wants tuned. Never reintroduce the name `default`. See [`vim-is-canonical-profile`](../vim-is-canonical-profile.md).
- **Keymenu state-machine invariants I1–I3** ([`architecture-keymenu-model`](../architecture-keymenu-model.md)) — every submenu has exactly one key path; fresh-press only; stale keys ignored; repeater stops when its submenu leaves the stack.
- **Chord ergonomics.** When picking a new key binding inside a held-submenu, consider which finger holds the trigger. Don't pick a same-finger child (e.g. `f → g` is unusable on vim because `f` is the held trigger and `g` is the same index finger). See [`valid-key-combos`](../valid-key-combos.md) and the relevant `idea-keymenu-*` notes.

## Typical workflows

### Changing or adding a key binding

1. Edit `VIM_KEYMENU_KEY_ASSIGNMENTS` in `src/app/keymenu/config/key-assignments.ts`. Touch `IJKL_KEYMENU_KEY_ASSIGNMENTS` only if explicitly asked.
2. Update the spec — keymenu specs assert specific key-to-label mappings; they will break otherwise.
3. Run `npx ng test --watch=false --browsers=ChromeHeadless` and verify.

### Adding a new submenu or command

1. Add the action to `KeymenuKeyAssignments` interface (new field).
2. Add the key to both profiles (vim first; ijkl if non-trivial).
3. Wire the action in `keymenu.component.ts` — usually a new entry in one of the `build*SubmenuConfig` methods emitting a `DACommand`.
4. Coordinate with **drawing-area** on the new command's handling.

### Visual / rendering tweak to the keymenu overlay

1. Edit `keymenu.component.{ts,html,css}` — Konva-based rendering inside the component.
2. Visual regression via the screenshot tool (`node tools/playwright-screenshot.js --name <case> --keys "<seq>"`) before / after.

## Notes I read

- [`architecture-key-profiles.md`](../architecture-key-profiles.md), [`architecture-keymenu-model.md`](../architecture-keymenu-model.md), [`architecture-mode-hierarchy.md`](../architecture-mode-hierarchy.md).
- [`vim-is-canonical-profile.md`](../vim-is-canonical-profile.md).
- [`valid-key-combos.md`](../valid-key-combos.md) when choosing chord assignments.
- [`idea-keymenu-visual-polish.md`](../idea-keymenu-visual-polish.md), [`idea-keymenu-discoverability.md`](../idea-keymenu-discoverability.md), [`idea-keymenu-class-hierarchy.md`](../idea-keymenu-class-hierarchy.md), [`idea-keymenu-as-library.md`](../idea-keymenu-as-library.md) — the keymenu backlog.

## Notes I own

- Any new keymenu decisions (`notes/decision-*.md` if cross-session-stable).
- Updates to [`valid-key-combos.md`](../valid-key-combos.md) as we test more chords.
