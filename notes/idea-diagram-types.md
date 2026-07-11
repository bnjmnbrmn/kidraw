---
title: Diagram types — major modes for graph docs; derived sizes stop being persisted
type: idea
status: proposed 2026-07-11, not yet agreed
---

# Diagram types (vs plugins)

Proposed by the user while dogfooding `next.kidraw.yaml`: a **diagram type** is
a new first-class concept — "this graph *is* a todo graph" — and for the
todo-graph type, node `w`/`h` should not be stored in the yaml at all but
calculated by kidraw from the text.

## The editor analogy (user's framing)

Same relationship as file types and plugins in normal editors — in emacs
terms, **major modes vs minor modes**:

| | Diagram type (major mode) | Plugin (minor mode) |
|---|---|---|
| Cardinality | exactly one per graph doc | zero or more |
| Meaning | what the content *is* | additive, orthogonal behavior |
| Owns | node/edge defaults, persistence policy (which style props are derived vs stored), possibly available commands/layouts | extra behaviors usable across types |
| Declared | in the file (`type: todo-graph` next to `kidraw: 1`) | `plugins: [...]` (exists today) |

**Plugin v0's `todo-graph` is really a diagram type wearing a plugin
costume** — it's a bundle of style defaults recorded per-graph, and only one
meaningfully applies. Migration: add `diagramType` to `KidrawGraphDoc` /
`GraphSnapshot`, move `todo-graph` there, keep `plugins` for genuinely
orthogonal add-ons. Editors also *bind* plugins to file types (mode hooks);
a diagram type could likewise activate default plugins later.

## Derived sizes: most of the machinery already exists

Since the `fit` overflow mode (0bed763), rendered `w`/`h` of a todo card are a
pure function of (text, fontSize, max-width). And the runtime already treats
them that way:

- The "cache" the user asked for **is** `DANode._nodeWidth/_nodeHeight` —
  recomputed by `applyTextOverflow()` on every text edit, and re-derived on
  every load (`DrawingLayer.restoreGraph()` calls `applyTextOverflow()` after
  `restoreState()`). No new invalidation machinery is needed; text
  measurement for even hundreds of nodes is microseconds.

So the actual change is **serialization policy, not runtime**:

- `snapshotToFiles`: omit style props that equal the diagram type's defaults
  (today it always writes `w`/`h`/`fontSize`/`textOverflow` per node — 61×
  redundant lines in `next.kidraw.yaml`, plus derived-size churn in every
  save/diff).
- `filesToSnapshot`: resolve missing props through a cascade —
  **app hardcoded defaults → diagram type defaults → per-node file props.**
  This is exactly the HTML/CSS split the file format was designed around
  ([`docs/file-format.md`](../docs/file-format.md)); the diagram type is a
  built-in stylesheet.

Nuances:

- **`w` is not fully derived even in fit mode** — it's the base/max width, an
  *input*. It moves into the type default (280 for todo-graph); a per-node
  `w` in the file remains legal as an override (user manually resized ⇒
  changed base ⇒ persist the deviation). Backward compat is free: old files
  with explicit `w`/`h` just read as overrides.
- **Position (`x`/`y`) stays persisted.** Only style props with a
  deterministic derivation become omittable.
- **Version skew:** if a type's defaults change across app versions, old
  files render differently. Editors accept this (rendering is app-side);
  acceptable here, but worth stating as a decision.
- The org→kidraw converter no longer fabricates `w: 280 / h: 70 /
  textOverflow` per node — it emits `type: todo-graph` once.

## Open questions

1. Name: `diagramType`? `type`? Reserve `type` in the yaml header?
2. Does a graph with no declared type get a `default` type (whose defaults =
   today's hardcoded ones)? (Probably yes — makes the cascade uniform.)
3. Does applying a type restyle existing nodes the way `applyPlugin` does,
   and is switching types undoable the same way?
4. Do types own more than style defaults (layout default? routing default?
   key submenu entries?) — start with style + persistence policy only.

Relates: [`design-plugin-v0.md`](design-plugin-v0.md),
[`decision-vault-model.md`](decision-vault-model.md) (external-edit reload is
what makes file-side simplicity matter), `bug-style-colors-not-persisted.md`
(the same snapshot-mapping cascade work would give colors a home).
