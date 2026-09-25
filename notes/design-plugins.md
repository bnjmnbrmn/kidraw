---
title: Plugins — the unit the drawing area breaks up into
type: design
status: direction and seven decisions by Ben, 2026-09-23; the rest is inferred
---

# Plugins

Grows the extension model in [`idea-diagram-types.md`](idea-diagram-types.md)
(declarative contribution points, 2026-07-12) into plugins that contribute
behavior as well: commands, keys, rendering, agent tools.

## Ben's direction (Ben, 2026-09-23)

- Plugins are how to break up `DrawingAreaComponent`. Instead of the
  component handling every command itself, commands go to registered plugins.
  (His phrasing: "iterate through registered plugins and have each try to
  handle the command".)
- Some plugins are **core** and built into the app, some are **optionally
  enabled**, and some may be **registered dynamically** — how that would work
  is open.
- Plugins can depend on each other, e.g. a math typesetting plugin on a
  markdown plugin.
- Plugins he envisions: AI chat (encapsulating the agent work so far),
  explanation diagrams, todo diagrams, markdown, math, layout/routing,
  versioning, and eventually team/multiplayer.

Earlier decisions this builds on:
- One extension concept with typed contribution points; conflict semantics
  belong to the contribution point, not to a category of extension (Ben,
  2026-07-12 — [`idea-diagram-types.md`](idea-diagram-types.md)).
- Activation by file-type hooks: the identity extension pulls in companion
  extensions (Ben, 2026-07-12).
- Key conflicts warn loudly and rebind automatically; they don't fail (Ben,
  2026-07-12).
- "Extension" in the code is "plugin" in the UI and in conversation (Ben,
  2026-09-15 — [`design-explanation-graphs.md`](design-explanation-graphs.md)).
  Question 1 below asks whether that still holds.

## What exists (2026-09-23)

- `src/app/plugins/` (called `extensions/` until renamed on 2026-09-23):
  `KidrawPlugin` is declarative — identity,
  node defaults, label format, tag groups, edge kinds, node kinds, reading
  order. Registered in a fixed map (`plugin-registry.ts`); one bound per
  graph as its diagram type.
- The component's plugin-specific code is small: roughly 250 of its ~5,700
  lines (the agent canvas surface, `setDiagramType`, `setTaskStatus`, math
  relayout). The rest is core interaction — navigation, grow mode, selection,
  drag, text editing, search. **So plugins alone will not shrink the
  component much; giving core features the same shape will** (inferred,
  2026-09-23 — from a section count of the file).
- Explanation leaks out of its extension: the reading surface in
  `KeymenuComponent`, `reading-mode.service.ts` importing explanation tags,
  and `set_reading_order` / `arrange` hardcoded into `AgentChange`.
- The task-status submenu was withdrawn in da-438 (2026-08-29) "until
  plugins exist"; `SET_TASK_STATUS` is still handled by the component.
- `AgentCanvasTarget` is the one narrow host surface that exists: reads plus
  `agentApplyChanges`, which applies graph operations as undo groups.

## Proposed model (inferred, 2026-09-23 — not yet agreed)

### Three ways plugins take part, each with one rule

| What | Rule | Examples |
|---|---|---|
| **Commands** | exactly one owner, found by lookup | `SET_TASK_STATUS` → todo plugin |
| **Events** | every subscriber hears them | graph loaded, node inserted, selection changed |
| **Contributions** | gathered from every active plugin | badges on a node, submenu entries, agent tools, layouts |

Why lookup rather than asking each plugin in turn: polling makes precedence
depend on registration order, and "which plugin swallowed this command?"
becomes a debugging question. The keymenu has already resolved mode and
context before a command exists, so its owner is knowable. Two plugins
claiming one command is a registration error, surfaced loudly.

Where a plugin wants to change a core command for its own items (e.g. editing
a math label opens a different editor), the core command offers an explicit
hook at that point rather than every command being polled.

### Dispatch without losing exhaustiveness

The component's `switch` gives compile-time exhaustiveness through
`assertNever`, which is why it was left alone
([`style-refactoring-taste.md`](style-refactoring-taste.md)). A mapped type
keeps that guarantee while making dispatch data:

