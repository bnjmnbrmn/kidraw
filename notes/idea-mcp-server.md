---
title: KiDraw MCP server — AI proposes, you review from the keyboard
type: idea
---

# KiDraw MCP server — AI proposes, you review from the keyboard

**Status:** sketch (2026-09-14, Ben + Claude). Not scheduled.

## Why

- Makes KiDraw a human–AI interaction medium you can actually see working: an agent proposes graph changes, and the human reviews, accepts, or rejects them from the keyboard.
- Job-search side benefit: a clear example of having *implemented* tool calling and agents (Omada's screening question), and a route to hands-on LiteLLM/Bedrock experience.
- Formalizes a loop that already exists informally: agents already work "off Ben's live todo graph" via `tools/draft-mirror.json`.

## What already exists (v0 needs no app changes)

- **Vault round-trip** ([decision-vault-model](decision-vault-model.md), shipped): KiDraw polls the open vault file's `lastModified` every 1.5 s and silently reloads external edits when the session is clean. If the session is dirty, local state wins and the external edit is ignored with a warning.
- **Pure-TS file-format lib** (`src/app/lib/file-format/`: parser, resolver, snapshot mapping, YAML via js-yaml). It has no Angular imports, so the server can reuse it for validation instead of re-implementing the schema.
- **Tags** on nodes and edges (`tags: string[]`), and `tagStyles` in style sets; the resolver folds matching tag styles into per-element rules on load.
- **ID safety:** the in-app counter only observes `da-N` ids (`observeId` in `drawing.layer.ts`), so server-created ids with a different prefix (e.g. `ai-7f3k`) can never collide with ids the app mints later.
- **Fuzzy matching** (`src/app/lib/fuzzy-match.ts`) for resolving labels.

## Shape

A stdio MCP server in TypeScript (`@modelcontextprotocol/sdk`) under `tools/mcp/`, importing the file-format lib and configured with a vault directory. Python/FastMCP would also work, but TypeScript reuses KiDraw's own parser.

**Label-first interface.** Tools take and return node *labels* (fuzzy-resolved, with an error listing candidates when ambiguous), never raw ids — the same rule the humans use.

### Read tools

- `list_graphs()` — vault listing with node/edge counts and diagram `type`.
- `read_graph(path)` — compact outline: nodes (label, status/tags, notes) and edges (`from → to`, edge labels), in a stable order.
- `find_nodes(path, query)` — fuzzy label search.
- `neighborhood(path, label, depth = 1)` — incoming and outgoing edges around a node.

### Write tools (proposals only)

- `propose(path, changes[])`, where each change is one of:
  - `add_node { label, notes?, near?: label, status? }`
  - `add_edge { from, to, label? }`
  - `set_status { node, status }` (todo-graph `status/*` tags)
  - `relabel { node, label }` and `add_note { node, text }`
  - `suggest_delete { node | edge }`
- `list_proposals(path)` and `withdraw(path, batch?)`

Every proposed element carries `ai/proposed` plus a batch tag `ai/batch-<id>`. Changes to *existing* elements are recorded as proposals, not applied (see open questions for how). New nodes get positions offset from their `near` anchor by the todo-graph card size, because a node with no `x`/`y` otherwise lands at the origin.

**Write discipline:** read → apply → validate with KiDraw's parser → staleness check (mtime/hash unchanged since the read) → write a `.bak` → atomic write (temp file + rename). The agent can add, but never silently change or delete the human's content.

## Review — the human–AI part

- **v0 (no app changes):** proposals render through a `tagStyles` rule (e.g. `ai/proposed` → dashed purple stroke). Accept = remove the tag; reject = delete the element. Both are already reachable from the keyboard.
- **v1 (in-app review mode):** a keymenu "Review" submenu — next/previous proposal (reusing the nav popup), accept, reject, accept batch, reject batch — each an undoable step, with a status line like "3 of 7 proposals".

## Deployment

- Ben's live vault is local to the laptop (FSA grant), so the full round-trip works when the server runs **on the laptop** (Claude Code or Claude Desktop over stdio), pointed at the vault directory.
- On the VPS, the server can run **read-only** today against `tools/draft-mirror.json` and `meta-project/kdvault/*.kidraw.yaml`.

## Later: an agent loop Ben writes, through a gateway

A small agent (TypeScript or Python) that calls the same tools through the Anthropic API — optionally via a local LiteLLM proxy, and Claude on Bedrock if an AWS account is available — adds model routing, usage and cost logging, and a real tool-calling loop Ben implemented himself.

## 60-second demo script

Open the Next todo graph → ask "break *Prepare for Omada interview* into steps with dependencies" → dashed proposals appear within ~2 s → review from the keyboard: accept three, reject one, fix a label → done.

## Open questions

- Does `tagStyles` survive a KiDraw auto-save, or does saving flatten it into per-node style props (so the dashed look would stick after "accept")? Verify before relying on v0 styling; the v1 review mode can render proposals from the tag directly instead.
- Proposed edits to existing elements: inline markers vs. a sidecar `*.kidraw.proposals.yaml` that KiDraw merges in. A sidecar would also avoid the dirty-session problem below.
- Dirty-session clobber: if Ben is mid-edit, the external write is ignored, and the server can't see the app's dirty state from the laptop. A sidecar or the v1 review mode fixes this.
- Whether YAML key order must be preserved on write for clean diffs, and whether the server stays in `tools/mcp/` or becomes its own package.

Related: [decision-vault-model](decision-vault-model.md), [idea-todo-graph-modeling](idea-todo-graph-modeling.md), [idea-diagram-types](idea-diagram-types.md).
