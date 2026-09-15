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

## Nothing is sent anywhere by default

KiDraw has no built-in endpoint. A user must add an endpoint and token in the
agent panel, then approve sharing each graph (once, or always for that graph)
before anything leaves the browser.

## Security model

- **Tab → server:** the WebSocket accepts only allowlisted browser origins and
  requires the access token as its first message. On the VPS it also sits
  behind the site password (nginx).
- **Server → agent:** with the `docker` runner each session runs in a
  throwaway container (no repo, no host files, capabilities dropped, memory,
  CPU and process limits). The only host directory it sees is
  kidraw-agent's own Codex home.
- **Reloads and dropped connections:** a session outlives its socket for
  `KIDRAW_AGENT_RESUME_GRACE_MS` (10 minutes by default). The `ready` message
  gives the tab a session id and secret, which it keeps in `sessionStorage`
  (that tab only) and presents to pick the conversation back up. Disconnecting
  on purpose ends the session at once.
- **Agent → canvas:** tools go through a per-session MCP URL with a bearer
  secret. Codex starts in read-only mode; kidraw-agent auto-approves only
  read/search/think/fetch permission requests and refuses edits and commands.

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
`wss://kidraw.dev.bnjmnbrmn.com/agent/`) and the token, then approve sharing
the graph. `o` asks about the current selection; `t` follows the agent's view
after you have moved away.

## Configuration

| Variable | Default | |
|---|---|---|
| `KIDRAW_AGENT_RUNNER` | `local` | `docker` (sandboxed), `local` (codex-acp as your user; development only), `fake` (tests) |
| `KIDRAW_AGENT_HOST` / `_PORT` | `127.0.0.1` / `9223` | tab WebSocket |
| `KIDRAW_AGENT_MCP_HOST` / `_MCP_PORT` | `127.0.0.1` / `9224` | MCP bridge; use the docker0 address (e.g. `172.17.0.1`) for `docker` |
| `KIDRAW_AGENT_MCP_ADVERTISED_HOST` | `host.docker.internal` for `docker`, else the MCP host | host name agents use |
| `KIDRAW_AGENT_ORIGINS` | `https://kidraw.dev.bnjmnbrmn.com,http://localhost:4200` | allowed browser origins |
| `KIDRAW_AGENT_TOKEN_FILE` | `~/.config/kidraw-agent/token` | created (mode 600) on first start |
| `KIDRAW_AGENT_CODEX_HOME` | `~/.config/kidraw-agent/codex` | Codex login used by sessions |
| `KIDRAW_AGENT_DOCKER_IMAGE` | `kidraw-agent-codex:latest` | |
| `KIDRAW_AGENT_TOOL_TIMEOUT_MS` | `30000` | how long a tool waits for the tab |
| `KIDRAW_AGENT_RESUME_GRACE_MS` | `600000` | how long a session waits for its tab to reconnect |

## Development

```bash
npm run build && npm test          # session tests use the fake agent
KIDRAW_AGENT_RUNNER=fake npm start # scripted agent: "TOOL get_outline {}", "FAIL", or echo
```
