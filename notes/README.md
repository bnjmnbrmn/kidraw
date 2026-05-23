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

- [Diagonal-movement profile (2×2 cluster)](idea-diagonal-movement-profile.md)
- [Left-hand-dominant profile](idea-left-hand-profile.md)
- [Visualize greyed-out submenu options](idea-greyed-submenu-options.md)

## Bugs

_Open issues with reproductions and analysis. One per file, prefixed `bug-`._

- [Bezier-route anti-parallel edges overlap](bug-bezier-antiparallel-overlap.md) — `b → ;` renders A→B and B→A as one line; lane key needs to switch to unordered.

## Research

_Investigations into options we haven't committed to. One per file, prefixed `research-`._

(none yet)

## Agents

See [`agents/`](agents/) for the per-agent home files (mandate, scope, rubric, workflow). [`AGENTS.md`](../AGENTS.md) at the repo root lists them with one-line descriptions.
