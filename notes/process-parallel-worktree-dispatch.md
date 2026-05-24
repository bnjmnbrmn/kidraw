---
title: Parallel worktree dispatch — observed failure modes
type: process
---

# Parallel worktree dispatch — observed failure modes

When the parent session dispatches multiple implementer agents in parallel
via `Agent({ isolation: "worktree" })`, several failure modes have been
observed that don't show up in single-agent or serial flows. Capture them
here so the next dispatcher (human or coordinator) sees the trap before
falling into it.

## Observed in round 2 Phase A (2026-05-24)

Three parallel `kidraw-graph-auto-layout` agents were dispatched in worktrees
to fix three independent bugs. Outcomes:

| Agent | Outcome |
|---|---|
| #1 bezier-route bugs | Landed two commits in its worktree. Reported back cleanly. |
| #2 arrowhead tangent | Ran out of session budget before producing any commits. Worktree existed but was empty relative to main. |
| #3 dense/sparse re-spec | Made the edits, but wrote them to **main** instead of the worktree. Ran out of session budget before committing. Work was salvageable from main's dirty working tree. |

Net: 1 of 3 agents delivered through a worktree as intended.

## Failure mode A — stale worktree base

Agent #1 reported: *"the worktree started 23 commits behind main and lacked
`notes/`, `AGENTS.md`, and the routing-eval tooling. I fast-forward-merged
main into the worktree branch up front."*

`isolation: "worktree"` does not necessarily place the worktree at current
main HEAD. The agent must verify and ff-merge main itself before working,
or its edits land against a fictional past version of the repo.

## Failure mode B — cwd confusion (writes-to-main)

Agents #1 and #3 both made Edit calls targeting the **main** project path
instead of their worktree path. Agent #1 caught and reverted its slip;
agent #3 ran out of budget before reverting and left main with
`tools/routing-eval/scenarios/dense.mjs` and `sparse.mjs` modified but
uncommitted.

Likely cause: the agent's tool calls take absolute paths; the parent's cwd
(in the main checkout) leaks into the agent's frame of reference even
though its working area is meant to be the worktree.

## Failure mode C — session-budget exhaustion mid-task

Two of three agents hit "You've hit your session limit" before producing
their final report. One had no commits at all; the other had work-in-progress
in main's dirty tree.

Sub-agents have their own session budgets that exhaust independently from
the parent. A re-dispatch may hit the same wall on the same task.

## Failure mode D — auto-cleanup of empty worktrees

`isolation: "worktree"` auto-removes the worktree if the agent made no
changes. Agent #3's worktree (path `agent-aa093c74c80cb8973`) didn't exist
on disk by the time the parent inspected it — because the changes that
should have been there ended up in main instead, the worktree itself was
"clean" and got swept up.

## Recovery checklist (parent session)

When a dispatched worktree agent reports a problem or fails to report:

1. `git -C <main-path> status --short` — look for unexpected dirty files.
   They may be salvageable agent work.
2. `git -C <main-path>/.claude/worktrees/agent-<id> log --oneline main..HEAD`
   — confirm what (if anything) the worktree committed.
3. If the worktree was auto-cleaned, the agent made no commits. Check
   main's dirty state per step 1.
4. For partial work in main: review the diff, then either commit (with
   honest attribution) or revert; don't leave main dirty across dispatches.

## Mitigations for the next dispatch

- **Prefer fewer, larger-scoped agents** over many small parallel ones when
  budget is uncertain. Three small agents share three independent
  exhaustion risks; one larger agent shares one.
- **Bake worktree-awareness into agent briefs** — at minimum:
  > Before any file write, run `git rev-parse --show-toplevel` and confirm
  > it ends with your worktree path (`agent-<id>`). Never edit files under
  > the main checkout path.
- **Tell the agent its worktree may be behind main** and have it ff-merge
  main first.
- **Cap parallel parallelism at 2** until the cwd-confusion mode is
  designed out. The blast radius of cross-worktree contamination grows
  with N.
- **Don't auto-trust subagent reports of success** — verify with
  `git status` on main and `git log` on the worktree branch. Subagent
  output is what they *intended* to do, not necessarily what happened.

## Open questions

- Is there a hook the parent session can install to force agents into
  their worktree's cwd before tool calls? Worth exploring in
  `.claude/settings.json` hooks.
- Can the worktree be created off `origin/main` instead of an apparent
  snapshot, to avoid failure mode A?

## Related

- [[process-workflow-lessons]] — broader retrospective patterns.
- [[agents/coordinator]] — the agent role that's most affected by these
  failure modes (it orchestrates multi-worktree work by design).
