---
title: IDE inspections report nothing on large files (and that reads as clean)
type: process
---

# IDE inspections: an empty result is not a clean result

When Claude Code runs inside IntelliJ, the IDE's own inspections are
reachable over MCP (`get_file_problems` for one file, `lint_files` for
several). They are worth using: they catch what `npx ng build` cannot, since
unused imports, unused privates and dead locals are all warnings rather than
type errors, and the build stays green with hundreds of them.

## The trap

`get_file_problems` returns `{"errors": []}` both when a file is clean and
when the analysis did not finish. On `drawing-area.component.ts` (~7,300
lines) it returned the empty result while the file had **22 unused imports and
6 pieces of dead code** (inferred, 2026-09-17, from running it against a file
whose unused imports had already been found by hand).

`lint_files` is slightly more honest — it sets `"timedOut": true` on the file
entry — but it still pairs that flag with an empty `problems` list, so a
caller skimming for findings sees nothing wrong.

## The rule

**On a file of more than a few thousand lines, treat an empty result as
"ask again", not as "clean."** (inferred, 2026-09-17)

- Pass a long explicit `timeout` (300000 ms is comfortable for the drawing
  area; the default is not).
- Check for `timedOut` on every `lint_files` entry before believing the
  result.
- The IDE gets faster once warm. The same call that returned empty early in a
  session returns real findings later.

## Confirming the tool is actually looking

When it matters, probe instead of trusting silence. Write a throwaway file
with a deliberate fault, confirm the inspector reports it, then delete the
file:

```ts
// src/app/<area>/lint-probe.ts
import { DANode } from './da-node';   // expect: "Unused import"

export function probe(): number {
  const unusedLocal = 42;             // expect: "Unused constant"
  return 0;
}
```

If the probe comes back with findings and the real file comes back empty, the
real file is the one being truncated. To probe the large file itself, add one
deliberate unused import to it, confirm the inspector names that import, then
revert.

Severity note: unused imports and unused private methods are reported at
`WARNING`, so `min_severity: "warning"` is enough to see them. `errorsOnly`
must be `false` (or omitted) — passing `true` hides exactly the category most
worth having.

## Why this is worth the trouble

The first run of this against `drawing-area.component.ts` found a duplicated
interface left behind by an earlier extraction, three dead methods, two unused
parameters, and one discarded `Set` that was being rebuilt over every node in
the layer on every grow-ghost redraw. None of it failed the build, and none of
it failed a test. See [`idea-drawing-area-refactor.md`](idea-drawing-area-refactor.md).
