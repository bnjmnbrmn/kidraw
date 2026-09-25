# KiDraw architecture — the whole system on one page

Start here when opening the repo cold. For *where development stands*, read
[`dev-status.md`](dev-status.md); for project conventions,
[`AGENTS.md`](AGENTS.md); for design history, [`notes/README.md`](notes/README.md).

KiDraw is a keyboard-first diagramming tool: Angular 19 for the shell, Konva
for the canvas, and a keyboard overlay ("the keymenu") that maps physical keys
to actions. The mouse is secondary throughout. You navigate a crosshairs cursor
around the canvas and build a directed graph of nodes and edges without
reaching for it.

## The pieces, by weight

| Directory | Lines | What lives there |
|---|---:|---|
| `drawing-area/` | ~23,000 | The canvas and everything on it: nodes, edges, labels, waypoints, crosshairs, layout, edge routing, navigation |
| `lib/` | ~3,200 | Logic with no Angular in it: the keymenu state machine, the file format, fuzzy matching |
| `keymenu/` | ~2,600 | The on-screen keyboard overlay (its own Konva canvas) |
| `agent/` | ~2,400 | Agent mode's tab side — see [`agent/README.md`](agent/README.md) for the server |
| `services/` | ~1,900 | Storage, theming, vault, config, logging |
| `plugins/` | ~300 | Plugins: so far the diagram types (explanation, todo), which add node kinds and edge kinds |
| `nav-popup/`, `reading/`, `header/`, `ex-line/` | ~1,000 | Go-to popup, reading mode, header chips, the vim `:` line |

## How a keystroke becomes a change

This is the spine. Almost everything follows it.

```
  keyboard
     │
     ▼
  KeymenuComponent ──DACommand──▶ AppComponent ──Subject<DACommand>──▶ DrawingAreaComponent
                                       ▲                                      │
                                       └──────────── DANotification ──────────┘
```

1. **`KeymenuComponent`** owns the keyboard. It knows which mode you are in and
   which physical key means what, and emits a `DACommand` — an intent like
   `MOVE_CROSSHAIRS` or `CREATE_NEW_NODE`, never a key code.
2. **`AppComponent`** is the shell. It routes commands to the drawing area over
   an RxJS `Subject<DACommand>`, and calls keymenu methods directly for mode
   switches.
3. **`DrawingAreaComponent`** executes them against the Konva canvas — each
   command kind has one handler, in a slice owned by the feature it belongs
   to (`command-handlers.ts`) — and emits
   `DANotification`s back — "a node was inserted", "the view changed", "edit
   state changed" — which the shell and header react to.

**The rule that keeps this honest:** no key literals in action logic. Every
binding flows through `KeymenuKeyAssignments`, so the vim and ijkl profiles are
the same code with different tables.

## Inside the drawing area

`drawing-area.component.ts` is still ~4,000 lines and is the part of the
codebase most worth knowing your way around. It is the orchestrator: Angular
lifecycle, Konva wiring, command dispatch, selection and mode state, crosshairs
movement.

Around it, in the same directory:

**The things on the canvas** — `da-node.ts` (1,588), `da-edge.ts` (926),
`da-label.ts`, `da-waypoint.ts`. Each wraps a Konva group and knows how to draw
and measure itself.

**Two Konva layers** — `drawing.layer.ts` holds nodes and edges;
`crosshairs.layer.ts` is always on top. Overlays that must not scale with the
graph live on the crosshairs layer; that distinction matters more often than
you would expect.

**Edge routing**, the largest body of pure algorithm here:
`bezier-fit-weighted-chain-edges.ts`, `desiderata-route-edges.ts`,
`routing-local-score.ts`, `incremental-desiderata-v3-route-edges.ts`. These are
pure functions over geometry; `layout-controller.ts` orchestrates them, in a
Web Worker (`routing.worker.ts`) for whole-graph passes.

**Layout** — `graph-layout.ts` (1,116) and `layered-layout.ts`.

**Extracted subsystems**, each with a narrow host interface back to the
component:
- `navigation-grid-controller.ts` (1,100) — move-by-node: three strategies for
  stepping the crosshairs between graph items, and the overlay that explains
  the rule being applied.
- `clipboard-controller.ts` — the graph's own clipboard: yank, cut, paste.
- `grow-controller.ts` — grow mode, the held add key: aiming on the placement
  lattice, the target search and type popups, placement, and the commits.
