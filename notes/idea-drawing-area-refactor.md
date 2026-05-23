---
title: Drawing-area refactor (services + invariants + constants)
type: idea
---

# Drawing-area refactor

`DrawingAreaComponent` is ~2000 lines with 54 command cases and 17+ state fields tracking different concerns. It handles graph mutation, selection, dragging, traversal, undo/redo, zooming, and auto-pan all in one place.

## Suggested service extractions

1. **`SelectionService`** — tracks what's selected; handles select/unselect/toggle logic.
2. **`DragService`** — drag state machine (enter/exit drag mode, position updates, auto-pan during drag).
3. **`TraversalService`** — node/edge traversal indices and jump logic.
4. **`DirectedEdgeService`** — the begin / set-destination / finalize directed-edge flow state machine.

Each service receives the `DrawingLayer` and emits commands back. The component becomes a thin dispatcher.

## Formalize submenu stack invariants

The keymenu invariants ([architecture-keymenu-model](architecture-keymenu-model.md), I1–I3) are enforced only by careful coding in `USQwertyMode`. A `SubmenuStack` class with push/pop/replace methods that *enforce* the invariants — plus type-level constraints where possible and debug-mode assertions — would catch regressions.

## Separate graph model from rendering

`DANode`, `DAEdge` etc. are inseparable from their Konva rendering today. A pure data layer enables easier serialization (partially done with `GraphSnapshot`), Konva-free testability, and longer-term collaborative editing.

## Centralize constants

Animation timings, distances, sizes, and magic numbers are scattered. A `src/app/config/constants.ts` with semantic grouping (AnimationTimings / GraphSizes / InteractionThresholds) would make tuning easier. Low priority since "intentionally non-stable" per the invariants doc.
