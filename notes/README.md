# kidraw notes — Map of Content

This directory is the project's zettelkasten: one atomic fact / decision / idea / bug per file, cross-linked with plain markdown. Tool-agnostic (no `[[wiki]]` syntax); both Claude Code and Codex read it directly.

The top-level [`dev-status.md`](../dev-status.md) is the short current-state pointer; everything historical and topical lives here.

## How to use this

- **Reading:** start with `dev-status.md` for *where we are*, then dip into the relevant note(s) below.
- **Writing:** when you learn something that should outlive the current session, add an atomic note here. One fact per file. Link related notes with plain markdown. Don't duplicate — link.
- **Agent prompts** live in [`agents/`](agents/). They reference notes from here; notes never reference agent files.

## Decisions

_What we chose and why. Stable until explicitly revised._

- [Vim is the canonical key profile](vim-is-canonical-profile.md) — `ijkl` is the secondary profile; never reintroduce the name `default`.

## Architecture

_How the code is organized. Component boundaries, layer model, invariants._

(none yet)

## Ideas / backlog

_Things we'd like to do, not yet scheduled. One per file, prefixed `idea-`._

(none yet)

## Bugs

_Open issues with reproductions and analysis. One per file, prefixed `bug-`._

- [Bezier-route anti-parallel edges overlap](bug-bezier-antiparallel-overlap.md) — `b → ;` renders A→B and B→A as one line; lane key needs to switch to unordered.

## Research

_Investigations into options we haven't committed to. One per file, prefixed `research-`._

(none yet)

## Agents

See [`agents/`](agents/) for the per-agent home files (mandate, scope, rubric, workflow). [`AGENTS.md`](../AGENTS.md) at the repo root lists them with one-line descriptions.
