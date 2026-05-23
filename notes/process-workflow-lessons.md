---
title: Workflow lessons (process notes)
type: process
---

# Workflow lessons

Distilled retrospective rules from past sessions. Useful for the coordinator agent and for self-discipline.

## What works

- **Incremental build verification.** Run `npx ng build` after each significant change; catches type errors early before they pile up.
- **Bug-driven iteration.** Phase the work, fix bugs as they appear. Many bugs are interaction-specific and wouldn't be caught by unit tests anyway.
- **Plan documents with phases.** Make progress trackable and resumable across sessions. See `docs/serialization-plan.md` as the canonical example.

## What to be careful about

- **Write a state-machine test before implementing an animation / mode transition.** The ghost-card and x-drift bugs were tween-lifecycle issues; the tests don't need Konva — just verify `push → pop → push` leaves the stack clean.
- **Small commits.** Don't accumulate a large batch across 20+ files without committing — rollback gets painful. Commit after each working milestone.
- **Visual regression snapshots.** Many bugs were visual (cards behind parents, ghost cards, colour mismatches). A screenshot workflow — even manual screenshots in `tools/screenshots/` with notes — would catch regressions earlier.
- **Try the UI during implementation.** Some bugs (z-ordering, ghost cards) were visible on first interaction. Quick manual test after each phase saves re-work.
- **Design palettes upfront.** Themes that grow organically end up with adjustment passes. Designing the typed interface with placeholder values up-front avoids "toned-down green" rounds.

## Suggested phase ordering for new features

1. Design data-model changes first (types, interfaces, state shape).
2. Write skeleton tests for new state transitions.
3. Implement in small buildable increments; commit after each.
4. Manual visual check after any rendering change.
5. Theme / style pass as a deliberate last step (not interleaved).
