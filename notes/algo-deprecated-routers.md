---
title: Deprecated routing algorithms (charged-spring, bezier-route, etc.)
type: reference
---

# Deprecated routing algorithms

After three rounds of harness-driven evaluation, the project consolidated
to **bezier-fit-weighted-chain** as the sole production routing algorithm
(see [`dev-status.md`](../dev-status.md) and the parent plan at
`~/.claude/plans/looks-good-i-want-iterative-whale.md`).

Five routing algorithms were removed from production at that point:

- **charged-spring** (`b → p`) — physics router; springs + charge.
- **bezier-route** (`b → ;`) — pure Bezier curve fitter.
- **bezier-fit-charged-spring** (`b → '`) — hybrid: charged-spring physics
  then Douglas-Peucker simplification + smooth render. The pattern bf-wc
  copied; deprecated because bf-wc consistently scored higher in user
  ratings and the weighted-chain physics base proved more controllable.
- **flexible-wire** (`b → /`) — bead simulation with chord-tautness.
- **weighted-chain** (`b → .`) — PBD rigid-segment chain (standalone).
  Note: the chain physics _itself_ lives on as the physics base of bf-wc;
  only the standalone routing binding + tuning sliders went away.

## Resurrection

The full pre-consolidation state is reachable via:

```bash
git checkout pre-routing-consolidation
# tag points at commit 901c28d
```

Or to inspect a single file:

```bash
git show pre-routing-consolidation:src/app/drawing-area/charged-spring-edges.ts
```

To bring an algorithm back into production:

1. Restore `src/app/drawing-area/<name>-edges.ts` from the tag.
2. Add a `DACommandType.APPLY_<NAME>_EDGES` enum variant + DACommand entry
   in [`src/app/drawing-area/command.model.ts`](../src/app/drawing-area/command.model.ts).
3. Add the binding to the `layout` block in both profiles of
   [`src/app/keymenu/config/key-assignments.ts`](../src/app/keymenu/config/key-assignments.ts).
4. Add a `LabeledAction` in `buildLayoutSubmenuConfig` in
   [`src/app/keymenu/keymenu.component.ts`](../src/app/keymenu/keymenu.component.ts).
5. Restore the corresponding `apply<Name>Edges` method and switch case in
   [`src/app/drawing-area/drawing-area.component.ts`](../src/app/drawing-area/drawing-area.component.ts).
6. (Optional, for harness comparison) add the registration in
   [`tools/routing-eval/harness/bundle-entry.ts`](../tools/routing-eval/harness/bundle-entry.ts).

If you want the old runtime tuning panel back, it lived under
`src/app/tuning-panel/` + `src/app/services/tuning-options.service.ts` +
`src/app/services/ab-testing.service.ts`, all restorable from the same
tag. The replacement for runtime tuning under the bf-wc-only world is the
optimizer pipeline (Phase 3+ of the plan).

## Related notes (also deprecated)

The per-algorithm characterization notes that lived at:

- `notes/algo-charged-spring.md`
- `notes/algo-bezier-route.md`
- `notes/algo-bezier-fit-charged-spring.md`
- `notes/algo-flexible-wire.md`
- `notes/algo-weighted-chain.md`

were deleted in the same consolidation commit. To recover their content,
`git show pre-routing-consolidation:notes/algo-<name>.md`.
