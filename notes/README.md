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

## Architecture

_How the code is organized. Component boundaries, layer model, invariants._

- [Key-assignment profiles](architecture-key-profiles.md) — vim (default) and ijkl; the profile-multiplicity contract.
- [Keymenu system model](architecture-keymenu-model.md) — definitions, transition types, invariants I1–I3.
- [Mode hierarchy and CapsLock transitions](architecture-mode-hierarchy.md) — the four modes and how they nest.
- [Design invariants and non-invariants](architecture-invariants.md) — the 11 invariants + the explicit list of tunable parameters.

## Ideas / backlog

_Things we'd like to do, not yet scheduled. One per file, prefixed `idea-`._

**Keymenu / interaction:**

- [Diagonal-movement profile (2×2 cluster)](idea-diagonal-movement-profile.md)
- [Left-hand-dominant profile](idea-left-hand-profile.md)
- [Visualize greyed-out submenu options](idea-greyed-submenu-options.md)
- [Quick settings panel (orthogonal to keymenu modes)](idea-quick-settings-panel.md)
- [Keymenu visual polish](idea-keymenu-visual-polish.md)
- [Keymenu discoverability](idea-keymenu-discoverability.md)
- [Keymenu as a reusable library](idea-keymenu-as-library.md)
- [Shift-shift timing](idea-shift-shift-timing.md)
- [Label-edit mode overhaul](idea-label-edit-overhaul.md)

**Drawing / canvas:**

- [Richer edge kinds (self-loops, parallels, dangling, grouping)](idea-richer-edges.md)
- [Fast graph building](idea-fast-graph-building.md)
- [Multi-select (drag box + extend)](idea-multi-select.md)
- [Proximity selection feedback](idea-proximity-feedback.md)
- [Gather feature — recursive, with push-away](idea-gather-recursive.md)
- [Overlapping-nodes handling](idea-overlapping-nodes-handling.md)
- [Labels without visible boxes by default](idea-label-no-default-box.md)
- [Movement acceleration](idea-movement-acceleration.md)
- [Rich text in nodes and labels (markdown, math)](idea-rich-text.md)
- [Cut / copy / paste](idea-cut-copy-paste.md)
- [Naming — edges vs links](idea-naming-edges-vs-links.md)

**Routing / layout:**

- [Auto-tune edge-routing parameters on benchmark graphs](idea-routing-auto-tune.md)

**Code health / process:**

- [Drawing-area refactor (services + invariants + constants)](idea-drawing-area-refactor.md)
- [Test coverage gaps](idea-test-coverage-gaps.md)

**Product surface:**

- [Graph management UI](idea-graph-management-ui.md)
- [Real-world test cases (acceptance diagrams)](idea-real-world-test-cases.md)
- [Infrastructure (deployment, analytics, CI/CD)](idea-infrastructure-deploy.md)
- [In-app keystroke overlay (`?showKeys=true`)](idea-keystroke-overlay.md)
- [Longer-term ambitions](idea-longer-term.md)

## Bugs

_Open issues with reproductions and analysis. One per file, prefixed `bug-`._

- [Bezier-route anti-parallel edges overlap](bug-bezier-antiparallel-overlap.md) — `b → ;` renders A→B and B→A as one line; lane key needs to switch to unordered.
- ["Next edge out" doesn't seem to work](bug-next-edge-out.md) — user-reported; needs verification against the May 2026 traversal fix.

## Research

_Investigations into options we haven't committed to. One per file, prefixed `research-`._

**Edge routing:**

- [Edge routing — terminology and two-problem framing](research-edge-routing-overview.md) — bends / polylines / obstacle avoidance, plus the auto-layout-vs-route-only distinction and the charged-wire-spring model.
- [libavoid-js as the near-term integration](research-libavoid-integration.md)
- [Polyline segment nudging — kidraw R&D plan](research-polyline-nudging.md)
- [Other layout libraries](research-other-layout-libraries.md) — ELK, cola.js, Graphviz, dagre, yFiles.

**Demos:**

- [Demo video creation (manual + automated paths)](research-demo-video.md)

## Process

_Workflow rules and retrospective lessons._

- [Workflow lessons](process-workflow-lessons.md) — what works, what to be careful about, suggested phase ordering for new features.

## Agents

See [`agents/`](agents/) for the per-agent home files (mandate, scope, rubric, workflow). [`AGENTS.md`](../AGENTS.md) at the repo root lists them with one-line descriptions.
