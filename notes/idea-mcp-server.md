---
title: KiDraw agent mode — two tiers, model-agnostic, tours, shared pointing
type: idea
---

# KiDraw agent mode — two tiers, model-agnostic, tours, shared pointing

**Status:** sketch, revised 2026-09-14 (Ben + Claude), fifth pass. Not scheduled.

## Goals (Ben, 2026-09-14)

- **Chat in the browser**, sooner rather than later.
- **Everything local**, and **as seamless as possible** to install and start.
- **Model-agnostic:** Claude Code and Codex are examples, not requirements.
- **One agent per tab.**
- **Tours first (read-only)**, with step forward/back; the AI may revise a tour in response to a question. Proposed edits come later and need a real diff presentation.
- **Shared pointing:** both the user and the AI can point at things on the canvas and ask each other questions, especially to make suggestions.
- **Captions sit next to the objects they annotate**; otherwise near the bottom of the window.
- **Views are primarily explicit viewports.** Views, tours, transitions, and captions live in style sets (`*.kd-style.yaml` / `.json`), which may exist only in memory.
- **Discussions** might become their own file type; play it by ear.

## Two tiers

**Tier 0 — nothing to install.** The agent loop runs *inside the KiDraw tab*. The user picks a provider in KiDraw's settings (Anthropic, OpenAI, OpenRouter, Google, … or a local Ollama / LM Studio URL), pastes an API key if one is needed, and the chat panel works immediately. Canvas tools are ordinary functions in the page.

**Tier 1 — one helper app, `kidraw-agent`.** For people who want to use an agent they already have installed (Claude Code, Codex, Gemini CLI, Goose, …), usually with their existing subscription or login instead of an API key. Both tiers share the same chat panel, tools, captions, and tours; only where the "brain" runs differs.

A **companion app** is the general term for a small helper program installed alongside a web app, so the web app can do things a browser can't (the 1Password desktop app behind its browser extension is the same pattern). Here, "the companion" and `kidraw-agent` are the same thing.

## Tier 0 in detail: the in-tab agent loop

**Where it runs:** in the browser tab, as JavaScript. No server of any kind.

**What it does**, per chat message:
1. Build the request: system prompt ("you are guiding a user through a KiDraw graph…"), the conversation so far, and the canvas tool definitions (name, description, JSON Schema).
2. Send it to the chosen model's API and stream the reply into the chat panel.
3. If the model asks to call tools (e.g. `focus("Pre-MVP")`, `caption(…)`), run them against the canvas, append the results to the conversation, and send again.
4. Repeat until the model answers with plain text and no more tool calls. Stop early on a step limit or when the user presses Esc; show a running token/cost count.

**Model-agnostic:** one provider-adapter layer over the main APIs (Anthropic Messages, OpenAI-compatible chat completions, which also covers OpenRouter, Ollama, LM Studio, and LiteLLM proxies). A multi-provider SDK that runs in the browser could supply this.

**Constraints:**
- The browser must be allowed to call the API directly. Anthropic supports this with an opt-in `anthropic-dangerous-direct-browser-access` header; OpenAI-compatible providers vary; local servers need CORS enabled for the KiDraw origin (e.g. `OLLAMA_ORIGINS`) plus Chrome's one-time Local Network Access prompt.
- Keys live in the user's own browser storage ("bring your own key"). Acceptable for a local tool; offer "don't remember this key" for shared machines.
- Costs are pay-per-use API billing, not a chat subscription.
- The agent only has KiDraw's tools, not a shell or the file system — which is also a safety feature.

## Tier 1 in detail: `kidraw-agent`

### Install and start (aim: two clicks after the first time)

