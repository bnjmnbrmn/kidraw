---
title: KiDraw agent mode — local companion, model-agnostic agents, tours, shared pointing
type: idea
---

# KiDraw agent mode — local companion, model-agnostic agents, tours, shared pointing

**Status:** sketch, revised 2026-09-14 (Ben + Claude), fourth pass. Not scheduled.

## Goals (Ben, 2026-09-14)

- **Chat in the browser**, sooner rather than later.
- **Everything local:** the agent tooling runs on the same machine as the browser, started from the vault directory.
- **Model-agnostic:** Claude Code and Codex are examples, not requirements.
- **One agent per tab.**
- **Tours first (read-only)**, with step forward/back; the AI may revise a tour in response to a question. Proposed edits come later and need a real diff presentation.
- **Shared pointing:** both the user and the AI can point at things on the canvas and ask each other questions, especially to make suggestions.
- **Captions sit next to the objects they annotate**; otherwise near the bottom of the window.
- **Views are primarily explicit viewports.** Views, tours, transitions, and captions live in style sets (`*.kd-style.yaml` / `.json`), which may exist only in memory.
- **Discussions** might become their own file type; play it by ear.

## Can the page run the server itself?

No. A web page can't listen on a port or create sockets or pipes, and it can't launch processes. So the user starts one small local program, **`kidraw-agent`**, in the vault directory (later: a desktop wrap could embed it).

## Architecture (all on the user's machine)

```
 ┌──────────────────────────── user's machine ───────────────────────────────────┐
 │                                                                               │
 │  Tab A: KiDraw ─┐                                vault dir (~/kidraw/)        │
 │  Tab B: KiDraw ─┤ ws://127.0.0.1:<port>          ├─ next.kidraw.yaml          │
 │   chat panel,   │ (token read from ────────────► ├─ *.kd-style.yaml           │
 │   captions,     │  .kidraw/agent.json via FSA)   └─ .kidraw/agent.json        │
 │   tours, pills  ▼                                                             │
 │  kidraw-agent (Node, started in the vault dir)                                │
 │   ├─ tab sessions: one agent session per connected tab                        │
 │   ├─ KiDraw tools, exposed as an MCP server (focus, point, caption, ask, …)   │
 │   └─ agent adapters:                                                          │
 │        ├─ ACP client ──stdio JSON-RPC──► any ACP agent (Claude via adapter,   │
 │        │                                 Codex via adapter, Gemini CLI, Goose…)│
 │        └─ built-in loop ──HTTP──► any OpenAI-compatible endpoint              │
 │                                   (LiteLLM, Ollama/local, hosted providers)   │
 └───────────────────────────────────────────────────────────────────────────────┘
```

**Rendezvous through the vault directory.** On startup, `kidraw-agent` listens on a random loopback port and writes `.kidraw/agent.json` (`{ port, token, pid }`). The tab already holds an FSA grant for the vault, so it reads the file and connects with the token; only someone who can read the vault can connect. The tab looks for the file when the vault connects, on a "Connect agent" command, and via `FileSystemObserver` where available.

**Transport: loopback WebSocket, pushed both ways — no polling on the live path.** Chrome 147+ shows a one-time Local Network Access prompt before an HTTPS page can open a WebSocket to localhost.

**Fallback transport:** an append-only JSON-lines mailbox under `.kidraw/agent/` (server: `fs.watch`; tab: `FileSystemObserver`, confirm availability, else ~150 ms polling only while a session is active). Avoids the permission prompt at the cost of more plumbing.

### Model-agnostic agents

