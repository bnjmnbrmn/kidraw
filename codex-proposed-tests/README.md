# Codex proposed tests

These standalone Node tests characterize two bug-prone seams found during the
2026-08-30 review. They do not alter the Angular/Karma configuration and are
expected to fail against the current production code, documenting the gaps a
fix should close.

Run them with:

```bash
node --test codex-proposed-tests/*.test.mjs
```

- `command-effect-registry.test.mjs` checks that graph edits consistently opt
  into undo, vault autosave, routing exclusion, and header-context refresh. It
  also detects duplicate undo snapshots.
- `lifecycle-cleanup.test.mjs` checks component/object cleanup for subscriptions,
  observers, timers, animation frames, Konva stages, and caret blink intervals.

The command-registry test intentionally parses the current implementation as a
short-term characterization. The recommended production design is an
exhaustive typed command metadata/transaction layer; once that exists, point
the assertions at its exported policy instead.