```ts
type CommandHandlers = {
  [K in DACommand['kind']]: (command: Extract<DACommand, {kind: K}>) => void;
};
const handlers: CommandHandlers = {...navigation, ...files, ...styling /* … */};
```

A missing command kind is a compile error, as before; each owner contributes
its own slice. Duplicate keys across slices are not a compile error, so
`mergeCommandSlices` throws on one and a spec builds the real table.

**Done 2026-09-23** (`command-handlers.ts`): fifteen slices in the component,
named for their owners. Two things it showed (inferred, 2026-09-23):
- The table is typed over the `DACommand` union, not the `DACommandType` enum.
  Typed over the enum, the build failed on `OPEN_INSERT_SUBMENU`, an enum
  member no command carries — already reported as stranded in
  `claude-proposed-tests/README.md`, and still left alone.
- Six core units now bring their own slice through `commands()` —
  search, files, Move by Link, move by node, text editing, gather — the
  plugin shape applied to core, and it removed about twenty one-line
  delegates from the component (inferred, 2026-09-23).
- The drawing area's table has to list six commands it never sees
  (`shellCommands`: the ex line, agent chat, reading), because AppComponent
  intercepts them. With a registry, the owners of those — an agent-chat
  plugin, a reading plugin — would register them themselves, so the registry
  belongs at the app level, with the drawing area as one contributor.

### The host API is the real design work

If a plugin's handler receives the component, code moves without coupling
dropping. `AgentCanvasTarget` is the pattern: read the graph, selection and
view; change the graph only through operations.

**Rule from day one: plugins change the graph only through operations and
undo groups** ([`idea-multiplayer-readiness.md`](idea-multiplayer-readiness.md)).
Versioning, multiplayer and per-participant undo depend on it. Keymenu edits
still use snapshot undo today, so core is exempt until it moves over.

Rendering contributions should be pure functions of model data (a node's
tags → badges, border color, faintness), not Konva access, so plugins stay
testable and the renderer stays replaceable.

### Plugin by plugin

- **Todo, explanation:** already mostly declarative; need command, submenu and
  (explanation) agent-tool contribution points.
- **Markdown, math:** a *label rendering* contribution point; markdown
  defines it, math contributes an inline renderer. Fit-mode sizing needs to
  measure through it.
- **Layouts, routers:** already pure functions — a strategy registry is the
  cheapest early win. Routers run in a web worker, so a router plugin must be
  worker-safe.
- **AI chat:** needs its own contribution points — agent tools, change kinds,
  prompt context — so explanation can add `set_reading_order` without the
  agent knowing about explanations.
- **Versioning, multiplayer:** cross-cutting. Core guarantees the operation
  log and presence; a plugin can own transport (Yjs, WebSocket) and UI
  (history, branches). Blocked on keymenu edits moving to operations more
  than on plugins.

### Dependencies

Depend on contribution points, not on another plugin's internals (Eclipse's
extension-point model). Activation is a topological sort with cycle
detection. Keep the graph shallow.

### Dynamic plugins, in three tiers of risk

1. **Declarative** (kinds, tags, styles as YAML/JSON) — what extensions are
   today. Safe; could live in the vault or the graph file, and an agent could
   write one.
2. **Built in, lazy-loaded** with `import()` — as MathJax already is.
3. **Arbitrary code from a URL** — anything in the page can read the agent
   token and the vault. Only in a sandbox (worker or iframe) speaking the
   operation API over `postMessage`, as Figma does. The agent's MCP tools are
   already a remote API of that shape; a remote plugin might be another
   participant.

### Other proposals

- **A graph opens and saves losslessly without its plugins.** Namespaced tags
  already give this (`status/done` survives a build without todo-graph).
- **One root key reserved for the active diagram type's submenu**, as Emacs
  reserves `C-c` for major modes: plugins never compete with core for root
  keys, and the task-status menu comes back there. Plugin keys still need
  vim and ijkl bindings ([`architecture-key-profiles.md`](architecture-key-profiles.md)).
- **Each plugin is tested against a fake host**, the pattern
  `file-controller.spec.ts` already uses.

## Decisions (Ben, 2026-09-23)

