# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Development Status

**Read `dev-status.md` at the start of every session.** It is the authoritative document for where development currently stands: recently completed work, known bugs, planned next steps, and the edge-routing research plan. It supersedes `next.txt`, `project-todos.md`, and `improvement-ideas.md`.

## Project Overview

**kidraw** is a keyboard-first diagramming tool built with Angular 19 and Konva (canvas library). The core design philosophy is that all interaction happens via keyboard — the mouse is secondary. Users navigate a crosshairs cursor on a canvas to create and manipulate a directed graph of nodes and edges.

## Commands

```bash
npm start          # Serve dev server at localhost:4200
npm test           # Run Karma/Jasmine unit tests (headless Chrome)
npm run build      # Production build
npm run watch      # Watch-mode build (development config)
```

To run a single test file, add `fit` / `fdescribe` in the spec file (focused Jasmine tests), then run `npm test`.

## Git Discipline

**Commit frequently and incrementally.** Each logical unit of work (a new feature, a bug fix, a refactor) should be its own commit. Do not accumulate large batches of unrelated changes. After completing a self-contained piece of work, commit it before moving on. Use `npx ng build` to verify the build is clean before committing.

## Architecture

### Component Structure

```
AppComponent                        # Shell: routes commands between keymenu and drawing-area
├── HeaderComponent                 # Displays zoom level, waypoint visibility, etc.
├── DrawingAreaComponent            # Konva canvas (nodes, edges, crosshairs)
└── KeymenuComponent                # Keyboard overlay (Konva canvas on top)
```

**Communication pattern:**
- `KeymenuComponent` emits `DACommand` objects → `AppComponent` → `DrawingAreaComponent` via an RxJS `Subject<DACommand>`
- `DrawingAreaComponent` emits `DANotification` objects back up to `AppComponent`, which then directly calls methods on `KeymenuComponent` (e.g., to switch modes or open submenus)

### Drawing Area (`src/app/drawing-area/`)

`DrawingAreaComponent` owns a Konva `Stage` with two layers:
- **`DrawingLayer`** (`drawing.layer.ts`) — extends `Konva.Layer`. Contains `daEdgeGroup` (z-below) and `daNodeGroup` (z-above). Holds arrays of `DANode`, `DAEdge`, `DAWaypoint`, `DALabel`. Handles coordinate transforms for zoom/pan.
- **`CrosshairsLayer`** (`crosshairs.layer.ts`) — separate layer always on top; contains the `DACrosshairs` group (a crosshair reticle + optional heading arrow).

Domain objects:
- **`DANode`** — Konva Group with a Rect + Text. Tracks `incomingEdges`/`outgoingEdges`. Supports resize and font size adjustment.
- **`DAEdge`** — Arrow/line between two `DANode`s. Recalculates endpoints from node geometry when nodes move.
- **`DAWaypoint`** — Geometry-only bend point on an edge (no text).
- **`DALabel`** — Text annotation on an edge.

Commands arrive as a discriminated union (`DACommandType` enum in `command.model.ts`). `DrawingAreaComponent` handles each command in a large `switch` statement.

### KeyMenu System (`src/app/lib/keymenu/`)

The keymenu is a visual keyboard overlay (Konva canvas) that maps physical keys to actions. Key concepts:

- **`KeyMenu<T>`** — top-level container. Owns named `KeyMenuMode`s, tracks the current mode, routes `keydown`/`keyup` events.
- **`KeyMenuMode`** — interface for a mode (e.g., `normal`, `labelEdit`). Two implementations:
  - **`USQwertyMode`** — the main interactive mode. Maintains a stack of `KMSubmenu`s. Pressing a submenu-trigger key pushes a new submenu; releasing it pops back up. The "active submenu" is always the top of the stack.
  - **`PrintedInstructionKeyMenuModeConfig`** — used for `labelEdit` mode: shows a text instruction and passes all key events to a handler.
- **`KMSubmenu`** — a set of `KMKey`s for a layout position on the keyboard. Handles key highlighting and auto-repeat scheduling (initial delay 250ms, repeat every 100ms).
- **`KMKey`** types: action-only, submenu-only, or both (SubmenuAction). A SubmenuAction key fires its action on press AND opens a child submenu while held.

Key assignment configuration lives in `src/app/keymenu/config/key-assignments.ts` as the `KeymenuKeyAssignments` interface + `DEFAULT_KEYMENU_KEY_ASSIGNMENTS`. **No hardcoded key literals** should appear in action logic — always reference `this.keyAssignments.*`.

`KeymenuComponent` (`src/app/keymenu/keymenu.component.ts`) wires together the key assignment config and emits `DACommand` objects. It builds the `KeyMenu` instance in `rebuildKeyMenu()` with two modes: `normal` (USQwerty) and `labelEdit`.

### Special Interaction Flows

- **Insert+drag**: holding the insert submenu key (`f`), then pressing a node/waypoint/etc key, creates the entity and transitions the submenu to a drag submenu. Releasing the insert key switches to `labelEdit` mode automatically.
- **Select+drag**: holding the select-drag key (`v`) triggers `MULTI_ITEM_SELECT` + `ENTER_DRAG_MODE`; releasing it emits `EXIT_DRAG_MODE`.
- **Double-Shift**: always returns to `normal` mode from any state.
- **Escape / Ctrl-[**: in `normal` mode, unselects all; in `labelEdit` mode, exits label editing.

### Design Invariants (from `design_notes.md`)

1. Crosshairs always exist and stay within `edgeMargin` of stage edges (overflow scrolls the drawing layer).
2. A selected item always renders its selected visual state.
3. `UNSELECT_ALL` deselects everything (nodes, edges, waypoints, labels).
4. Exactly one keymenu mode (`normal` or `labelEdit`) is active at any time.
5. Entering label edit hides crosshairs; exiting restores them.
6. Creating a new node with existing selected nodes auto-creates edges from each selected node to the new node.
7. Zoom scales around the crosshairs' current position.
8. All key bindings flow through `KeymenuKeyAssignments`; no hardcoded key literals in action logic.

### What Is Intentionally Non-Stable

Key assignments, submenu nesting depth, movement distances, zoom step factor, visual styling, tween durations, and label edit entry/exit triggers are all tuning parameters subject to change.
