# Plugins written as data

A KiDraw plugin can be a YAML file: no code, nothing to build. Add one in
**Settings → Plugins → Add a plugin from a file…**; it is kept in your browser
and comes back when you reload. Share it by sharing the file. Remove it from
the same list.

A plugin written this way is a **diagram type**: switch a graph to it with
`:type <id>`, and its menu appears on root `t`. What it can declare:

| Field | What it is |
|---|---|
| `id` | Lower-case letters, digits and dashes, 2–40 long. Must not be taken. |
| `name` | What Settings, `:type` and the header call it. |
| `description` | One line on what it is for. |
| `requires` / `uses` | Other plugins: ones it cannot work without (switched on with it), and ones it makes use of when they are on. |
| `labels` | `plain` (the default) or `markdown` — markdown labels need the Markdown plugin, and get math when Math is on. |
| `nodes` | Defaults for its nodes: `shape` (box, circle, diamond), `width`, `height`, `fontSize`, `textOverflow` (clip, shrink-font, ellipsis, widen-h, widen-v, widen-both, fit). |
| `tagGroups` | Families of tags a node carries at most one of, each drawn as a badge: `id`, `name`, and `choices` of `{tag, label, color, dims?}`. `dims: true` fades the node and strikes its label through. |
| `edgeKinds` | Kinds of edge, drawn in their own colour: `{tag, name, color, description, faint?}`. |
| `nodeKinds` | Kinds of node, drawn with their colour and name: `{tag, name, color, description}`. |
| `menu` | Its menu on root `t`: entries `{label, set: <tag>}` to give the selected nodes a tag (replacing the rest of its group), or `{label, clear: <group>}` to take the group's tag off. `key` suggests a key. |

Tags are `family/name` (`column/doing`); colours are `#rgb` or `#rrggbb`.

**Keys** follow one rule: never clash, be ergonomic, be memorable — in that
order. Menu entries take the right hand's keys under `t` (home row first), and
a suggested `key` is used when it is one of those and free.

**Checked strictly.** A field KiDraw does not know, a bad colour, or a menu
entry naming a tag no group has is an error, and every error is reported
together — the file comes from outside the app.

## Example

[`examples/kanban.kidraw-plugin.yaml`](examples/kanban.kidraw-plugin.yaml) —
cards moving through columns:

```yaml
id: kanban
name: Kanban
nodes: {shape: box, width: 240, height: 60, fontSize: 14, textOverflow: fit}
tagGroups:
  - id: column
    name: Column
    choices:
      - {tag: column/backlog, label: BACKLOG, color: '#64748b'}
      - {tag: column/doing, label: DOING, color: '#d97706'}
      - {tag: column/done, label: DONE, color: '#16a34a', dims: true}
menu:
  - {label: Backlog, set: column/backlog}
  - {label: Doing, set: column/doing}
  - {label: Done, set: column/done}
  - {label: No Column, clear: column, key: n}
```

## Not yet

Plugins with code of their own (commands, rendering) are built into the app
for now; running outside code safely needs a sandbox first, since anything
running in the page can read the agent token and the vault. Agents writing
plugins, and plugins kept in the vault, are next. The design, and what Ben
decided about it: [`notes/design-plugins.md`](../notes/design-plugins.md).
