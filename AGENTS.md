# AGENTS.md

Canonical, tool-agnostic project instructions. Both Claude Code (via `CLAUDE.md` which inlines this file) and Codex read this directly.

## Project

**kidraw** is a keyboard-first diagramming tool (Angular 19 + Konva canvas). All primary interaction is keyboard-driven via the keymenu — a visual keyboard overlay that maps physical keys to actions. Users navigate a crosshairs cursor on the canvas to build and connect a directed graph of nodes and edges. Mouse is secondary.

## Where to start

1. Read [`dev-status.md`](dev-status.md) for **where development currently stands**: recent commits, current focus, known blockers. It is intentionally short.
2. Read [`notes/README.md`](notes/README.md) for the **Map of Content** into the project zettelkasten — design decisions, architecture, ideas, bugs, research.
3. For the **agent roster** (who does what), see the "Agents" section below and [`notes/agents/`](notes/agents/) for the per-agent home files.

## Git discipline

**Commit frequently and incrementally.** Each logical unit of work (a feature, a bug fix, a refactor) is its own commit. Don't accumulate large batches of unrelated changes.

Before committing: `npx ng build` must be clean.

Commit messages end with:

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

(adjust authorship line if running under a different agent/tool).

## Dev commands

```bash
npm start                                              # dev server at localhost:4200
npx ng test --watch=false --browsers=ChromeHeadless   # run tests
npx ng build                                          # production build / type-check
```

**Test note:** `npm test` can hang. Always use `npx ng test --watch=false --browsers=ChromeHeadless`.

## Architecture

### Component structure

```
AppComponent                        # Shell: routes commands between keymenu and drawing-area
├── HeaderComponent                 # Displays zoom level, waypoint visibility, etc.
├── DrawingAreaComponent            # Konva canvas (nodes, edges, crosshairs)
└── KeymenuComponent                # Keyboard overlay (Konva canvas on top)
```

**Communication pattern:**
- `KeymenuComponent` emits `DACommand` → `AppComponent` → `DrawingAreaComponent` via an RxJS `Subject<DACommand>`.
- `DrawingAreaComponent` emits `DANotification` back up to `AppComponent`, which then calls methods on `KeymenuComponent` directly (e.g. to switch modes or open submenus).

### Drawing area (`src/app/drawing-area/`)

`DrawingAreaComponent` owns a Konva `Stage` with two layers:

- **`DrawingLayer`** (`drawing.layer.ts`) — extends `Konva.Layer`. Contains `daEdgeGroup` (z-below) and `daNodeGroup` (z-above). Holds arrays of `DANode`, `DAEdge`, `DAWaypoint`, `DALabel`. Handles coordinate transforms for zoom/pan.
- **`CrosshairsLayer`** (`crosshairs.layer.ts`) — separate layer always on top; contains the `DACrosshairs` group (a crosshair reticle + optional heading arrow).

Domain objects:

- **`DANode`** — Konva Group with a Rect + Text. Tracks `incomingEdges`/`outgoingEdges`. Supports resize and font size adjustment.
- **`DAEdge`** — Arrow/line between two `DANode`s. Recalculates endpoints from node geometry when nodes move.
- **`DAWaypoint`** — User-placed bend point on an edge. Selectable; can be pinned (routers preserve pinned positions). Mirrors one entry in the parent edge's `_controlPoints` (which carries `waypointId` + `pinned` markers for user waypoints; plain router-generated beads have neither).
- **`DALabel`** — Text annotation on an edge.

Commands arrive as a discriminated union (`DACommandType` enum in `command.model.ts`). `DrawingAreaComponent` handles each command in a large `switch` statement.

### KeyMenu system (`src/app/lib/keymenu/`)

The keymenu is a visual keyboard overlay (Konva canvas) that maps physical keys to actions. Key concepts:

- **`KeyMenu<T>`** — top-level container. Owns named `KeyMenuMode`s, tracks the current mode, routes `keydown`/`keyup` events.
- **`KeyMenuMode`** — interface for a mode (e.g. `normal`, `labelEdit`). Two implementations:
  - **`USQwertyMode`** — the main interactive mode. Maintains a stack of `KMSubmenu`s. Pressing a submenu-trigger key pushes a new submenu; releasing it pops back up. The "active submenu" is always the top of the stack.
  - **`PrintedInstructionKeyMenuModeConfig`** — used for `labelEdit` mode: shows a text instruction and passes all key events to a handler.
- **`KMSubmenu`** — a set of `KMKey`s for a layout position on the keyboard. Handles key highlighting and auto-repeat scheduling (initial delay 250ms, repeat every 100ms).
- **`KMKey`** types: action-only, submenu-only, or both (SubmenuAction). A SubmenuAction key fires its action on press AND opens a child submenu while held.

