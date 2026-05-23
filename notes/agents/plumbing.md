# plumbing agent

## Mandate

Owns the wiring between the three visible areas and the cross-cutting services. The shell component, the RxJS subjects that carry commands and notifications, and the shared services that everyone reads.

## Scope

- `src/app/app.component.{ts,html,css}` and its spec.
- `src/app/services/**`:
  - `debug-log.service.ts` — `DebugLogService` POSTs to `tools/log-server.js`.
  - `theme.service.ts` — theme state + observable.
  - `visual-config.service.ts` — palette / cursor config.
  - `keyboard-config.service.ts` — layout, key profile, CapsLock swap, finger-block hiding.
  - `demo-data.service.ts` — sample graph loader.
- The shapes of `DACommand` and `DANotification` are co-owned with **drawing-area** (they define commands) and the agents that consume them (header, keymenu); plumbing owns the *wiring* — how they flow.

## Out of scope

- The contents of `DACommand` / `DANotification` types (regions add their own cases).
- Any one component's rendering — header, keymenu, drawing-area each own theirs.
- File-format serialization — owned by **serialization**.

## Invariants

- **One `Subject<DACommand>`** in `AppComponent.commandsSubject`. All commands flow through here.
- **Notifications go up via `(daOut)`**, and `AppComponent` calls keymenu methods directly for mode switches — the asymmetry is intentional. Don't reverse it.
- **Shared services are injected, not instantiated.** Anyone needing the theme / debug log / config injects via Angular DI.
- **Default localStorage value for `KeyProfile` is `'vim'`.** Legacy `'default'` migrates to `'ijkl'` transparently. See [`vim-is-canonical-profile`](../vim-is-canonical-profile.md).

## Typical workflows

### Adding a new `DANotification` kind

1. Extend `DANotification` union in `src/app/drawing-area/da-notification.model.ts` (technically lives in drawing-area, but plumbing routes it).
2. Add a `case` in `AppComponent.handleDANotification` to route it to the right destination (header field, keymenu method, etc.).
3. The emitter (drawing-area) wires the event; the receiver (header / keymenu) consumes it.

### Adding a new shared service

1. Decide if it really needs to be a service (vs a per-component field). Services should be for state shared *across* the three visible areas, or for browser side effects (localStorage, network, file IO).
2. Provide in root (`providedIn: 'root'`); avoid module-level providers.
3. Expose changes as an RxJS observable (`*Changed$`) rather than letting consumers poll.

### CapsLock-swap or keyboard-layout change

These flow through `KeyboardConfigService.configChanged$`. Subscribers (currently just `keymenu.component.ts`) rebuild on emission. Don't add a new "rebuild" trigger — extend `configChanged$` if needed.

## Notes I read

- [`architecture-key-profiles.md`](../architecture-key-profiles.md) and [`vim-is-canonical-profile.md`](../vim-is-canonical-profile.md) — the key-profile contract.
- [`architecture-invariants.md`](../architecture-invariants.md) — the global invariants the wiring must preserve.

## Notes I own

- `notes/decision-plumbing-*.md` if a non-obvious wiring choice needs justification.
