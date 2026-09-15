# Sandbox for one KiDraw agent session: codex-acp speaking ACP on stdio.
# The container sees no repo and no host files except kidraw-agent's own Codex
# home (its login, mounted at ~/.codex by runners.ts). Its only way to act on
# a graph is the KiDraw MCP bridge on the host.
#
#   docker build -t kidraw-agent-codex:latest agent/docker
FROM node:22-slim

ARG CODEX_ACP_VERSION=1.11.0

# The codex binary needs system CA certificates to reach OpenAI.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g "@agentclientprotocol/codex-acp@${CODEX_ACP_VERSION}" \
 && npm cache clean --force

# Mount point for the Codex home, owned by node (uid 1000, matching the host
# user that owns the mounted directory).
RUN mkdir -p /home/node/.codex /workspace \
 && chown -R node:node /home/node/.codex /workspace

USER node
WORKDIR /workspace
ENV INITIAL_AGENT_MODE=read-only \
    NO_BROWSER=1

ENTRYPOINT ["codex-acp"]
