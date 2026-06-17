# Command Surface Plan

Status: draft design note, 2026-05-13.

KiDraw is keyboard-first, but not every action should become a deep key-menu branch. The app needs a coherent "command surface" spanning:

1. the key menu / keyboard chords,
2. a command palette / command-line mode,
3. graphical controls such as header buttons, panels, dialogs, and side panes,
4. future automation/agent APIs.

## Terminology

In Vim, pressing `:` from normal mode enters **command-line mode** and runs **Ex commands** (often informally called colon commands).

In modern GUI apps, the analogous discoverable fuzzy-search UI is usually called a **command palette** or **command menu** (VS Code, Linear, Figma-style `Cmd/Ctrl+K`).

KiDraw likely wants both concepts eventually:

- a Vim-flavored `:` command-line mode for power users;
- a graphical/fuzzy command palette for discoverability.

They should invoke the same underlying command registry.

## Principle: one command registry, multiple surfaces

Avoid hard-wiring commands directly into one UI surface. Instead, define commands once with metadata, then let surfaces expose them differently.

A command should carry metadata like:

- id (`graph.save`, `graph.saveAs`, `graph.export.kidrawJson`, `layout.treeDown`)
- title / short label
- description
- category
- preconditions / enabled state
- side-effect / confirmation requirements
- default key-menu placement, if any
- command-palette aliases
- whether it belongs in graphical UI
- arguments schema, if any

Then the key menu, command palette, header buttons, and future agent API all dispatch the same command ids.

## Save/load/export/import command split

Distinguish these early:

### Save / Load
Native KiDraw document workflow. Intended for continuing editable work.

Near-term target:

- `graph.new`
- `graph.save`
- `graph.saveAs`
- `graph.open`
- `graph.rename`
- `graph.duplicate`
- `graph.delete`

Initial storage should be browser-local **My Graphs**, ideally IndexedDB-backed rather than localStorage-backed.

### Export / Import
Portable files / interchange / backup / sharing.

Near-term target:

- `graph.export.kidrawJson`
- `graph.import.kidrawJson`
- `graph.export.png`
- later: `graph.export.svg`, Mermaid/DOT/etc.

User-facing language:

- **Save** = save into My Graphs / local workspace
- **Export** = download/share a file
- **Import** = bring a file into KiDraw

## UI surface recommendations

### Key menu
Use for frequent, muscle-memory actions.

Good candidates:

- New / Save / Open recent
- quick export PNG maybe
- command palette / command-line entry point
- layout/routing actions
- insert/select/move/edit actions

Avoid putting every management operation into deep key-menu branches. Rename/delete/import/export-format selection are better in a panel/dialog/command palette.

### Command palette / command-line mode
Use for broad command access and rare commands.

Possible entry points:

- `:` in Vim-normal contexts = command-line mode / Ex-style commands
- `Cmd/Ctrl+K` = graphical command palette
- possible key-menu action: “Commands…”

Examples:

- `:w`, `:save`
- `:saveas Project Plan`
- `:open`
- `:export png`
- `:layout tree right`
- `:set edge directed`

### Graphical panels/dialogs
Use for stateful document management and choices.

Likely near-term:

- **My Graphs** side pane or dropdown:
  - list saved graphs
  - search/filter
  - open/rename/duplicate/delete/export
  - show modified date, node/edge count, thumbnail later
- **Export dialog**:
  - KiDraw JSON, PNG, later SVG/etc.
- **Import dialog**:
  - drag/drop `.kidraw` / JSON file
  - choose open-as-new vs merge/import-into-current later

Do **not** start with a graph representation of a filesystem. Interesting long-term, but too meta for the first usable storage workflow.

## Key-menu organization agent idea

A specialized agent could act as a **command IA / key-menu gardener**:

- inventory all commands;
- group them by intent and frequency;
- propose key-menu placements;
- detect conflicts with movement profiles and same-finger constraints;
- keep command labels short and consistent;
- recommend what belongs in key menu vs palette vs side panel;
- update docs/tests when assignments change.

This should be treated as a product/design role, not just code generation. The output should be proposals plus diffs to command metadata/tests.

## Current repo state related to this

As of this note:

- `project-todos.md` has backlog items for graph serialization, graph management UI, export/import, command registry, and keymenu improvements.
- `dev-status.md` is the authoritative current-state doc and mentions Vim command bar, quick settings panel, graph save/load to localStorage, and the key files.
- The storage/command-surface design above was not previously captured as one coherent plan.

## Suggested implementation order

1. Introduce/clarify command registry metadata.
2. Implement browser-local My Graphs using a storage abstraction; prefer IndexedDB over localStorage for named documents.
3. Add minimal My Graphs graphical UI.
4. Add native `.kidraw` export/import.
5. Add command palette backed by the same command registry.
6. Add Vim `:` command-line mode as a power-user frontend to the same registry.
7. Revisit key-menu organization with the command IA/key-menu gardener agent.
8. Add cloud/team/self-hosted storage repositories behind the same storage abstraction.
