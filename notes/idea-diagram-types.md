---
title: Extensions with contribution points — diagram identity, derived sizes, todo-graph semantics
type: idea
status: persistence slice SHIPPED 2026-07-12 (eab8642) — identity slot + style/persistence cascade; next slices per Decisions below
---

# Extensions + contribution points (supersedes the "diagram types vs plugins" framing)

Origin: dogfooding `next.kidraw.yaml`. First proposal (2026-07-11) framed a
new "diagram type" concept vs plugins as emacs major vs minor modes. **User
rejected that framing as under-expressive**: mutual exclusivity shouldn't be
a property of a *category* of extension ("major modes all exclude each
other, minor modes never do") but of *what is being contributed*. Two
extensions can both add tags; two extensions cannot both own the same key in
a submenu or both decide what `w` means in the file.

## The model

One kind of thing — an **extension** — declaring contributions to typed
slots (VS Code's "contribution points"). Each slot defines its own conflict
semantics:

| Contribution point | Conflict semantics |
|---|---|
| **identity** | singleton per graph — `type: todo-graph` in the yaml header; implicit `default` identity when absent (decided: yes). "Diagram type" survives only as *the extension bound at the identity slot*, not as a separate category. Switching identity restyles existing content, undoably (decided: yes). |
| **style defaults + persistence policy** | cascade-ordered: app → identity → plugins → per-node file props (CSS-like). Persistence = per-prop derived-vs-stored rules. |
| **commands + keymenu entries** | additive; key bindings need conflict detection at activation. Seam exists: `KeymenuKeyAssignments` / submenu configs are already data. |
| **node kinds / edge kinds** | additive vocabularies with styling, creation commands, semantics hooks. |
| **tags** | additive vocabularies + tag styles (lands on the same snapshot-mapping cascade that `bug-style-colors-not-persisted.md` needs). |
| **validation rules** | additive predicates → diagnostics (surface via status area; later the item-details pane). |

Plugin v0 (`design-plugin-v0.md`) becomes the trivial case: an extension
contributing only style defaults, activated as identity.

## Derived sizes (the immediate itch — first implementation slice)

With `fit` overflow (0bed763), rendered `w`/`h` are a pure function of
(text, fontSize, max-width) and the runtime already re-derives them on every
load (`restoreGraph` → `applyTextOverflow`) and text edit. The requested
"cache with invalidation on text change" already exists as
`DANode._nodeWidth/_nodeHeight`. So the change is serialization policy only:

- `snapshotToFiles`: omit style props equal to the resolved cascade value
  (today `next.kidraw.yaml` carries 61 identical `w/h/fontSize/textOverflow`
  blocks, and derived sizes churn every save/diff).
- `filesToSnapshot`: resolve missing props through the cascade.
- `w` is *input*, not derived, even in fit mode (base/max width): it moves
  into todo-graph's defaults; per-node `w` in a file stays legal as an
  override (e.g. manually resized card). Old files with explicit props keep
  working — they're just overrides. Positions always persist.
- Version skew accepted: if an extension's defaults change, old files render
  differently (rendering is app-side, as in editors).
- The org→kidraw converter emits `type: todo-graph` once instead of
  fabricating per-node style blocks.

## Todo-graph semantic backlog (user's examples, recorded 2026-07-12)

- **`depends-on` edge kind** with a direct creation command in the keymenu.
  Today every todo-graph edge means depends-on implicitly; explicit kinds
  matter as soon as a second relation exists (subtask-of, relates-to).
- **Task-set node kinds**: a node standing for a set of tasks where *all*
  must complete (AND) or *one of* suffices (OR), and sequential vs parallel
  ordering — i.e. the gateways of BPMN / petri-net workflow graphs. Implies
  validation rules and possibly layout behavior. **Open overlap with
  [`idea-zones.md`](idea-zones.md):** a task set might be better modeled as
  a zone containing its members than as a node wired to them — decide
  deliberately when this lands.

## Decisions (user, 2026-07-12)

1. **Activation: file-type hooks.** The identity extension pulls in
   companion extensions, editor-style.
2. **Key conflicts: warn loudly, don't fail.** A conflicting contribution
   gets automatically rebound (with a visible warning), and bindings stay
   manually changeable — consistent with the Key-Command Binding Language
   idea in the user's `next.org`.
3. **Slice order after persistence:**
   1. **Full edge-label support** — the pre-MVP item: anchor at start /
      middle / end, shiftable along the edge, below / above / on top of it.
   2. **Fix "Move by graph" navigation** — see
      [`bug-next-edge-out.md`](bug-next-edge-out.md); traversal is the
      keyboard-first backbone and currently unreliable.
   3. **Node gathering rework** — building on Gather / Gather All / Ungather
      (`1f6b43a`) and [`idea-gather-recursive.md`](idea-gather-recursive.md),
      and probably forcing the **node/edge collapse** question: collapsing a
      subtree into a single node/marker. Collapse interacts with the
      task-set node kinds above and with [`idea-zones.md`](idea-zones.md) —
      a collapsed subtree, a task-set, and a zone may be three faces of one
      mechanism; design them together, not thrice.

## Still open

- Where extensions live: app-registered only for now (like plugin v0);
  file-defined/user-defined extensions are a much later question.

Relates: [`design-plugin-v0.md`](design-plugin-v0.md),
[`idea-zones.md`](idea-zones.md),
[`bug-style-colors-not-persisted.md`](bug-style-colors-not-persisted.md),
[`decision-vault-model.md`](decision-vault-model.md) (external-edit reload
makes file-side simplicity matter), [`docs/file-format.md`](../docs/file-format.md).
