# Agent mode, the tab's side

The chat panel, and everything the browser tab does for agent mode. The
other half is a separate Node server, `kidraw-agent`, in
[`agent/`](../../../agent/README.md): it runs the agent (Codex) and relays its
tool calls here. This README is the tab; that one is the server and the
protocols between them. Design: [`notes/idea-mcp-server.md`](../../../notes/idea-mcp-server.md).

## What it does, as you see it

You press `m` and the chat opens on the right. The first time, it asks for an
endpoint and token (there is no default), then asks before sharing this
graph. You ask a question; the agent reads the graph and answers. While it
explains, it can move the view onto a node, highlight nodes, put captions
beside them, and, if you let it, change the graph. Its edits undo as one
step per message, and "Undo the agent's last turn" reverts them later. If you
move the view yourself, it stops moving it and shows a "look here" hint.

## How it is kept apart from the rest

Agent mode is a feature on top of the canvas, and can be turned off
(Settings → Plugins → AI Chat). The rule is that it can be read, changed or
removed without touching anything else:

- **It sees the canvas only through `CanvasPort`**
  ([`drawing-area/canvas-port.ts`](../drawing-area/canvas-port.ts)), the
  drawing area's interface for everything that is not the keyboard. It reads
  nodes, edges, the selection and the view; it points and highlights; it
  changes the graph only with a batch of changes, applied as one undo group.
  Reading mode uses the same interface. Neither touches Konva.
- **The rest of the app sees agent mode only through `AgentStore`** (always
  loaded, small) and the two components the shell places. Everything else
  here loads the first time agent mode is used.
- **Both rules are checked**: `tools/qa/contract/agent-boundary.js` fails on
  any other import across the folder's edge, and on anything that would pull
  the lazy parts into the first download.

```
AppComponent / Header ──▶ AgentStore ──(first use)──▶ AgentService ──WebSocket──▶ kidraw-agent
                                                           │
                                                           ▼
                                  agent-tools ──▶ CanvasPort ◀── drawing area (CanvasPortSurface)
```

## Reading order

1. **`agent-store.ts`**: the state everything renders (connection state,
   messages, captions, the draft), and the entry points the shell calls. Start
   here to see what agent mode *is* from the outside.
2. **`agent.service.ts`**: the coordinator. Sections in order: panel and
   keyboard, endpoint and consent, consent following the graph, connection,
   what the server says, chat, model and sign-in, the agent's tool calls.
   It hands the detail to:
   - `agent-socket.ts`: one connection attempt, and `afterClose`, which
     decides whether a closed connection is retried or reported;
   - `chat-transcript.ts`: the conversation as shown (streaming replies,
     activity lines);
   - `agent-marks.ts`: highlights, captions and the focused node;
   - `agent-turns.ts`: which edits belong to which message, for undo and Stop;
   - `stored-session.ts`: what a reload needs to resume the conversation.
3. **`agent-tools.ts`**: the canvas tools as the tab runs them, one small
   function each. `agent-changes.ts` turns the agent's references ("the node
   called Parser") into ids and checks a batch of changes before anything is
   planned.
4. **`agent-protocol.ts`**: the messages on the wire. The server keeps a copy
   (`agent/src/protocol.ts`); a server test fails if they drift.
5. The UI: **`agent-panel.component.ts`** (setup, consent, the conversation,
   the message box) and **`agent-overlay.component.ts`** (captions beside
   nodes). Helpers: `chat-draft.ts` (the message box is edited with the same
   vim keys as a label), `chat-markdown.ts` and `agent-refs.ts` (how replies
   render, including `[[ref:id|label]]` pills), `agent-settings.service.ts`
   (endpoint, consent and options, remembered in this browser).

Where the edits land: `CanvasPortSurface`
([`drawing-area/canvas-port-surface.ts`](../drawing-area/canvas-port-surface.ts))
and `canvas-change-planner.ts` next to it turn a batch of changes into graph
operations, applied by `HistoryController`.

## Tests

- Specs beside each file; `agent.service.spec.ts` drives the whole service
  through a fake WebSocket (connect, resume, reconnect, consent, tool calls).
- `tools/qa/agent/canvas-port.js`: the port against the running app.
- `tools/qa/contract/agent-boundary.js`: the folder's edge.
- The server's own tests: `cd agent && npm test`.