Answers to the questions this note asked, given in chat:

1. **"Plugin" everywhere**, code included. Supersedes "extension in the code,
   plugin in the UI" (Ben, 2026-09-15).
2. **Core features register through the same mechanism** as plugins.
3. **Activation per graph and per user, both** — and **non-core plugins can
   be turned off in the settings.**
4. **Dynamic registration is for all three, eventually:** adding plugins
   without a rebuild, sharing them, and agents authoring diagram types.
5. **Missing dependencies are switched on automatically, and optional
   dependencies exist — with warnings/notifications.**
6. **Plugins name their own commands** (namespaced, e.g. `todo.setStatus`).
7. **Plugin menu keys: don't clash, be ergonomic, be memorable — in that
   order.**

Also: `SINGLE_ITEM_TOGGLE_SELECT` ("select only this") is retired; clearing
the selection is root `c` (Ben, 2026-09-23).

## What the decisions imply (inferred, 2026-09-23 — proposals, not decisions)

- **Core vs non-core** (3): every plugin declares whether it is core. Core
  ones cannot be switched off; the settings list the rest.
- **A graph whose type is switched off** (3 meets activation-by-file): the
  graph still opens and saves losslessly (its tags survive), the plugin's
  behavior stays off, and a notification says so ("This graph is an
  Explanation; Explanation is off in Settings"). **Decided: it offers to
  turn the plugin back on** (Ben, 2026-09-24); declined, it opens as above.
- **Notifications** (5): switching a plugin on that needs another says what
  it switched on too ("Math needs Markdown — switched Markdown on"), and
  switching off one that others need says what stops working.
- **Keys** (7), as an algorithm: the keymenu offers each plugin menu the
  profile's ergonomic keys for that position (opposite hand to the hub, home
  row first); keys already taken are removed first (no clash); the plugin's
  suggested key is used if it is still in that ergonomic set (memorable);
  otherwise the first free ergonomic key; a menu with more entries than
  keys warns loudly. Applies to both profiles.
- **Dynamic registration** (4): declarative plugins (data only) first, since
  they are safe to share and for agents to write; plugins with code later,
  and only sandboxed.

## Built (2026-09-24, overnight, on `refactor/readability`)

The five steps proposed after Ben's decisions, each committed with specs and
browser checks (inferred, 2026-09-24 — what was built, not new decisions):

1. **Plugins bring their own commands** (`b8b4d5af`). Namespaced ids
   (`todo.setStatus`), carried by one core kind, `PLUGIN_COMMAND {call}`,
   and type-checked through `PluginCommandArgs`, which each plugin extends
   from its own file. `SET_TASK_STATUS` and `TaskStatus` left core. Plugin
   writes go through `PluginHost.apply` (operations, one undo group,
   synchronous by type); the operations code loads with the app.
2. **Root `t` is the diagram type's own menu** (`b7f72fbb`), keys by Ben's
   rule — no clash, ergonomic, memorable — implemented as `menu-keys.ts`
   against the profile's `pluginMenu` keys. Todo's: h Draft, j To Do,
   i In Progress, k Blocked, l Done, n No Status.
3. **Settings → Plugins** turns non-core plugins off (`2345d7c1`). Off
   means: commands say so, the menu goes, `:type` stops offering it; its
   data still renders, and a graph of its type asks whether to turn its
   plugin back on; declined, it opens as itself with a notice (Ben,
   2026-09-24). On the way, every graph
   load now emits the context update (some never did).
4. **Markdown and Math are plugins** (`013a343e`): features, not types.
   `requires` / `uses`, followed automatically both ways with notices
   ("Markdown: off — and Explanation and Math, which need it"). Labels
   follow the settings; with Math off, `$` is text. `registryProblems()`
   keeps the registry sound (a spec holds the real one to it).
5. **Plugins written as data** (`f210488e`): YAML diagram types, added in
   Settings from a file, kept in the browser, registered before graphs
   open; menus set tags through the core `tags.set` command. Format and a
   Kanban example: [`docs/plugins.md`](../docs/plugins.md).

After the five steps, the same night:

