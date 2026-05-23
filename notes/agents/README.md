# Agents

Canonical, tool-agnostic agent home files. Each describes one agent: its mandate, scope, what's out of scope, the invariants or rubric it operates against, a typical workflow, and the zettel notes it reads / owns.

The matching Claude Code wrappers live at [`.claude/agents/kidraw-<name>.md`](../../.claude/agents/) — each is a thin frontmatter file pointing back here. Codex / other tools read these files directly. See [`AGENTS.md`](../../AGENTS.md) for the high-level roster.

## Two axes

- **Region** — which area of the code an agent knows deeply (header, drawing-area, keymenu, graph-auto-layout, serialization, plumbing).
- **Posture** — what kind of work an agent is doing (implement, review, qa, coordinate).

Implementers are region-tagged. Reviewers are posture-tagged and reach *across* implementer worktrees. QA is its own posture (black-box, can't read `src/`). The coordinator is the orchestrator.

## Roster

### Implementers

Each writes its own white-box tests alongside the code it edits. Each works in its own git worktree; the coordinator allocates a unique `ng serve` port via `tools/worktree-port.sh` to avoid collisions.

- [coordinator](coordinator.md) — plans, splits tasks, dispatches specialists, integrates
- [header](header.md) — `src/app/header/**`
- [drawing-area](drawing-area.md) — `src/app/drawing-area/**` (canvas, selection, drag, label-edit, mode transitions)
- [keymenu](keymenu.md) — `src/app/keymenu/**`, `src/app/lib/keymenu/**`, key assignments
- [graph-auto-layout](graph-auto-layout.md) — `*-edges.ts`, `graph-layout.ts`, `edge-routing-metrics.ts`, tuning panel
- [serialization](serialization.md) — `src/app/lib/file-format/**`, snapshot mapping, draft storage
- [plumbing](plumbing.md) — `app.component.ts`, command/notification wiring, shared services

### Reviewers (read-only across worktrees; return findings)

- [menu-ux-review](menu-ux-review.md) — keymenu ergonomics
- [graph-ux-review](graph-ux-review.md) — canvas interaction
- [overall-ux-review](overall-ux-review.md) — cross-area flows, header chips, mode transitions
- [code-review](code-review.md) — idiom, dead code, naming, complexity
- [architectural-review](architectural-review.md) — boundaries, invariants, dependency arrows

### QA (black-box)

- [qa](qa.md) — drives the app via Playwright; reads only docs / notes / dev-status to know what behaviour *should* be; never reads `src/**`. Owns `tools/qa/`.
