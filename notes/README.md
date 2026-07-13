# kidraw notes — Map of Content

This directory is the project's zettelkasten: one atomic fact / decision / idea / bug per file, cross-linked with plain markdown. Tool-agnostic (no `[[wiki]]` syntax); both Claude Code and Codex read it directly.

The top-level [`dev-status.md`](../dev-status.md) is the short current-state pointer; everything historical and topical lives here.

## How to use this

- **Reading:** start with `dev-status.md` for *where we are*, then dip into the relevant note(s) below.
- **Writing:** when you learn something that should outlive the current session, add an atomic note here. One fact per file. Link related notes with plain markdown. Don't duplicate — link.
- **Agent prompts** live in [`agents/`](agents/). They reference notes from here; notes never reference agent files.

## Philosophy

_The thesis kidraw is built on._

- [Keyboard-first philosophy and ergonomic goals](philosophy-keyboard-first.md) — keyboard-first, home-row centric, select→act→reset, opposite-hand principle.

## Decisions

_What we chose and why. Stable until explicitly revised._

- [Vim is the canonical key profile](vim-is-canonical-profile.md) — `ijkl` is the secondary profile; never reintroduce the name `default`.
- [Held-key modes + waypoints vs labels](decision-interaction-model.md) — the core interaction model: Add+Drag / Select+Drag / Move / Delete held keys, plus the waypoint-vs-label distinction.
- [Vault model — FSA directory grant behind a storage interface](decision-vault-model.md) — one-time directory grant, silent auto-save, external-change polling + conflict policy, cloud as a later second implementation.

## Architecture

_How the code is organized. Component boundaries, layer model, invariants._

- [Key-assignment profiles](architecture-key-profiles.md) — vim (default) and ijkl; the profile-multiplicity contract.
- [Keymenu system model](architecture-keymenu-model.md) — definitions, transition types, invariants I1–I3.
- [Mode hierarchy and CapsLock transitions](architecture-mode-hierarchy.md) — the four modes and how they nest.
- [Design invariants and non-invariants](architecture-invariants.md) — the 11 invariants + the explicit list of tunable parameters.

## Ideas / backlog

_Things we'd like to do, not yet scheduled. One per file, prefixed `idea-`._

**Keymenu / interaction:**

- [Keymenu binding reorg — f for graph nav, a for insert, File menu cleanup](plan-keymenu-binding-reorg.md) — full root-level inventory + the rebind decisions (implemented 2026-07-13).
- [Diagonal-movement profile (2×2 cluster)](idea-diagonal-movement-profile.md)
- [Left-hand-dominant profile](idea-left-hand-profile.md)
- [Visualize greyed-out submenu options](idea-greyed-submenu-options.md)
- [Quick settings panel (orthogonal to keymenu modes)](idea-quick-settings-panel.md)
- [Keymenu visual polish](idea-keymenu-visual-polish.md)
- [Keymenu discoverability](idea-keymenu-discoverability.md)
- [Keymenu as a reusable library](idea-keymenu-as-library.md)
- [Alternative class hierarchies for the keymenu](idea-keymenu-class-hierarchy.md)
- [Shift-shift timing](idea-shift-shift-timing.md)
- [Label-edit mode overhaul](idea-label-edit-overhaul.md)

**Drawing / canvas:**

- [Richer edge kinds (self-loops, parallels, dangling, grouping)](idea-richer-edges.md)
- [Zones — semantic groups, visual containers, layout constraints](idea-zones.md) — the three-concern decomposition, zone-as-endpoint, staging plan.
- [Fast graph building](idea-fast-graph-building.md)
- [Multi-select (drag box + extend)](idea-multi-select.md)
- [Proximity selection feedback](idea-proximity-feedback.md)
- [Gather feature — recursive, with push-away](idea-gather-recursive.md)
- [Overlapping-nodes handling](idea-overlapping-nodes-handling.md)
- [Normalize graph coordinates around the origin?](idea-origin-centering.md) — why we center the view on load instead of rewriting coordinates on save.
- [Labels without visible boxes by default](idea-label-no-default-box.md)
- [Movement acceleration](idea-movement-acceleration.md)
- [Crosshair visual treatment](idea-crosshair-visual-treatment.md)
- [Rich text in nodes and labels (markdown, math)](idea-rich-text.md)
- [Cut / copy / paste](idea-cut-copy-paste.md)
- [Naming — edges vs links](idea-naming-edges-vs-links.md)

