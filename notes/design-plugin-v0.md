---
title: Plugin system v0 — app-registered defaults bundles
type: decision
---

# Plugin system v0

A plugin (v0) is an **app-registered bundle of style defaults** with a stable
id. First plugin: `todo-graph` (wide 280×70 rectangular cards, fontSize 14,
`widen-v` overflow — labels grow downward, not sideways).

## Shape of the mechanism

- `src/app/plugins/` — `plugin.model.ts` (types), `todo-graph.plugin.ts`,
  `plugin-registry.ts` (id → plugin lookup).
- **Applying** (`m → t`, `APPLY_PLUGIN {pluginId}`): restyles all existing
  nodes to the plugin's defaults (junction/invisible keep fixed geometry),
  records the id in `DrawingLayer.activePlugins`. Undoable (snapshot pushed
  first); triggers vault auto-save.
- **While active**: `createNewNode` applies the plugin defaults to new nodes.
  An explicitly requested shape (insert-with-shape submenu) wins over the
  plugin's default shape; sizes still apply.
  *Until 2026-09-24 the plugin's shape never applied:* the drawing area passed
  its own default shape along as though requested (unseen while every plugin
  declared a box). Now the default shape you set with the shape toggle or Set
  Shape over empty canvas also counts as asking, and before you set one the
  plugin's shape applies (inferred, 2026-09-24 — the reading of "explicitly
  requested" that keeps the toggle working on typed graphs; `2b965649`).
- **Persistence**: `plugins: [id]` on the graph doc (`KidrawGraphDoc.plugins`
  ↔ `GraphSnapshot.plugins`), round-trips through save/reopen and undo/redo.
  Unknown ids are preserved but inert (no registry hit → no defaults).

## Why not an importable .kd-style set?

That is the architecturally "right" home for style defaults (cascade +
imports already exist), but the save path regenerates the style from runtime
state (`snapshotToFiles`) — imports are flattened away on the first
auto-save. Until multi-file save preserves style structure, a file-based
plugin cannot survive its own graph being saved. The doc-level `plugins` list
is small, honest, and survives.

**Migration path**: when multi-file save lands, a plugin's style half can
become an importable style set with cascade `defaults`; the id-on-the-doc
mechanism remains for behavioral defaults (key bindings, commands, layout
preferences) that styles can't express.

## Growth directions

- More defaults per plugin: edge directedness/line style, palette, layout
  spacing, preferred router.
- Multiple plugins per graph (already a list; last-applied wins on conflicts
  since apply is sequential).
- Plugin picker UI once more than one plugin exists (currently a dedicated
  `m → t` key for todo-graph).
- Todo-specific semantics: status tags (todo/doing/done) + tagStyles,
  checkbox rendering, "mark done" command.