6. **AI Chat is a plugin** (`50423665`), the first on Ben's list: off, its
   keys (m, o, Shift+O, Shift+M) leave the keymenu, stray agent commands
   say so, and any session ends. Explanation *uses* it (sending marks).
7. **Agents can write plugins** (`efdbaa94`): a `define_plugin` tool takes
   the same YAML, with the same checks, into the same library. The live
   `kidraw-agent` offers it after a restart (not done).
8. **Save** beside an added plugin downloads its YAML, to share
   (`03a6ce37`).
9. **Read is Explanation's** (`c3389524`): offered only on a graph whose
   type has a reading order, while that plugin is on.

Browser checks: `graph-types/` holds task-status (18), plugin-settings (13),
markdown-math-plugins (13), plugin-library (15) and ai-chat-plugin (9), all
driving the real Settings panel and real keys.

**Not built yet:** code plugins from outside the build (needs a sandbox);
plugins kept in the vault (the File System Access API cannot be driven
headlessly, so only unit-testable); reading mode as a capability any
plugin with a reading order can use (today it knows Explanation's tags);
explanation's agent change kinds (`set_reading_order`, `arrange`) as its
contributions; core features registered as plugins (decision 2 is followed
in shape — core units bring `commands()` — but core commands are still the
closed enum); versioning and multiplayer (need keymenu edits on operations
first).

## Spike: task status as a todo plugin (2026-09-23)

Branch `spike/plugin-todo-status`, not merged — for Ben to look at. Task status
moved out of the drawing area into the todo plugin, which is now one file:
its declaration, its menu, and its command, written against the host only and
tested with a fake host (no Konva, no component). Findings (inferred,
2026-09-23 — from building it and running unit and browser tests on it):

- **The host needed four things:** the graph's type, the target nodes (as
  data), `apply` (operations as one undo group), and `status`. The component
  lost `setTaskStatus` outright; what remains for the command is a routing
  line in its table.
- **Writes through operations bring two fixes for free.** A status change is
  an operation group, so it undoes as one step; and a status a node already
  has produces no operations, so no empty undo step — the
  [refused-command bug](bug-refused-command-leaves-undo-step.md) cannot happen
  on this path.
- **The operation path must be synchronous on the keystroke path.** It was a
  lazy chunk (kept out of the bundle for the budget, when only agent edits
  used it). From the keyboard, the first status change waited ~250 ms for the
  chunk, and a second key press in that gap planned against the graph the
  first had not changed yet, then hit a conflict. Loading it eagerly costs
  **1.5 kB** of the main bundle. `PluginHost.apply` is now synchronous by
  type, so no plugin can await between reading the graph and writing it.
- **Menu:** root `t` opens the bound plugin's own submenu when it has one
  (the reserved Status key, now "the type's key"). Its entries take keys by
  position from the profile's `pluginMenu` list (h j k l ; u i o), so a plugin
  never names a key and cannot collide with core bindings in either profile.
  The cost is mnemonics: the old Status menu had r Draft / t To Do /
  w In Progress / b Blocked / d Done / c None. **Question for Ben:** keys by
  position, or plugins proposing mnemonic keys with the "warn loudly and
  rebind" rule of 2026-07-12?
- **Command vocabulary:** `SET_TASK_STATUS` stays in the core `DACommand`
  union and the core table routes it to whichever plugin claims it. With
  namespaced plugin commands (question 6), one core kind — say
  `PLUGIN_COMMAND {id, args}` — could route all of them, keeping the core
  union closed and exhaustive while plugins add commands freely.
- A plugin's commands are registered whether or not it is the graph's type;
  its owner says what happens when it is not (the todo plugin warns, as
  before).

Checked: 819 unit specs; `task-status.js` 16/16 with two new real-key checks
(root `t` menu, `t`→`l` marks Blocked); `one-step-per-change.js` 9/9;
`file-flows.js` 9/9.

## Sequencing (inferred, 2026-09-23)

1. Dispatch as typed handler tables, grouped by owner — behavior-neutral.
2. A spike: todo-graph's task status as a plugin contributing its command
   and submenu, to test the API on a real case.
3. Explanation's reading surface and agent tools behind contribution points.
4. Keymenu edits onto operations — the prerequisite for versioning and
   multiplayer.
