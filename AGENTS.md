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
npm start                                              # log server + dev server at localhost:4200
npm start -- --port "$(tools/worktree-port.sh)"        # log server + worktree-safe dev server port
npx ng test --watch=false --browsers=ChromeHeadless   # run tests
npx ng build                                          # production build / type-check
```

**Test note:** `npm test` can hang. Always use `npx ng test --watch=false --browsers=ChromeHeadless`.

## Architecture (one-page summary)

```
AppComponent                 # shell: routes commands between keymenu and drawing-area
├── HeaderComponent          # zoom level, mode badge, settings, status messages
├── DrawingAreaComponent     # Konva canvas (nodes, edges, waypoints, labels, crosshairs)
└── KeymenuComponent         # keyboard overlay (separate Konva canvas on top)
```

**Communication pattern.** `KeymenuComponent` emits `DACommand` → `AppComponent` → `DrawingAreaComponent` via an RxJS `Subject<DACommand>`. `DrawingAreaComponent` emits `DANotification` back; `AppComponent` calls keymenu methods directly for mode switches.

**Konva layers.** `DrawingLayer` (nodes + edges) and `CrosshairsLayer` (always on top).

**Undo/redo.** Full graph snapshot serialization (`graph-snapshot.ts` + `undo-redo.service.ts`).

**Key binding rule.** All key bindings flow through `KeymenuKeyAssignments`; **no hardcoded key literals** in action logic.

For the full picture, read the architecture notes in order:

- [`notes/architecture-key-profiles.md`](notes/architecture-key-profiles.md) — the vim (default) and ijkl profiles; the profile-multiplicity contract.
- [`notes/architecture-keymenu-model.md`](notes/architecture-keymenu-model.md) — definitions, transition types, invariants I1–I3 for the keymenu state machine.
- [`notes/architecture-mode-hierarchy.md`](notes/architecture-mode-hierarchy.md) — the four modes (`normal`, `capslock / normal`, `edit`, `capslock / edit`) and how they nest.
- [`notes/architecture-invariants.md`](notes/architecture-invariants.md) — the 11 invariants + the explicit list of tunable (non-invariant) parameters.
- [`notes/decision-interaction-model.md`](notes/decision-interaction-model.md) — held-key modes + waypoints vs labels.
- [`notes/philosophy-keyboard-first.md`](notes/philosophy-keyboard-first.md) — the design thesis.

## Agents

The project work is divided across specialist agents. Each has a canonical home file under [`notes/agents/`](notes/agents/) (mandate, scope, invariants, workflow, "notes I read" / "notes I own") and a thin Claude Code wrapper in [`.claude/agents/kidraw-<name>.md`](.claude/agents/). See [`notes/agents/README.md`](notes/agents/README.md) for the two-axis (region × posture) framing.

**Orchestrator:**

- [coordinator](notes/agents/coordinator.md) — plans, splits tasks across implementers, dispatches reviewers, surfaces conflicts.

**Implementers** (each writes its own white-box tests; each works in its own git worktree):

- [header](notes/agents/header.md) — `src/app/header/**`
- [drawing-area](notes/agents/drawing-area.md) — `src/app/drawing-area/**` (canvas, selection, drag, label-edit, mode transitions)
- [keymenu](notes/agents/keymenu.md) — `src/app/keymenu/**`, `src/app/lib/keymenu/**`, key assignments
- [graph-auto-layout](notes/agents/graph-auto-layout.md) — `*-edges.ts`, `graph-layout.ts`, `edge-routing-metrics.ts`, tuning panel
- [serialization](notes/agents/serialization.md) — `src/app/lib/file-format/**`, snapshot mapping, draft storage
- [plumbing](notes/agents/plumbing.md) — `app.component.ts`, command/notification wiring, shared services

**Reviewers** (read-only across implementer worktrees; return written findings):

- [menu-ux-review](notes/agents/menu-ux-review.md) — keymenu ergonomics (chord conflicts, mnemonics, discoverability)
- [graph-ux-review](notes/agents/graph-ux-review.md) — canvas interaction (selection, drag, modes, visual feedback)
- [overall-ux-review](notes/agents/overall-ux-review.md) — cross-area flows, header chips, status messages, mode transitions
- [code-review](notes/agents/code-review.md) — idiom, dead code, naming, complexity
- [architectural-review](notes/agents/architectural-review.md) — boundaries, invariants, dependency arrows

**QA (black-box):**

- [qa](notes/agents/qa.md) — drives the app via Playwright / `window.ng.getComponent`. Reads only `dev-status.md`, `docs/`, and `notes/` to know what behaviour *should* be. **Never reads `src/**`.** Owns `tools/qa/`.

### How to invoke

- **In Claude Code:** spawn via the Agent tool with `subagent_type: 'kidraw-<name>'`, or say "use the X agent." Default to `kidraw-coordinator` when a task crosses regions.
- **In Codex:** say "act as the X agent" or "follow `notes/agents/<name>.md`." There's no formal dispatch — the prompt is the contract.

## Worktree isolation

Each implementer agent works in its own git worktree to allow parallel work without conflict. Port collisions on `ng serve` are avoided via [`tools/worktree-port.sh`](tools/worktree-port.sh) — it hashes the worktree's absolute path into a stable port in `[4200, 4249]`, falling back through the slot range if the desired port is bound.

Usage from inside any worktree:

```bash
npm start -- --port "$(tools/worktree-port.sh)"
```

Docker is deferred until port assignment proves insufficient.

Reviewers have read access across sibling implementer worktrees and their own scratch worktree for experiments. QA runs in its own worktree but cannot read sibling worktrees' `src/**`.

## Memory policy

This repo *is* the memory. Anything that should outlive a single session goes into [`notes/`](notes/) as an atomic markdown file. Per-tool memory directories (e.g. `~/.claude/projects/.../memory/`) are kept thin and point back here.
