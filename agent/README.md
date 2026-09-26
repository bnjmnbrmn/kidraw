# kidraw-agent

Server for KiDraw agent mode (v0: read-only "ask and point"). A KiDraw tab
connects over a WebSocket; for each tab, `kidraw-agent` starts one agent
session (Codex via [codex-acp](https://www.npmjs.com/package/@agentclientprotocol/codex-acp))
and gives it a small set of canvas tools over MCP. The agent can read the
graph and point at things (focus, highlight, caption); it cannot change the
graph. Design: [`notes/idea-mcp-server.md`](../notes/idea-mcp-server.md).

```
KiDraw tab ──wss /agent/ (site auth + token)──▶ kidraw-agent ──ACP stdio──▶ codex-acp (container)
     ▲                                              │  ▲                          │
     └──────────── tool_call / tool_result ─────────┘  └──── MCP over HTTP ───────┘
```

## Two protocols, and why

The interesting part of this server is that it speaks both halves of the
agent-tooling stack, in opposite directions.

**ACP (Agent Client Protocol)** — `kidraw-agent` is the *client*; codex-acp is
the *agent*. ACP is how a host application drives an agent process: start a
session, send a prompt, stream updates back, arbitrate permission requests,
change settings, sign in. It runs over stdio to a process in a container.

**MCP (Model Context Protocol)** — `kidraw-agent` is the *server*. MCP is how
the model gets tools. The twist: the tools are not implemented here. Each
session gets its own MCP endpoint (`/mcp/<uuid>`, bearer secret), and a call
arriving there is forwarded over the WebSocket to **the browser tab**, which
runs it against a live Konva canvas and sends the result back. The model calls
`focus`, and the view moves on someone's screen.

So a tool call travels: model → codex-acp → MCP over HTTP → `McpBridge` →
`TabSession.invokeTool` → WebSocket → tab → canvas, and the result comes back
along the same path. `toolTimeoutMs` bounds the wait, and if the tab goes away
mid-call the pending call is rejected rather than left hanging.

### One turn, end to end

1. Tab sends `{type: "prompt"}`. `TabSession.prompt` records it in the
   `Transcript` and builds the text the agent sees — a preamble on the first
   turn, the detail level when it changes, then any nodes the user attached.
2. `session/prompt` goes out over ACP. The reply arrives as a stream of
   `session/update` notifications, relayed to the tab as `agent_text` deltas
   and `agent_activity` lines.
3. When the agent calls a canvas tool, codex-acp first asks permission
   (`session/request_permission`). `permissions.ts` decides, without asking
   the user — read, search, think, KiDraw's own tools and a narrow set of
   read-only shell commands are allowed; everything else is refused.
4. An allowed KiDraw tool goes out over MCP and comes back through the tab.
5. The turn ends with a `stop`, relayed as `turn_end`.

A failed prompt never produces a `stop`, so the update loop races the prompt's
own rejection — otherwise the turn would hang forever.

## Reading the source

| File | What it owns |
|---|---|
| `server.ts` | WebSocket server; origin, token and protocol checks; new vs resumed sessions; the session cap |
| `tab-session.ts` | One session: socket lifecycle and resume, the ACP connection, the prompt turn, the tool bridge |
| `transcript.ts` | What a session would have to say again if its tab came back |
| `prompt-text.ts` | What goes with each message: the preamble, the detail level when it changes, what the user points at |
| `tool-calls.ts` | Canvas tool calls waiting on the tab, with their timeouts |
| `agent-controls.ts` | The model picker and the device-code sign-in, both over stock ACP |
| `mcp-bridge.ts` | Per-session MCP endpoints; routes a tool call to exactly one tab |
| `tools.ts` | The canvas tool schemas and the prompt preamble — the agent's whole view of KiDraw |
| `permissions.ts` | What the agent is allowed to do, decided server-side |
| `runners.ts` | How an agent process is started: `docker` (sandboxed), `local`, `fake`; per-session Codex homes |
| `protocol.ts` | The tab ⇄ server wire format. Mirrored in `src/app/agent/agent-protocol.ts`; a test fails if they drift |
| `config.ts` | Environment configuration and the shared token |
| `fake-agent.ts` | A scripted ACP agent, so the tests need no model and no credits |

## Nothing is sent anywhere by default

KiDraw has no built-in endpoint. A user must add an endpoint and token in the
agent panel, then approve sharing each graph (once, or always for that graph)
before anything leaves the browser.

## Security model

- **Tab → server:** the WebSocket accepts only allowlisted browser origins and
  requires the access token as its first message. On the VPS it also sits
  behind the site password (nginx).
- **Server → agent:** with the `docker` runner each session runs in a
  throwaway container (capabilities dropped, memory, CPU and process limits).
  The host directories it sees are the session's private Codex home and, only
  when `KIDRAW_AGENT_SOURCE_DIR` is set, that source tree read-only at
  `/workspace/source`. Hidden inside the source mount: the dev debug log and
  graph mirror (`tools/debug.log`, `tools/draft-mirror.json`, which hold the
  user's activity) and build and dependency directories. The Codex home is a
  copy of kidraw-agent's login plus a `config.toml` that
  turns off history, memories and web search, so nothing from one graph's
  session reaches another. A login the session refreshes or makes is copied
  back, and the home is deleted when the session ends. At most `KIDRAW_AGENT_MAX_SESSIONS`
  sessions run at once. Containers can still reach the network; limiting that
  to the model provider is not done yet.
- **Reloads and dropped connections:** a session outlives its socket for
  `KIDRAW_AGENT_RESUME_GRACE_MS` (10 minutes by default). The `ready` message
  gives the tab a session id and secret, which it keeps in `sessionStorage`
  (that tab only) and presents to pick the conversation back up. Disconnecting
  on purpose ends the session at once.
- **Tab → agent settings:** the chat can change only the settings listed in
  `TUNABLE_OPTIONS` (`tab-session.ts`): the model and its reasoning effort. The
  agent offers its sandbox mode the same way, and that is never passed on, so
  no tab can take a session out of read-only. The chat can also sign the server
  in to its provider — see below.
- **Agent → canvas:** tools go through a per-session MCP URL with a bearer
  secret, and are marked read-only. Codex starts in read-only mode.
  kidraw-agent approves only read, search and think requests, calls to
  KiDraw's own tools, and shell commands that only read files under
  `/workspace` (`cat`, `sed -n`, `grep`, `rg`, `find` without actions, `git
  log`/`show`/`diff` and the like, with no redirection, substitution or paths
  outside `/workspace`). It refuses everything else: edits, other commands,
  fetches, requests for extra sandbox permissions, and anything it doesn't
  recognize (`src/permissions.ts`).

## Setup (Linux host with Docker)

```bash
cd agent
npm install && npm run build
docker build -t kidraw-agent-codex:latest docker

# Log kidraw-agent in to Codex with its own login (separate from ~/.codex):
CODEX_HOME=~/.config/kidraw-agent/codex codex login --device-auth

sudo cp deploy/kidraw-agent.service /etc/systemd/system/   # edit paths first
sudo systemctl daemon-reload && sudo systemctl enable --now kidraw-agent
cat ~/.config/kidraw-agent/token                            # paste into KiDraw
```

nginx, inside the KiDraw site's `server` block:

```nginx
# Also add `location = /agent { ...same lines... }`: without it, nginx answers
# /agent (no slash) with a 301, and browsers don't follow redirects for WebSockets.
location /agent/ {
    proxy_pass http://127.0.0.1:9223/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 1h;
}
```

In KiDraw press `m` (Agent Chat), enter the endpoint (for example
`wss://kidraw.net/agent/`) and the token, then approve sharing
the graph. `o` asks about the current selection; Shift+O follows the agent's view
after you have moved away; Shift+M closes the chat. The message box types like
a node label, vim keys included: Enter sends, Ctrl+C stops the agent, and Esc
twice (insert → normal → canvas) returns the keyboard to the canvas.

## Model, and signing in from the chat

Under the message box the panel shows the settings the agent offers — which
model answers, and how hard it thinks. Changing one applies to this session and
is remembered for the next.

"Account…" signs this server's agent in to its provider without a browser on
the server: the agent gives a page to open and a one-time code, the chat shows
both, and the login finishes once the code is entered. "Use a different
account" signs out first, which is the only way to reach another account —
canceling after that leaves the server signed out until a sign-in finishes. A
login made this way is kept in `KIDRAW_AGENT_CODEX_HOME` for later sessions.

Anyone holding the access token can do this, and it moves which account the
server spends. The equivalent from a shell is still there:

```bash
CODEX_HOME=~/.config/kidraw-agent/codex codex login --device-auth
```

## Configuration

| Variable | Default | |
|---|---|---|
| `KIDRAW_AGENT_RUNNER` | `local` | `docker` (sandboxed), `local` (codex-acp as your user; development only), `fake` (tests) |
| `KIDRAW_AGENT_HOST` / `_PORT` | `127.0.0.1` / `9223` | tab WebSocket |
| `KIDRAW_AGENT_MCP_HOST` / `_MCP_PORT` | `127.0.0.1` / `9224` | MCP bridge; use the docker0 address (e.g. `172.17.0.1`) for `docker` |
| `KIDRAW_AGENT_MCP_ADVERTISED_HOST` | `host.docker.internal` for `docker`, else the MCP host | host name agents use |
| `KIDRAW_AGENT_ORIGINS` | `http://localhost:4200` | browser origins allowed to connect, comma-separated (e.g. `https://kidraw.net`) |
| `KIDRAW_AGENT_TOKEN_FILE` | `~/.config/kidraw-agent/token` | created (mode 600) on first start |
| `KIDRAW_AGENT_CODEX_HOME` | `~/.config/kidraw-agent/codex` | kidraw-agent's Codex login; sessions get private copies in the sibling `sessions/` |
| `KIDRAW_AGENT_MAX_SESSIONS` | `3` | sessions held at once, including ones waiting for their tab |
| `KIDRAW_AGENT_DOCKER_IMAGE` | `kidraw-agent-codex:latest` | |
| `KIDRAW_AGENT_SOURCE_DIR` | unset | a source tree the agent may read (mounted read-only at `/workspace/source`), e.g. so it can explain the code |
| `KIDRAW_AGENT_TOOL_TIMEOUT_MS` | `30000` | how long a tool waits for the tab |
| `KIDRAW_AGENT_RESUME_GRACE_MS` | `600000` | how long a session waits for its tab to reconnect |

## Development

```bash
npm run build && npm test          # session tests use the fake agent
KIDRAW_AGENT_RUNNER=fake npm start # scripted agent: "TOOL get_outline {}", "FAIL", or echo
```
