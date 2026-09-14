---
title: KiDraw agent mode — local MCP server, in-browser chat, tours, shared pointing
type: idea
---

# KiDraw agent mode — local MCP server, in-browser chat, tours, shared pointing

**Status:** sketch, revised 2026-09-14 (Ben + Claude), third pass. Not scheduled.

## Goals (Ben, 2026-09-14)

- **Chat in the browser**, sooner rather than later.
- **Everything local:** the MCP server and Claude Code/Codex run on the same machine as the browser. Ask users to start the agent in their vault directory.
- **Tours first (read-only)**, with step forward/back. Proposed edits come later and need a real diff presentation.
- **Shared pointing:** both the user and the AI can clearly point at things on the canvas and ask each other questions, especially to make suggestions.
- **Captions sit next to the objects they annotate**; if that isn't possible, near the bottom of the window.
- **Views, tours, transitions, and captions are defined in style sets** (`*.kd-style.yaml` / `.json`), which may also exist only in memory (unsaved).

## Can the page run the server itself?

No. A web page can't listen on a port or create sockets or pipes. The server has to be a local process, and the natural one to start it is the agent the user already runs in the vault directory. Claude Code starts project-scoped MCP servers from `.mcp.json` in that directory, and a desktop wrap of KiDraw could embed the server later.

## Architecture (all on the user's machine)

```
 ┌───────────────── user's machine ───────────────────────────────────────────┐
 │                                                                            │
 │  Browser: KiDraw tab ──── FSA grant ────► vault dir (~/kidraw/)            │
 │    chat panel, captions,                   ├─ next.kidraw.yaml             │
 │    tour + pointing UI                      ├─ *.kd-style.yaml              │
 │        │                                   └─ .kidraw/agent.json  ◄─┐      │
 │        │ ws://127.0.0.1:<port>  (push both ways, token from ────────┘│     │
 │        ▼                         agent.json)                         │     │
 │  kidraw-mcp  (Node; started from the vault dir) ─── writes rendezvous┘     │
 │        │                                                                   │
 │        ├── stdio MCP + channel ──► Claude Code (`claude`, channels on)     │
 │        └── JSON-RPC client ──────► Codex (`codex app-server`)              │
 └────────────────────────────────────────────────────────────────────────────┘
```