Key assignment configuration lives in `src/app/keymenu/config/key-assignments.ts` as the `KeymenuKeyAssignments` interface + two profile constants: `VIM_KEYMENU_KEY_ASSIGNMENTS` (the default, hjkl-based) and `IJKL_KEYMENU_KEY_ASSIGNMENTS` (the original ijkl layout, selectable from the header). **No hardcoded key literals** should appear in action logic — always reference `this.keyAssignments.*`.

`KeymenuComponent` (`src/app/keymenu/keymenu.component.ts`) wires together the key assignment config and emits `DACommand` objects. It builds the `KeyMenu` instance in `rebuildKeyMenu()` with two modes: `normal` (USQwerty) and `labelEdit`.

### Special interaction flows

- **Insert+drag**: holding the insert submenu key (`f`), then pressing a node/waypoint/etc key, creates the entity and transitions the submenu to a drag submenu. Releasing the insert key switches to `labelEdit` mode automatically.
- **Select+drag**: holding the select-drag key (`v`) triggers `MULTI_ITEM_SELECT` + `ENTER_DRAG_MODE`; releasing it emits `EXIT_DRAG_MODE`. A second tap of `v` while a waypoint / node / edge is already selected toggles it off (via `toggleTopItemSelection`).
- **Double-Shift**: always returns to `normal` mode from any state.
- **Escape / Ctrl-[**: in `normal` mode, unselects all; in `labelEdit` mode, exits label editing.

### Design invariants

1. Crosshairs always exist and stay within `edgeMargin` of stage edges (overflow scrolls the drawing layer).
2. A selected item always renders its selected visual state.
3. `UNSELECT_ALL` deselects everything (nodes, edges, waypoints, labels).
4. Exactly one keymenu mode (`normal` or `labelEdit`) is active at any time.
5. Entering label edit hides crosshairs; exiting restores them.
6. Creating a new node with existing selected nodes auto-creates edges from each selected node to the new node.
7. Zoom scales around the crosshairs' current position.
8. All key bindings flow through `KeymenuKeyAssignments`; no hardcoded key literals in action logic.
9. Any waypoint hit-test uses `getWaypointUnderCrosshairs()`, whose tolerance is the crosshairs' selection-circle radius (in layer coords) — *every* selection/pin/delete path shares the same "partial overlap with the circle" rule.

### What is intentionally non-stable

Key assignments, submenu nesting depth, movement distances, zoom step factor, visual styling, tween durations, and label edit entry/exit triggers are all tuning parameters subject to change.

> **Note:** these architecture sections will be atomized into `notes/architecture-*.md` and `notes/decision-*.md` files in a later migration step. Until then they live here for both Claude (via `CLAUDE.md` → `@AGENTS.md`) and Codex (which reads this file directly).

## Agents

The project work is divided across specialist agents. Each has a home file under [`notes/agents/`](notes/agents/) with its mandate, scope, invariants, workflow, and pointers into the shared zettelkasten. A thin Claude Code wrapper for each lives in `.claude/agents/kidraw-<name>.md`.

**Implementers** (each writes its own white-box tests):

- **header** — `src/app/header/**`
- **drawing-area** — `src/app/drawing-area/**` (canvas, nodes, edges, selection, drag, label-edit, mode transitions)
- **keymenu** — `src/app/keymenu/**`, `src/app/lib/keymenu/**`, key assignments
- **graph-auto-layout** — `*-edges.ts`, `graph-layout.ts`, `edge-routing-metrics.ts`, tuning panel
- **serialization** — `src/app/lib/file-format/**`, snapshot mapping, draft storage
- **plumbing** — `app.component.ts`, command/notification wiring, shared services (debug-log, theme, visual-config, keyboard-config)

**Reviewers** (read across implementer worktrees; return findings):

- **menu-ux-review** — keymenu ergonomics (chord conflicts, mnemonics, discoverability)
- **graph-ux-review** — canvas interaction (selection, drag, modes, visual feedback)
- **overall-ux-review** — cross-area flows, header chips, status messages, mode transitions
- **code-review** — idiom, dead code, naming, complexity
- **architectural-review** — structure, boundaries, invariants, dependency arrows

**QA (black-box):**

- **qa** — drives the app via Playwright / `window.ng.getComponent`. Reads only `dev-status.md`, `docs/`, and `notes/` to know what behavior *should* be. Never reads `src/**`. Owns `tools/qa/`.

**Orchestrator:**

- **coordinator** — plans, splits tasks across implementers, dispatches reviewers, surfaces conflicts.

## Worktree isolation

Each implementer agent works in its own git worktree to allow parallel work without conflict. Port collisions on `ng serve` are avoided via `tools/worktree-port.sh` (TBD) which hands out a deterministic free port per worktree. Docker is deferred until port assignment proves insufficient.

Reviewers have read access across sibling implementer worktrees and their own scratch worktree for experiments. QA runs in its own worktree but cannot read sibling worktrees' `src/**`.

## Memory policy

This repo *is* the memory. Anything that should outlive a single session goes into [`notes/`](notes/) as an atomic markdown file. Per-tool memory directories (e.g. `~/.claude/projects/.../memory/`) are kept thin and point back here.