- **Primary: ACP (Agent Client Protocol)** — an open JSON-RPC 2.0 standard ("LSP, but for agents") supported by Zed and JetBrains, with agents including Gemini CLI, Goose, Cline, Qwen Code, Mistral Vibe, and Claude and Codex via adapters. `kidraw-agent` acts as the ACP **client**: for each tab it opens a session with `session/new`, passing `cwd` (the vault) and `mcpServers` (KiDraw's own tool server), then relays chat turns and streams replies back to the tab. The user picks which agent in KiDraw's settings.
- **Also built in: a bring-your-own-model loop** against any OpenAI-compatible endpoint (a LiteLLM proxy, Ollama or LM Studio for local models, or hosted providers), for users without a coding agent installed. It uses the same KiDraw tools.
- **Optional, agent-specific integrations** (not the core): Claude Code channels (a research preview; pushes events into a running Claude Code session) and Codex's app-server JSON-RPC. Useful only if someone wants their already-running terminal session attached.
- **Tab ↔ companion protocol:** KiDraw's own WebSocket messages; consider borrowing AG-UI's event shapes (text streaming, tool-call, state-delta events), an open agent-to-frontend protocol, rather than inventing them.

### One agent per tab

Each tab that connects gets its own agent session: its own conversation, tour state, and pointing context. This removes "which tab is paired?" ambiguity. If an agent can't host several sessions in one process, `kidraw-agent` starts one agent process per tab. A closed tab ends its session; the conversation can be kept as an in-memory discussion (see below).

## Shared pointing and questions

**One reference model for both parties.** `Ref = { kind: node | edge | edge-label | waypoint | region | point, id, label, coords? }`. Files and the wire use ids; everything shown to people uses labels.

**Reference pills** (the UI term "chips" elsewhere): small inline tokens in chat messages naming a canvas object, like the tag pills in the nav popup. Enter or click on one moves the view to that object.

**User → AI**
- Point with what already exists: selection, area select, the crosshairs.
- "Ask about this" key: opens the chat input with the selection attached as reference pills.
- Type `@` for a fuzzy finder (reuse the nav popup / `fuzzy-match.ts`) that inserts a pill.

**AI → user** (tools)
- `point(refs, note?)` — pulse or glow the targets, with an optional caption.
- `ask(question, refs, options?)` — a caption beside the targets with keyboard-selectable answers; the answer returns to the agent.
- `suggest(refs, text, change?)` — a suggestion annotation; text-only until the Phase 2 diff overlay exists.
- Replies can embed references (e.g. `[[ref:da-12]]`), rendered as pills.

**Read tools:** `get_outline`, `find_nodes`, `neighborhood`, `get_view`, `get_selection` — from the live tab, not the file.

## Captions

- **Anchored first:** beside the anchor (node, edge midpoint, label, or region centroid), on a side that avoids neighbors and other captions, with a short leader line when offset. Positioned from world coordinates, drawn at constant screen size.
- **Docked fallback:** when the anchor is off-screen, crowded, or zoomed too far out, the caption moves to a bottom dock with a direction indicator and a "go there" key.
- Captions are annotations, never graph content.

## Tours

- A tour is data: `steps[]`, each `{ view, highlights, captions, transition }`.
- **Two separate things:** the tour *definition* (the step list) and the user's *visit history* (steps actually shown). Back and forward walk the history, so they stay exact even if the definition changes.
- **The AI can revise a tour mid-tour** — insert, replace, reorder, or drop upcoming steps (`update_tour(ops)`) — for example after a question shows the planned order won't work. The tab shows a brief "Tour updated: 2 steps added" notice, and the revision is undoable.
- **Improvised tours:** each step the AI shows is appended to an in-memory tour, so back and forward work and the user can save it afterwards.
- Keys in Tour mode: next/back, "ask about this", jump to a step (nav popup), Esc to exit (optionally restoring the starting view).

## Style sets hold views, tours, transitions, captions

Suffixes: graph documents `*.kidraw.yaml` / `.json` (semantics only); style sets `*.kd-style.yaml` / `.json` (presentation; composable via `imports` and the cascade).

```yaml
kdStyle: 1
imports: [base.kd-style.yaml]          # a tour layers on top of the normal look
views:
  mvp-blockers:
    viewport: { cx: -330, cy: -2100, width: 1800, height: 1000 }   # world-space rect
    fit: contain                        # scale the rect to the window's aspect
    dim: { notTagged: [status/blocked] }
    highlight: [n6]
captions:
  why-blocked:
    anchor: n6
    text: "Blocked on the {{ref n12}} decision."
    placement: { prefer: right, fallback: dock-bottom }
tours:
  mvp-walkthrough:
    steps:
      - { view: overview, captions: [intro], transition: { kind: pan-zoom, ms: 600 } }
      - { view: mvp-blockers, captions: [why-blocked] }
```

- **Views are explicit viewports.** Store a world-space rectangle (center plus visible width and height) rather than raw pan/zoom, so a view looks the same on different window sizes; `fit` says how to handle a different aspect ratio. A `frame: [ids]` option can come later for auto-fitting views.
- **In memory is first-class:** agent-made views, captions, and tours start as unsaved in-memory style sets, shown with a dirty indicator, saved on request, and kept in the localStorage draft for crash recovery.
- **Start inline:** multi-file save doesn't yet preserve style `imports` (dev-status), so start with inline style sets inside the graph doc; move to separate `.kd-style` files once imports save correctly.
- **Activation:** "one top-level style active at a time" still holds — a tour activates a style set that imports the normal appearance and adds its views and captions.

## Discussions (play by ear)

The user ↔ AI conversation, with its references and suggestions, is its own kind of artifact. Keep it in memory per tab for now. If saving and resuming discussions proves useful, consider a separate discussion file type rather than stretching style sets.

## Phase 2 — proposals with a real diff view (later)

`propose(changes[])` renders an **in-app overlay** — ghost additions, strike-through deletions, before/after relabels — reviewed step by step like a tour. Accepting runs the normal command path (undoable, auto-saved). The unsolved design problem to tackle first is showing structural diffs legibly.

## Alternatives kept on file

- **VPS-hosted bridge** (earlier sketch): tab ↔ nginx-proxied bridge on the dev box ↔ stdio MCP server. Rejected in favor of everything-local.
- **Vault-file edits with the shipped 1.5 s `lastModified` poll** ([decision-vault-model](decision-vault-model.md)): fine for batch or offline edits, wrong for interactive tours.

## Open questions

- ACP details to confirm before building: whether target agents host multiple concurrent sessions per process, and how each adapter handles the client-supplied `mcpServers`.
- Whether to adopt AG-UI for the tab ↔ companion messages or keep a minimal custom protocol.
- How the tab should present agent choice and credentials (the built-in loop needs an API key or local endpoint; ACP agents bring their own auth).
- Whether a tour should restore the starting view on exit.

Related: [decision-vault-model](decision-vault-model.md), [idea-nav-popup](idea-nav-popup.md), [idea-diagram-types](idea-diagram-types.md), [idea-todo-graph-modeling](idea-todo-graph-modeling.md); file format in [`../docs/file-format.md`](../docs/file-format.md).