**Discovery through the vault directory (Ben's "pipe in the vault" idea, used for rendezvous).** On startup, `kidraw-mcp` listens on a random loopback port and writes `.kidraw/agent.json` (`{ port, token, pid, agent }`) into the vault. The tab already holds an FSA grant for that directory, so it reads the file and connects with the token. Only someone who can read the vault can connect.

**Transport: a loopback WebSocket, pushed both ways — no polling on the live path.** Chrome 147+ shows a one-time Local Network Access prompt before an HTTPS page can open a WebSocket to localhost; after that the connection is direct.

**Fallback transport: a mailbox in the vault directory.** Append-only JSON-lines message files under `.kidraw/agent/`, written by each side with atomic renames. The server watches with `fs.watch`; the tab uses Chrome's `FileSystemObserver` (intent-to-ship for desktop Chrome 133 — confirm availability), falling back to polling (~150 ms, only while a session is active). This avoids the network permission prompt at the cost of more plumbing.

**Finding the rendezvous file:** the tab checks for `.kidraw/agent.json` when the vault connects, on a "Connect agent" command, and via `FileSystemObserver` if available.

### How chat reaches the agent

- **Claude Code:** the vault ships a `.mcp.json` registering `kidraw-mcp`, and the user runs `claude` in the vault directory with channels enabled. `kidraw-mcp` declares the channel capability (research preview; needs claude.ai or Console auth, not Bedrock). A message typed in KiDraw's chat panel goes tab → WebSocket → `kidraw-mcp` → a channel event in the running Claude Code session. Claude answers by calling KiDraw tools (`say`, `point`, `caption`, `ask`), which go back over the WebSocket. The terminal stays open but doesn't need attention.
- **Codex:** Codex has no channels; instead `kidraw-mcp` (or a thin `kidraw-agent` wrapper) runs `codex app-server` and drives it over its JSON-RPC protocol (`initialize` → thread → `turn/start` → stream notifications), with KiDraw's tools registered as an MCP server in Codex's config. The user starts `npx kidraw-agent --codex` in the vault instead of `codex` itself.
- Both sit behind one **agent adapter** interface in `kidraw-mcp`, so the tab doesn't care which agent is on the other end.

## Shared pointing and questions

**One reference model for both parties.** `Ref = { kind: node | edge | edge-label | waypoint | region | point, id, label, coords? }`. Files and the wire use ids; everything shown to people uses labels (the humans' rule).

**User → AI**
- Point with what already exists: selection, area select, the crosshairs.
- "Ask about this" key: opens the chat input with the selection as reference chips.
- Type `@` in chat for a fuzzy finder (reuse the nav popup / `fuzzy-match.ts`) that inserts a reference chip.
- Every chip anywhere in the chat history is focusable: Enter or click moves the view to it.

**AI → user** (MCP tools)
- `point(refs, note?)` — pulse or glow the targets, with an optional caption.
- `ask(question, refs, options?)` — a caption beside the targets with keyboard-selectable answers; the answer returns to the agent.
- `suggest(refs, text, change?)` — a suggestion annotation. Text-only at first; `change` renders as a diff overlay once Phase 2 exists.
- The AI's chat replies can embed references (e.g. `[[ref:da-12]]`), rendered as chips that focus the object.

**Read tools:** `get_outline`, `find_nodes`, `neighborhood`, `get_view`, `get_selection` — read from the live tab, not the file.

## Captions

- **Anchored first:** placed beside the anchor (node, edge midpoint, label, or region centroid), choosing a side that avoids the anchor's neighbors and other captions, with a short leader line when offset. Positioned from world coordinates but drawn at a constant screen size, so pan/zoom keeps them attached and readable.
- **Docked fallback:** when the anchor is off-screen, too crowded, or zoomed too far out, the caption moves to a bottom dock with a direction indicator and a "go there" key.
- Captions are annotations, not graph content, so they never enter the graph document.

## Tours: steps forward and back

- A tour is data: `steps[]`, each `{ view, highlights, captions, transition }`. **Back re-applies the previous step exactly** — no AI call needed.
- **Improvised tours:** as the AI guides, each step it shows is appended to an in-memory tour. So back and forward work even for a tour made up on the spot, and the user can save it afterwards.
- **Detours:** a question mid-tour can insert side steps, then return to the main sequence.
- Keys in Tour mode: next/back, "ask about this", jump to step list (nav popup), Esc to exit (optionally restoring the starting view).

## Style sets hold views, tours, transitions, captions

Suffixes: graph documents `*.kidraw.yaml` / `.json` (semantics only); style sets `*.kd-style.yaml` / `.json` (presentation; composable via `imports` and the cascade). Proposed additions to the style-set schema:

```yaml
kdStyle: 1
imports: [base.kd-style.yaml]        # a tour layers on top of the normal look
views:
  mvp-blockers:
    frame: [n1, n5, n6]               # fit these elements (ids, not labels)
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

- **In memory is first-class:** agent-made views, captions, and tours start as unsaved in-memory style sets (like an unsaved graph), shown with a dirty indicator, saved on request, and kept in the localStorage draft for crash recovery.
- **Start inline:** multi-file save doesn't yet preserve style `imports` (dev-status), so start with inline style sets inside the graph doc (`styles: [{ name: …, … }]`), which already round-trip; move to separate `.kd-style` files once imports save correctly.
- **Activation:** "one top-level style active at a time" still holds — starting a tour activates a style set that imports the normal appearance and adds the tour's views and captions.

## Phase 2 — proposals with a real diff view (later)

Over the same channel, `propose(changes[])` renders an **in-app overlay** — ghost additions, strike-through deletions, before/after relabels — reviewed step by step like a tour. Accepting runs the normal command path (undoable, auto-saved). The unsolved design problem to tackle first is showing structural diffs legibly.

## Alternatives kept on file

- **VPS-hosted bridge** (earlier sketch): tab ↔ nginx-proxied bridge on the dev box ↔ stdio MCP server. Rejected in favor of everything-local.
- **Vault-file edits with the shipped 1.5 s `lastModified` poll** ([decision-vault-model](decision-vault-model.md)): fine for batch or offline edits, wrong for interactive tours.

## Open questions

- Channels are a research preview: flag names and availability may change; confirm current setup before building.
- Codex path: where Codex reads MCP config (user vs project), and whether to drive it via app-server or keep Codex terminal-only at first.
- Whether captions and suggestions, if they grow into two-way discussions, deserve their own annotation file kind rather than living in style sets.
- Should `views` frame by ids only, or also allow explicit viewports and saved layouts?
- Tab pairing with several tabs open; whether a tour restores the starting view on exit.

Related: [decision-vault-model](decision-vault-model.md), [idea-nav-popup](idea-nav-popup.md), [idea-diagram-types](idea-diagram-types.md), [idea-todo-graph-modeling](idea-todo-graph-modeling.md); file format in [`../docs/file-format.md`](../docs/file-format.md).
