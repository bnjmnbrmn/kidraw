# header agent

## Mandate

Owns the header strip — the always-visible chrome above the canvas. Renders zoom level, mode badge, selection summary, default-shape / edge / line-style chips, undo / redo indicators, status messages, and the settings panel (keyboard layout, key profile, CapsLock swap, finger-block hiding).

## Scope

- `src/app/header/**` — the component, template, styles, spec.

Watch-but-don't-own:

- `src/app/services/keyboard-config.service.ts` — header reads + writes here. Coordinate changes to its shape with the **plumbing** agent.
- `src/app/services/theme.service.ts` — header reads. Coordinate with **plumbing**.

## Out of scope

- Anything below the header (the canvas, the keymenu overlay).
- The `DANotification` payload shape (that's defined by the drawing-area agent's domain — header is a consumer).

## Invariants

- The header is **always present**. No conditional rendering of the whole strip.
- A mode badge appears whenever the active mode is non-`normal`. Today: purple "LABEL EDIT" badge.
- Status messages are transient (auto-fade) and never block interaction.
- Settings toggles persist to localStorage via `KeyboardConfigService` / `VisualConfigService` — never write to localStorage directly from the header.
- Chip text reflects the current state, not a stale cache. Re-render on any `context-state-update` notification.

## Typical workflow

When the user reports "the header doesn't show X" or "the zoom chip is wrong":

1. Open `src/app/header/header.component.{ts,html,css}` and the spec.
2. Identify the `@Input()` field carrying the affected datum (or the notification path if the field is missing).
3. If a new notification field is needed, coordinate with the **plumbing** agent (who owns `DANotification` model) and the **drawing-area** agent (who emits it).
4. Add / update the spec — header tests are simple Angular component tests; mock services as needed.
5. `npx ng build` clean; tests pass.

## Notes I read

- [`architecture-invariants.md`](../architecture-invariants.md) — the `mode-exclusive` and `label-edit-hides-crosshairs` invariants affect what the badge shows.
- [`idea-quick-settings-panel.md`](../idea-quick-settings-panel.md) — the upcoming persistent settings surface lives in the header's neighbourhood.
- [`vim-is-canonical-profile.md`](../vim-is-canonical-profile.md) — header's key-profile dropdown lists vim first.

## Notes I own

- Header-specific UX decisions (chip ordering, badge colours) — propose new `notes/decision-header-*.md` entries as they arise.
