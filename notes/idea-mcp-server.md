---
title: KiDraw MCP server — agent-guided tours first, proposals later
type: idea
---

# KiDraw MCP server — agent-guided tours first, proposals later

**Status:** sketch, revised 2026-09-14 (Ben + Claude). Not scheduled.

## Why

- Makes KiDraw a human–AI interaction medium you can actually see working.
- **Tour first (read-only):** the agent walks the user through an existing graph — moving the view, highlighting, captioning — while the user controls the pace from the keyboard. This tests the core loop (shared attention, pacing, user control) without the hard problem of showing diffs.
- **Proposals later:** agent-suggested edits need a real diff presentation (see "Phase 2"). The tour's live channel is the right foundation for that too.
- Job-search side benefit: a concrete "implemented tool calling / agents" example, with an optional LiteLLM/Bedrock path.

## Architecture

Three processes plus the model client. No polling anywhere on the live path.

```
 Ben's laptop                                   VPS (kidraw.dev.bnjmnbrmn.com)
 ┌──────────────────────────┐                   ┌─────────────────────────────────────────────┐
 │ Browser tab: KiDraw app  │   wss (push,      │ nginx  /agent-bridge ──► agent bridge        │
 │  AgentBridgeService      │◄──both ways)─────►│                          127.0.0.1:9223      │
 │  (dev-only, token-gated) │                   │                             ▲                │
 └──────────────────────────┘                   │                             │ ws (localhost) │
                                                │ Claude Code ──stdio──► kidraw-mcp (thin)     │
 Ben's chat UI (terminal / phone / desktop) ───►│   (spawns the MCP server per session)        │
                                                └─────────────────────────────────────────────┘
```

1. **KiDraw tab** (wherever Ben's browser is). A dev-only `AgentBridgeService`, gated on `DEBUG_CHANNEL` like the draft mirror, opens a WebSocket *out* to the bridge (browsers can't accept inbound connections). It sends a graph snapshot on connect and on every change, answers view queries, executes view commands, and forwards the user's tour keys.
2. **Agent bridge** (VPS, long-lived; started by `npm start` next to `tools/log-server.js`). A small Node WebSocket hub on `127.0.0.1:9223` that pairs agent sessions with tabs and relays messages. nginx proxies `/agent-bridge` to it with WebSocket upgrade headers, the same pattern as the existing `/debug-log` route.
3. **`kidraw-mcp`** (VPS, spawned over stdio by Claude Code for each session). A thin adapter: each MCP tool call becomes a request over a localhost WebSocket to the bridge, which routes it to the tab and returns the reply. It holds no state, so sessions and restarts don't collide on ports.

Why a separate bridge rather than having the MCP server listen directly: stdio MCP servers live and die with the chat session, and more than one session may be open. A stable daemon keeps the tab's connection alive across sessions and avoids port fights.

**Latency:** tool call → stdio (≈ms) → localhost ws (≈ms) → internet ws to the laptop (≈20–80 ms round trip) → the app's view tween (≈300 ms). The model's own thinking dominates (seconds). **Events from the user are pushed, not polled.**

**The one "waiting" primitive** is a blocking tool, `wait_for_user(timeout)`. The agent calls it after showing a step, and it returns the moment Ben presses a tour key. Under the hood it's a pending request resolved by a push event, not a timer loop. Claude Code's MCP tool timeout applies: use a modest timeout that returns `{action: "still_waiting"}`, and have the agent simply call again.

**Security:** kidraw.dev is publicly reachable, and a bridge can read the graph and drive the view. Require a random token (generated at bridge start, pasted into the tab once or passed as a URL param) and bind to loopback behind nginx. Dev-only; never in production builds.

## Phase 1 — tour tools (read-only)

All tools are label-first: fuzzy-resolved labels, with an error listing candidates when ambiguous, never raw ids.

**Read the live graph** (from the tab, so it's the real current state, not a possibly stale file):
- `get_outline()` — nodes (label, status/tags, notes), edges (`from → to`, labels), diagram type.
- `find_nodes(query)` — fuzzy search (reuse `src/app/lib/fuzzy-match.ts`).
- `neighborhood(label, depth = 1)` — incoming and outgoing edges.
- `get_view()` — what the user is looking at: crosshairs node, selection, viewport. Lets the agent start "from here".

**Guide the view** (no graph mutation, no undo entries, no dirty flag):
- `focus(label)` — animate crosshairs and view to a node.
- `frame(labels[])` — zoom to fit a set of nodes.
- `highlight(labels[] | path)` — glow nodes and edges (reuse the `navFocused` edge band).
- `caption(label, text)` / `clear_caption()` — narration shown beside the node, so Ben doesn't have to watch two windows.
- `wait_for_user(timeout)` → `{ action: next | back | stop | ask, text?, focusedNode? }`.

**In the app:** a Tour mode in the keymenu — `n`/`b` next/back, `?` to ask (small text input), Esc to end — plus a caption renderer. Existing pieces to lean on: `RECENTER_VIEW*`, `SEARCH_GRAPH`, `TRAVERSE_SMART`, the nav popup's auto-zoom framing, and the `navFocused` glow. New app work is mostly: focus-by-node-id and frame-a-set commands, the caption layer, tour-mode keys, and the bridge service.

**Demo (60 s):** "Walk me through what's blocking the MVP" → the view glides to *Pre-MVP*, captions explain, `n` advances along dependency edges, `?` asks "why is this one blocked?", and the agent answers in-caption.

## Phase 2 — proposals with a real diff view (later)

Build on the same channel, not on files:
- `propose(changes[])` sends a change set to the tab, which renders it as an **overlay layer** (ghost nodes and edges, strike-through for suggested deletions, before/after on relabels) without touching the graph.
- Review in Tour-like steps: accept or reject per change or per batch. Acceptance runs the normal command path, so it's undoable and auto-saves like any edit.
- Because proposals live in the app rather than in the file, there's no file polling and no "dirty session wins" clobber.
- **The hard design problem to solve first:** how to show structural diffs legibly — layout shifts, many-edge changes, deletions with dependents.

## Alternative kept on file: vault-file round trip

KiDraw's shipped vault already polls the open file's `lastModified` every 1.5 s and reloads external edits when the session is clean ([decision-vault-model](decision-vault-model.md)). A file-editing MCP server could use that with no app changes, but it's slow-ish (up to ~1.5 s), can't drive the view, loses to a dirty session, and only works where the vault directory lives (Ben's laptop). Fine for batch or offline edits; wrong for tours or interactive review.

## Later: an agent loop Ben writes, through a gateway

A small agent (TypeScript or Python) calling the same MCP tools through the Anthropic API — optionally via a local LiteLLM proxy, and Claude on Bedrock if an AWS account is available — adds model routing, usage and cost logging, and a real tool-calling loop Ben implemented himself.

## Open questions

- Tab pairing when several tabs are open: most recently focused tab wins, or explicit pairing via the token?
- Should the tour restore the user's original view when it ends?
- Caption placement and style: beside the node vs. a docked panel; how it coexists with the keymenu overlay.
- Where the agent's chat lives: external (Claude Code, phone) for Phase 1; an in-app panel later?
- Claude Code's MCP tool-timeout default, and how long `wait_for_user` should block before returning "still waiting".

Related: [decision-vault-model](decision-vault-model.md), [idea-nav-popup](idea-nav-popup.md), [idea-todo-graph-modeling](idea-todo-graph-modeling.md), [idea-diagram-types](idea-diagram-types.md).