- `gestures.ts` — the list of gestures (grow, Move by Link, Move by Node's
  held session, area select): at most one on, and all canceled when the graph
  is replaced. Distinct from the keymenu's modes.

These are the pattern to follow when more comes out: the component lends a
collaborator only what it needs, through getters, and keeps its own members
private. A collaborator that handles commands brings its own slice of the
command table (`commands()`, see `command-handlers.ts`) — search, files,
Move by Link, move by node, text editing, grow mode, the clipboard, the style commands (`style-controller.ts`) and
layout and routing (`layout-controller.ts`) do — so the component
does not keep one-line delegates for it. That is also the shape plugins will
have ([`notes/design-plugins.md`](notes/design-plugins.md)).

## State that outlives a keystroke

**Undo/redo** is whole-graph snapshot serialization — `graph-snapshot.ts` plus
`undo-redo.service.ts`. Coarse, and deliberately so. Agent edits get authored
undo groups so one agent turn undoes as one step.

**Files** live in `lib/file-format/` — a parser, a resolver, snapshot mapping,
and a zip bundle format. The vault (`services/vault.service.ts`) watches files
on disk; drafts persist to localStorage through `draft-storage.service.ts`.

**Plugins** live in `plugins/`, registered in `plugin-registry.ts`. A
diagram type is a plugin a graph is bound to (`:type explanation`); a
feature (Markdown, Math, Tags) adds to other types. A plugin contributes
node and edge kinds, tag groups, style defaults, commands with namespaced
ids (`todo.setStatus`, routed as `PLUGIN_COMMAND`), and a menu that root
`t` opens. Plugins change the graph only through `PluginHost.apply`
(operations). Non-core ones can be turned off in Settings, dependencies
follow automatically, and diagram types can be written as YAML and added
without a rebuild ([`docs/plugins.md`](docs/plugins.md)). Design and Ben's
decisions: [`notes/design-plugins.md`](notes/design-plugins.md).

## Agent mode

`src/app/agent/` is the tab side: `AgentService` holds the session, the panel
and overlay render it, and canvas tools reach the canvas only through
`AgentCanvasTarget` (implemented by `AgentCanvasSurface`,
`drawing-area/agent-canvas-surface.ts`). It talks to
`kidraw-agent`, a separate Node server in [`agent/`](agent/README.md) that you
run yourself. Nothing connects anywhere until you configure an endpoint.

That server's README is the best-documented corner of the repo and explains the
part people find surprising: the model's tools execute **in the browser tab**,
not on the server.

## Testing

Three tiers, and they catch different things:

- **Unit specs** (`*.spec.ts`, 658 of them) — `npx ng test --watch=false
  --browsers=ChromeHeadless`. Fast: the suite executes in about 7 seconds; the
  Angular build around it is the slow part.
- **Browser tests** (`tools/qa/`) — real keys against the real app in Chrome.
  `npm run qa`. See [`tools/qa/README.md`](tools/qa/README.md), which also
  records which checks are currently owed and why.
- **`npx ng build`** — must be clean before committing.

Many unit specs build the component with
`Object.create(DrawingAreaComponent.prototype)`, which skips field
initializers. That is worth knowing before you move anything onto a
collaborator field: prototype methods survive it, fields do not.

## A reading order

If you want to understand the whole thing, roughly this order:

1. [`AGENTS.md`](AGENTS.md) — conventions, and the architecture notes index.
2. [`notes/philosophy-keyboard-first.md`](notes/philosophy-keyboard-first.md) —
   why any of this is shaped the way it is.
3. [`notes/architecture-keymenu-model.md`](notes/architecture-keymenu-model.md)
   and [`architecture-mode-hierarchy.md`](notes/architecture-mode-hierarchy.md)
   — the state machine and the four modes.
4. `src/app/app.component.ts` — small, and the whole command flow is visible.
5. `src/app/drawing-area/command.model.ts` — the vocabulary everything speaks.
6. `src/app/drawing-area/drawing.layer.ts` — how the graph is actually held.
7. One extracted subsystem end to end, `clipboard-controller.ts` for preference:
   it is small, self-contained and shows the host-interface pattern.
   (`gather-controller.ts` was the example until it was retired on 2026-09-24.)
8. [`agent/README.md`](agent/README.md) — if agent mode interests you.

Then pick a behavior you know from using the app, find its `DACommand`, and
follow it through. That is faster than reading `drawing-area.component.ts` top
to bottom, which nobody should do.
