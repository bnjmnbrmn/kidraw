# The contract between KiDraw and kidraw-agent

What the app (the browser tab) and the agent server agree on, written once and
compiled by both:

| File | What it defines |
|---|---|
| `src/messages.ts` | Every WebSocket message: what the tab may send (`TabToServer`), what the server may send (`ServerToTab`), and the pieces they carry (`CanvasRef`, `DetailLevel`, the agent's settings, the transcript a resumed session replays). |
| `src/tools.ts` | The canvas tools: each tool's name, the description the model reads, and the schema of its arguments (zod), including the changes `apply_changes` accepts (`CHANGE`, and its type `CanvasChange`). `parseToolArgs` checks a call against a tool's schema. |

Change a message or a tool here, and whichever side no longer fits stops
compiling. There is no second copy to keep in step.

## How each side uses it

- **The app** imports it as `@kidraw/agent-protocol/messages` and
  `@kidraw/agent-protocol/tools`, mapped in the root `tsconfig.json`. The tab
  implements exactly the tools listed (`src/app/agent/agent-tools.ts`, checked
  by the compiler) and checks each call's arguments with `parseToolArgs`.
  `CanvasChange` is also the vocabulary of the drawing area's `CanvasPort`.
- **The server** sees this folder through the symlink `agent/src/shared`, and
  compiles it as part of its own source (`preserveSymlinks` in
  `agent/tsconfig.json`), so it lands in `agent/dist/shared/` and uses the
  server's own zod, the one the MCP library is given.

## Rules

- **It depends on nothing but zod**: not the app, not the server. It is the
  contract between them, so it can't belong to either.
- **The two files don't import each other.** The server's Node module rules
  need `./x.js` imports, and the app's test bundler can't follow those to a
  `.ts` file.
- **zod stays out of the app's first download**: only the lazily loaded
  `agent-tools.ts` imports `tools.ts` as values; everything else imports its
  types.

`tools/qa/contract/agent-boundary.js` checks the first and third rules.