1. **Install once.** A single self-contained download (Homebrew, a Windows installer, or a curl script; Node bundled so none is required), or `npm i -g kidraw-agent` for developers. First run asks, "Where is your KiDraw vault?" (it can't learn this from the browser, which hides real folder paths), and offers to:
   - **start at login** as a background service, and
   - **register a `kidraw-agent://` link handler**, so the page can start it with one click.
2. **Connect from KiDraw.** Agent menu → **Connect**. KiDraw looks for `.kidraw/agent.json` in the vault.
   - Found → connect.
   - Not found → a **Start kidraw-agent** button opens `kidraw-agent://start` (the browser asks "Open kidraw-agent?" the first time); if no handler is installed, show a copy-able command instead.
3. **Chrome asks once** to allow local network access for the KiDraw site.
4. **Pick an agent.** KiDraw lists the agents `kidraw-agent` found on the machine, e.g. "Claude Code ✓", "Codex — sign-in needed", "Gemini CLI ✓". Adapters for Claude and Codex download automatically on first use. Sign-in uses each agent's own login (via ACP `authenticate`).
5. **Chat.** Each tab that opens the chat panel gets its own agent session.

### Components and message flow

- **Rendezvous:** `kidraw-agent` listens on a random loopback port and writes `.kidraw/agent.json` (`{ port, token, pid }`) into each registered vault. The tab reads it through its existing FSA grant and connects with the token, so only someone who can read the vault can connect. It checks when the vault connects, on Connect, and via `FileSystemObserver` where available.
- **Tab ↔ companion:** a loopback WebSocket, pushed both ways (no polling). Fallback: an append-only JSON-lines mailbox under `.kidraw/agent/`.
- **Sessions:** one per tab. For each, `kidraw-agent` starts the chosen agent as a child process (or reuses one that can host several sessions) and speaks **ACP** to it over stdio: `initialize` → `session/new { cwd: vault, mcpServers: [KiDraw tools] }` → `session/prompt` per chat message → `session/cancel` on Esc.
- **Replies:** the agent streams `session/update` notifications (message text, tool-call progress, plans); `kidraw-agent` relays them to the tab.
- **Canvas tools:** `kidraw-agent` gives each session its own MCP server (HTTP on loopback with a per-session path, or a tiny stdio shim that connects back). When the agent calls `focus` or `caption`, the call goes MCP → `kidraw-agent` → WebSocket → the right tab, which runs it and returns the result the same way.
- **Permissions:** the agent's `session/request_permission` requests become an approval prompt in the tab.
- **Files:** agents can ask the client to read and write files (`fs/read_text_file`, `fs/write_text_file`); `kidraw-agent` confines these to the vault.
- **Also available:** Tier 0's loop can run inside `kidraw-agent` instead of the tab, for local models without CORS setup or to keep API keys out of the browser.
- **Optional, agent-specific integrations** (not the core): Claude Code channels (research preview) and Codex's app-server JSON-RPC, for attaching an already-running terminal session.

## Tier 1 trade-offs (2026-09-14)

**For:** uses subscriptions people already pay for instead of per-token API billing; the agent brings far more than canvas tools (shell, files next to the graph, web search, the user's own configured MCP servers, instructions, and skills); mature agent harnesses (planning, context management); API keys stay out of the browser; local models without CORS setup.

**Against:** an install step and per-OS packaging (binary, login service, link handler, updates); a local server and an agent with shell access widen the security surface, so permission prompts matter; Chrome's local-network prompt; ACP adapters and research-preview features are still moving; agents differ in session and MCP support; Chromium-only rendezvous (FSA); nothing for phones, tablets, or visitors who won't install software.

## Tier 2 (optional): a KiDraw agent on a remote machine

The brain's location is swappable, because canvas tools always run in the tab and the tab sends graph state to whichever agent it's talking to:

- **Tier 0:** the loop runs in the tab.
- **Tier 1:** an installed agent, via `kidraw-agent`.
- **Tier 2:** KiDraw's *own* agent loop runs on a server (Ben's VPS, or later a hosted service); the tab connects over HTTPS (WebSocket or SSE) with a login or token.

Tier 2 is the textbook AG-UI case: a remote agent backend streaming events to a web frontend that defines and runs its own tools. The agent needs no vault access; the tab sends an outline or state snapshot plus deltas.

**Makes sense for:** agent-side logic Ben controls (tour planning, memory of past tours and discussions), API keys kept server-side, heavier compute or a GPU box for local models, background work that outlives a tab, use from a phone with nothing installed, and eventually a hosted product (the deferred cloud vault's natural partner).

**Costs:** graph content leaves the user's machine (privacy; conflicts with "everything local" as the default), auth and multi-user security, hosting costs, and reconnect/resume handling. Latency is not the issue: a network hop is small next to model time.

## MCP, ACP, AG-UI — which does what

- **MCP (Model Context Protocol):** connects an agent to **tools and data**. The agent is the client; tool servers answer. KiDraw's canvas tools are exposed to agents this way.
- **ACP (Agent Client Protocol):** connects a **user-facing app to an agent** ("LSP, but for agents"; JSON-RPC over stdio, reusing MCP's JSON shapes where possible). The app is the client and drives the agent's conversation: prompts, streamed updates, tool-call progress, permission requests, diffs, and file and terminal access delegated to the app. `kidraw-agent` uses ACP to talk to installed agents.
- **AG-UI (Agent–User Interaction Protocol):** connects an **agent backend to a web frontend** as a stream of typed events: run lifecycle, streaming text, tool calls (start/args/end/result), state snapshots and JSON-Patch deltas, message snapshots, reasoning, and custom events. It also has **frontend-defined tools** (passed in `RunAgentInput.tools` and executed by the UI) and human-in-the-loop interrupts. Open protocol from CopilotKit, with integrations in Microsoft Agent Framework, Google ADK, AWS Strands, and Bedrock AgentCore.
- **How they stack in KiDraw:** tab ⇄ (AG-UI-style events) ⇄ `kidraw-agent` ⇄ (ACP) ⇄ agent ⇄ (MCP) ⇄ KiDraw canvas tools. Tier 0 emits the same event shapes internally, so the chat and tour UI is identical in both tiers. Adopting AG-UI outright vs. just mirroring its event shapes is open.

## Shared pointing and questions

**One reference model for both parties.** `Ref = { kind: node | edge | edge-label | waypoint | region | point, id, label, coords? }`. Files and the wire use ids; everything shown to people uses labels.

**Reference pills:** small rounded tokens inside chat text that name a canvas object (like the tag pills in the nav popup). Selecting one glows the object and moves the view to it.

**User → AI**
- Point with what already exists: selection, area select, the crosshairs.
- "Ask about this" key: opens the chat input with the selection attached as reference pills.
- Type `@` for a fuzzy finder (reuse the nav popup / `fuzzy-match.ts`) that inserts a pill.

**AI → user** (tools)
- `point(refs, note?)` — pulse or glow the targets, with an optional caption.
- `ask(question, refs, options?)` — a caption beside the targets with keyboard-selectable answers.
- `suggest(refs, text, change?)` — a suggestion annotation; text-only until the Phase 2 diff overlay exists.
- Replies can embed references (e.g. `[[ref:da-12]]`), rendered as pills.

**Read tools:** `get_outline`, `find_nodes`, `neighborhood`, `get_view`, `get_selection` — from the live tab, not the file.

## Captions

- **Anchored first:** beside the anchor (node, edge midpoint, label, or region centroid), on a side that avoids neighbors and other captions, with a short leader line when offset. Positioned from world coordinates, drawn at constant screen size.
- **Docked fallback:** when the anchor is off-screen, crowded, or zoomed too far out, the caption moves to a bottom dock with a direction indicator and a "go there" key.
- Captions are annotations, never graph content.

## Tours

- A tour is data: `steps[]`, each `{ view, highlights, captions, transition }`.
- **Definition vs. visit history:** back and forward walk the steps actually shown, so they stay exact even if the definition changes.
- **The AI can revise a tour mid-tour** — insert, replace, reorder, or drop upcoming steps (`update_tour(ops)`) — with a brief "Tour updated" notice, undoable.
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

- **Views are explicit viewports**, stored as a world-space rectangle so they look the same across window sizes; `fit` handles a different aspect ratio. A `frame: [ids]` option can come later.
- **In memory is first-class:** agent-made views, captions, and tours start as unsaved in-memory style sets, saved on request, kept in the localStorage draft for crash recovery.
- **Start inline:** multi-file save doesn't yet preserve style `imports` (dev-status), so start with inline style sets inside the graph doc.
- **Activation:** a tour activates a style set that imports the normal appearance and adds its views and captions.

## Discussions (play by ear)

The conversation, with its references and suggestions, stays in memory per tab for now. If saving and resuming proves useful, consider a separate discussion file type.

## Phase 2 — proposals with a real diff view (later)

`propose(changes[])` renders an **in-app overlay** — ghost additions, strike-through deletions, before/after relabels — reviewed step by step like a tour. Accepting runs the normal command path (undoable, auto-saved). Showing structural diffs legibly is the design problem to tackle first.

## Alternatives kept on file

- **VPS-hosted bridge** (earlier sketch): rejected in favor of everything-local.
- **Vault-file edits with the shipped 1.5 s `lastModified` poll** ([decision-vault-model](decision-vault-model.md)): fine for batch or offline edits, wrong for interactive tours.

## Open questions

- ACP: whether target agents host several sessions per process, and how each adapter handles client-supplied `mcpServers` (HTTP vs stdio).
- AG-UI: adopt outright for tab ↔ companion, or mirror its event shapes in a minimal custom protocol.
- Tier 0: which provider SDK to use in the browser; per-provider CORS behavior.
- `kidraw-agent` packaging: single binary vs npm; login service and `kidraw-agent://` handler per OS.
- Whether a tour restores the starting view on exit.

Related: [decision-vault-model](decision-vault-model.md), [idea-nav-popup](idea-nav-popup.md), [idea-diagram-types](idea-diagram-types.md), [idea-todo-graph-modeling](idea-todo-graph-modeling.md); file format in [`../docs/file-format.md`](../docs/file-format.md).