**Routing / layout:**

- [Auto-tune edge-routing parameters on benchmark graphs](idea-routing-auto-tune.md)
- [Incremental desiderata-first edge routing](idea-incremental-edge-routing.md)
- [Incremental desiderata router v2 — plan + foundation status](plan-incremental-desiderata-v2.md) — the live revival effort: harness-only `incremental-desiderata-v2`, local scoring, budgets, `npm run routing-test`.
- [Deprecated routing algorithms (resurrection notes)](algo-deprecated-routers.md) — the 5 routers removed when the project consolidated to bezier-fit-weighted-chain.

**Code health / process:**

- [Drawing-area refactor (services + invariants + constants)](idea-drawing-area-refactor.md)
- [Test coverage gaps](idea-test-coverage-gaps.md)

**Product surface:**

- [Extensions with contribution points](idea-diagram-types.md) — one extension concept, per-slot conflict semantics (identity, styles/persistence, commands, node/edge kinds, tags, validation); todo-graph stops persisting derived node sizes; depends-on edges + task-set (AND/OR, seq/par) node kinds recorded.
- [Graph management UI](idea-graph-management-ui.md)
- [Real-world test cases (acceptance diagrams)](idea-real-world-test-cases.md)
- [Infrastructure (deployment, analytics, CI/CD)](idea-infrastructure-deploy.md)
- [In-app keystroke overlay (`?showKeys=true`)](idea-keystroke-overlay.md)
- [Longer-term ambitions](idea-longer-term.md)

## Bugs

_Open issues with reproductions and analysis. One per file, prefixed `bug-`._

- [Bezier-route anti-parallel edges overlap](bug-bezier-antiparallel-overlap.md) — `b → ;` renders A→B and B→A as one line; lane key needs to switch to unordered.
- ["Next edge out" doesn't seem to work](bug-next-edge-out.md) — user-reported; needs verification against the May 2026 traversal fix.
- [Header mode chip goes stale after exiting label edit](bug-header-mode-chip-stale.md) — `exit-label-editing-mode` is only emitted on undo/redo; normal exits never reset the badge.
- [Custom node/edge colors never reach the canvas](bug-style-colors-not-persisted.md) — `fill`/`stroke`/`textColor` (direct or via `tagStyles`) round-trip nowhere in `snapshot-mapping.ts`, and `applyThemeColors()` clobbers any live custom color on every load/theme-toggle anyway.

## Research

_Investigations into options we haven't committed to. One per file, prefixed `research-`._

**Edge routing:**

- [Edge routing — terminology and two-problem framing](research-edge-routing-overview.md) — bends / polylines / obstacle avoidance, plus the auto-layout-vs-route-only distinction and the charged-wire-spring model.
- [libavoid-js as the near-term integration](research-libavoid-integration.md)
- [Polyline segment nudging — kidraw R&D plan](research-polyline-nudging.md)
- [Other layout libraries](research-other-layout-libraries.md) — ELK, cola.js, Graphviz, dagre, yFiles.

**Demos:**

- [Demo video creation (manual + automated paths)](research-demo-video.md)

## Reference

_Static catalogs / tables you look up rather than read end-to-end._

- [Key-event notation](reference-key-event-notation.md) — `\K`/`/K` (down/up) notation for held chords, taps, and release order; used to state the keymenu chord bugs precisely. Draft — open questions on escapes, named sequences, and menu-hierarchy notation.
- [Valid / workable key combinations](valid-key-combos.md) — manual chord catalog for the keymenu.
- [Bulge vs. curvature vs. bends](desiderata-bulge-curvature-bends.md) — what each routing aesthetic metric measures, with worked examples; why their ranking order matters.

## Process

_Workflow rules and retrospective lessons._

- [Workflow lessons](process-workflow-lessons.md) — what works, what to be careful about, suggested phase ordering for new features.
- [Parallel worktree dispatch failure modes](process-parallel-worktree-dispatch.md) — stale base, cwd confusion, budget exhaustion, auto-cleanup; recovery checklist + mitigations.

## Agents

See [`agents/README.md`](agents/README.md) for the agent roster (two-axis framing + full list with links). Each agent's home file under [`agents/`](agents/) carries its mandate, scope, invariants/rubric, workflow, and pointers into the shared zettelkasten. [`AGENTS.md`](../AGENTS.md) at the repo root summarises the roster with one-line descriptions and shows how to invoke each from Claude Code or Codex.
