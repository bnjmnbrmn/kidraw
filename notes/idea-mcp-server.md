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

## Build order (leaning, 2026-09-14)

1. **Tier 2 first:** a user-run `kidraw-agent` on a server *the user* controls (for Ben's own use, his VPS), which the user configures in KiDraw and reaches over authenticated `wss://`; it drives subscription agents over ACP. Satisfies: chat in the browser, model-agnostic agents, subscription billing, no API keys, no agent on the laptop, works from any device. **KiDraw ships with no agent endpoint configured and sends nothing anywhere until a user adds one** (see "Opt-in and configuration" under Tier 2).
2. **Tier 1 later, if other users want it:** the same code with a loopback transport and vault rendezvous; the real cost is per-OS packaging, not logic.
3. **Tier 0 deferred:** a separate code path (in-browser loop, provider adapters, key handling, CORS). Worth it only for zero-install users, and the MCP App route may serve casual users better.

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

## Tier 2 — remote `kidraw-agent` (first target, 2026-09-14)

**Ben's framing:** Tier 2 is Tier 1 moved to a server the user controls. Same `kidraw-agent`, same ACP to installed agents, same MCP tool routing back to the tab — the user just gives KiDraw an endpoint. The point is **not running an agent with shell access on the laptop**. Ben's instance runs on the Hetzner VPS.

**Opt-in and configuration (Ben, 2026-09-14): never send a user's data to someone else's server.**
- **No default endpoint.** No build of KiDraw — dev or production — has an agent endpoint baked in, and AI features stay off until the user configures one. Ben's VPS is just Ben's own configuration, never a default for other users.
- **The user adds endpoints** in Settings → Agent → Add endpoint: a URL, a display name, and an authentication method:
  - **pairing code → per-device token** (default; see Authentication below);
  - **pasted bearer token** (scripts, headless setups);
  - **network-level only** (e.g. tailnet-only endpoints), with an explicit "this endpoint has no app-level auth" warning;
  - later, **OAuth/OIDC** for endpoints run by an organization or a hosted service.
- **Stored per browser profile** (IndexedDB), removable, with tokens revocable on the server.
- **Consent per graph.** The first time a graph would be sent to an endpoint, ask: "Share *Next* with *ben-vps*?" (once / always for this graph / no). The answer is stored with the endpoint configuration, not in the graph file, so opening a shared file never silently connects anywhere.
- **Always visible:** a header indicator while connected ("Agent: *ben-vps*"), with one key to disconnect.
- **Server side:** `kidraw-agent` refuses unauthenticated connections and only accepts the KiDraw origins its operator lists (e.g. `kidraw.net`, a self-hosted copy, or the dev site).
- **Precedent:** the dev draft mirror is already compiled out of production builds (`DEBUG_CHANNEL`). Agent code differs in that it *does* ship, but it is inert until configured.
- **Related dev-site gap (fixed 2026-09-14):** `kidraw.dev.bnjmnbrmn.com` was publicly reachable without login while its dev build mirrors every remote session's draft to the VPS (`/debug-log/draft`). The nginx site now requires HTTP basic auth (`/etc/nginx/kidraw-dev.htpasswd`, user `ben`); local tools that use `localhost:4200` are unaffected.

This works because canvas tools always run in the tab and the tab supplies graph state; the agent never needs to reach the laptop.

**What changes from Tier 1**
- **Discovery:** the user enters an endpoint URL once; no vault rendezvous file.
- **Transport:** `wss://` over TLS through nginx. For Ben, simplest is a path on the existing dev site (e.g. `kidraw.dev.bnjmnbrmn.com/agent/`, proxied to `127.0.0.1:<port>` like `/debug-log`): same origin as the app, so no CORS and no Chrome local-network prompt. Other users' endpoints are cross-origin and rely on tokens plus an Origin allowlist.
- **Sessions:** still one per tab, but kept alive server-side for a while, so a tab reload or a flaky connection resumes the same conversation.
- **Files:** the server can't see the laptop's vault. Tours don't need it (the tab sends state). If an agent needs files, sync the vault to the server (e.g. git; `meta-project/kdvault` already versions a copy), or route writes through Phase 2 proposals in the tab.
- **Billing:** subscription agents logged in on the server (Claude Code with Ben's plan, Codex with a ChatGPT login). Caveat: Claude driven through the ACP adapter (built on the Agent SDK) may count against the capped Agent SDK credits rather than the main plan; a Claude Code channels adapter would use the main plan. Verify before relying on either.

**Authentication (browser → remote `kidraw-agent`)**
- **Pairing, then a device token.** `kidraw-agent pair` prints a short-lived code (or QR code). In KiDraw: Agent → Connect remote → enter URL + code → the server returns a long-lived, per-device, revocable token stored in the browser.
- Browsers can't set custom headers on a WebSocket, so send the token in the first message (or via the `Sec-WebSocket-Protocol` trick), never in the URL, which lands in logs.
- **Check the `Origin`** header against an allowlist (the KiDraw origins), rate-limit pairing attempts, and keep a revoke list per device.
- **Defense in depth for Ben:** optionally expose the endpoint only on a Tailscale tailnet (works on phone and laptop), so it isn't reachable from the public internet at all.
- Later, for a hosted product: proper OAuth 2.1 with `kidraw-agent` (or a hosted service) as the authorization server.

**"Not on my laptop" isn't automatically safe.** The VPS also holds the meta-project, GitHub and Google credentials, and a `bypassPermissions` Claude Code service. Run `kidraw-agent` sessions as a **dedicated Unix user, ideally in a container**, with a per-session working directory, no access to other users' credentials, and permission requests routed to the tab. For read-only tours, allow only KiDraw's MCP tools (no shell) by default.

**Costs:** graph content leaves the user's machine (to a server they control); someone has to run and maintain that server; a public endpoint needs real auth. Latency is not the issue: a network hop is small next to model time.

**Relation to AG-UI:** a remote agent backend streaming events to a web frontend that defines and runs its own tools is the textbook AG-UI case.

## Other options, and subscription billing (checked 2026-09-14)

**1. KiDraw as an MCP App inside Claude / ChatGPT** (how the Excalidraw connector works). KiDraw ships an MCP server whose tools return **interactive UI** that the chat client renders in a sandboxed iframe — the MCP Apps extension, official since 2026-01-26, co-authored by Anthropic and OpenAI, supported in Claude, VS Code, Goose, and rolling out in ChatGPT. Excalidraw offers both a cloud connector and a local server.
- **Billing:** the user's Claude or ChatGPT subscription pays for the model. This is the sanctioned subscription path.
- **OAuth direction:** the chat app signs in to *KiDraw's* server (MCP authorization), not KiDraw to the user's AI account.
- **Trade-offs:** the chat lives in Claude or ChatGPT, not KiDraw; KiDraw becomes a widget in an iframe (keyboard-first UX and focus are constrained); a remote connector needs hosting and accounts, and graph data flows to KiDraw's server and the AI provider. A **local variant** — a local MCP server or extension for Claude Desktop — avoids hosting but is Claude-Desktop-only.

**2. WebMCP.** The KiDraw page registers its canvas tools with `document.modelContext.registerTool({ name, description, inputSchema, execute })`, and any browser-integrated agent can call them with the user's own plan. Cheap for KiDraw, because the tools already live in the page. **Status:** Chrome origin trial (149–156); Edge behind a flag; as of July 2026 no mainstream agent consumes the tools yet (Google says Gemini in Chrome will). Worth adding once it's real, not worth waiting for.

**3. Signing in to a model provider for billing.**
- **Anthropic:** consumer (Free/Pro/Max) OAuth tokens are only for Claude Code and Claude.ai; server-side enforcement since January 2026. Since May 2026, subscriptions include separate, capped, non-rollover **Agent SDK credits** for third-party agents ($20 Pro, $100 Max 5×, $200 Max 20× per month). So a Tier 1 agent built on the Agent SDK (the Claude ACP adapter is) likely draws on those credits; a browser tab can't use the subscription directly. Confirm the mechanism before relying on it.
- **OpenAI:** "Sign in with ChatGPT" (announced May 2025) only ships inside Codex tooling, and sign-in is identity, not API billing. A subscription-sharing scheme has been reported but not announced. Codex OAuth in third-party apps works unofficially — don't build on it.
- **OpenRouter:** a real OAuth (PKCE) "Connect OpenRouter" flow that hands the app a user-controlled key across many models. Pay-per-use credits, not a subscription, but it removes key copy-pasting from Tier 0.

**Summary:** subscription billing is available through MCP Apps (chat in Claude/ChatGPT), Tier 1 (official agents; Anthropic's capped Agent SDK credits), and eventually WebMCP. Tier 0 in the tab stays pay-per-use (bring your own key, or OpenRouter OAuth).

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

## Control of the view

The user must always be able to take the view back, and hand it over again:
- **Following:** the agent or tour drives the camera.
- **Free:** the user drives; the agent's `focus`/`frame` requests become indicators (an edge-of-screen arrow, "Agent is showing *Pre-MVP* — press `F` to follow") instead of moving the view.
- Any manual pan, zoom, or navigation key switches to Free immediately; tour next/back or the Follow key switches back. Agent view commands are ignored briefly after user input, so there's no camera fight.
- The reverse — "look at what I'm looking at" — lets the agent follow the user's view.

This is the same follow model multiplayer needs; see [idea-multiplayer-readiness](idea-multiplayer-readiness.md), which also covers why the agent should be treated as just another participant.

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

## Phase 1.5 — agents change the graph, with tracked changes (soon; Ben, 2026-09-14)

Ben wants agents making *any* changes soon — edits, moves, and deletions, not just additions.

**Undecided — the change model (Ben, 2026-09-14: "best of both worlds", but not yet).** Three separate questions often get lumped together as "git vs Google Docs":
1. **Granularity:** atomic change sets (commits) vs a continuous stream of small edits.
2. **Timing:** review before applying (pull request / suggesting mode) vs apply, then review and revert (tracked changes).
3. **Isolation:** the agent works on its own copy (a branch) vs directly in the shared live graph.

A likely "best of both": the agent edits live in **its own layer** that the user watches update in real time (Docs' suggesting mode), grouped into **named change sets** accepted or rejected as a whole or per change (git's commits and review). None of the read-only tour or pointing work depends on this choice, as long as changes are represented as **operations** (below), which support any of these models.

The sketch below is one option — **apply directly and track**:

**One tool:** `apply_changes(ops[])`, applied as one batch through the tab's normal command path (undoable, auto-saved). Op kinds:
- `add_node { tempId, label, notes?, tags?, near? }`, `add_edge { from, to, label?, directed? }` (`from`/`to` take existing labels or `tempId`s from the same batch)
- `update_node { ref, label?, notes?, tags?, status? }`, `update_edge { ref, from?, to?, label?, directed? }`
- `move_node { ref, near? | relativeTo? }` — relational; KiDraw computes coordinates
- `delete_node { ref }` (and its edges), `delete_edge { ref }`

**Safe with a user editing at the same time:** every update, move, and delete carries the values the agent expects (e.g. `expect: { label: "Pre-MVP" }`). If the user already changed that item, the op is rejected as a conflict and reported back instead of overwriting. The tab is the source of truth; the agent sees results through state deltas.

**Showing what changed** (until reviewed):
- **Added:** glow plus an "agent" badge.
- **Edited:** highlighted; the review shows before → after (old label struck through beside the new one, old → new status pill, old → new edge endpoints).
- **Moved:** a faint ghost at the old position with an arrow to the new one.
- **Deleted:** a translucent, struck-through ghost left in place (with its edges) until reviewed.

**Review = a tour through the batch:** step through changes with the Tour UI (captions explain each one); per change **keep** or **revert**; per batch **keep all** or **revert all** (= undo). Per-change revert needs an op log with inverse ops, not just whole-batch undo.

**Trust settings per tab:** e.g. apply adds and edits directly but require approval for deletions; or "suggest first" for everything, using the Phase 2 overlay once it exists. A snapshot before each batch backs up the tracked-changes model.

**Placement is KiDraw's job:** agents describe relationships (`near`, edges); KiDraw picks coordinates (next to the anchor using the diagram type's card size, then an optional local layout pass).

## Phase 2 — "suggest first" with a real diff view (later)

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
