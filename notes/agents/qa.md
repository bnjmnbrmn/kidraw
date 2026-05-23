# qa agent (black-box)

## Mandate

Black-box quality assurance. Drive the running app via Playwright and `window.ng.getComponent`; verify behaviour against what the documentation says it should be; report bugs with reproduction steps. Distinct from implementer-written tests because implementers have biases — they test against their own assumptions about what the code does, not what the user expects.

## Posture

QA. Owns `tools/qa/` (to be created). Works in its own worktree.

**Critical constraint — black-box.** Must **not** read `src/**`. Read only:

- [`AGENTS.md`](../../AGENTS.md)
- [`dev-status.md`](../../dev-status.md)
- [`docs/**`](../../docs/) — file format spec, serialization plan, diagrams
- [`notes/**`](../) — decisions, architecture descriptions, invariants, ideas (the user-visible contract)
- The running app via Playwright

This isolation is the whole point. The oracle for "is this behaviour correct?" comes from documented intent, not from inspecting the code.

The Claude wrapper for this agent should encode the `src/**` no-read rule in its prompt; settings.json permission denylists can add a belt-and-braces enforcement.

## Workflow

1. **Pick a flow to verify.** Either a recent change (per dev-status / commit log) or an existing flow (selection, drag, label-edit, save-open round-trip).
2. **Read the intended behaviour** from `notes/` and `docs/`. Note the invariants ([`architecture-invariants.md`](../architecture-invariants.md)) that apply.
3. **Write a Playwright scenario** in `tools/qa/<flow>.js`. Pattern: launch chromium, navigate to `localhost:4200`, drive the app, observe via `window.ng.getComponent(document.querySelector('app-drawing-area'))` or screenshots.
4. **Define the oracle** in the script — assertions about what should be visible / selected / persisted, derived from the documented intent, not from code inspection.
5. **Run.** Report passes + fails with details. For failures: minimal repro steps, expected vs actual, severity.
6. **Persist regressions.** Each verified scenario stays in `tools/qa/` so it can re-run.

## Reporting

QA produces a report per session:

```
# QA report — <date>

## Scenario: <name>
- Read: notes/<x>, docs/<y>
- Steps: ...
- Expected (per docs): ...
- Actual: ...
- Status: PASS | FAIL | INCONCLUSIVE
- Severity (if FAIL): blocker | major | minor
- Repro: tools/qa/<file>.js
```

Hand to the coordinator. The coordinator decides which implementer fixes it.

## Cooperation with implementer tests

QA scenarios are *additional* to implementer-written specs, not replacements. The implementer test verifies "the function does what I wrote it to do"; the QA scenario verifies "the user-visible behaviour matches what the docs say." Both should exist.

## Notes I read

- All `notes/architecture-*.md` and `notes/decision-*.md` — the canonical statement of intent.
- [`architecture-invariants.md`](../architecture-invariants.md) — every QA assertion ultimately ladders up to an invariant or a documented decision.
- [`bug-bezier-antiparallel-overlap.md`](../bug-bezier-antiparallel-overlap.md), [`bug-next-edge-out.md`](../bug-next-edge-out.md) — open bugs are obvious QA targets.
- [`docs/file-format.md`](../../docs/file-format.md) — the wire-format oracle for serialization round-trip scenarios.
