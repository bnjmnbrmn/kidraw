---
title: Multiplayer readiness — code now so real-time collaboration is straightforward later
type: idea
---

# Multiplayer readiness

**Status:** principles, 2026-09-14 (Ben + Claude). Multiplayer itself is not scheduled. The goal is that code written now — especially agent mode ([idea-mcp-server](idea-mcp-server.md)) — doesn't have to be torn up when graphs become multi-player like Google Docs.

## Terms

- **Key profile:** which physical keys do what — KiDraw's vim (default) and ijkl profiles ([architecture-key-profiles](architecture-key-profiles.md)). A personal setting; collaborators keep their own.
- **Presence** (Yjs calls it *awareness*): live "where is everyone and what are they doing right now" — crosshairs position, selection, viewport, whether they're typing in a label, who they're following. The colored cursors in Google Docs. Shared in real time, never saved to the file, never undoable.
- **Command vs. operation:** a *command* is an intent that depends on local context ("drag the selection left", `DRAG_SELECTED_LEFT`). An *operation* is the concrete, context-free change it produces ("move `n6` to (120, 40)", with author). Commands produce operations; only operations change the document.
- **The operation path:** the single pipeline every change goes through — `apply(op)` validates it, updates the graph model, records its inverse for undo, notifies the renderer, schedules auto-save, and later broadcasts to collaborators. Today each `DrawingAreaComponent` command case mutates Konva objects itself.
- **Per-participant undo** (a.k.a. *local undo*; the research term for undoing specific earlier changes is *selective undo*): undo reverts **your own** most recent change, never someone else's. The alternative, *global undo* (revert the last change by anyone), is widely considered confusing and is not planned.
- **Revert:** deliberately undoing a *specific* change, possibly someone else's, from a history or review list — distinct from pressing undo.
- **Editing modes and change-set states** (revised 2026-09-14; avoid "shared" as an adjective for changes — the *document* is always shared, which makes "shared change" vs "shared mode" ambiguous):
  - **Change** is the umbrella term (Ben, 2026-09-14): a change is an operation or a group of changes, nested like the composite pattern.
    - **Operation:** the smallest, indivisible change (relabel a node, move a node, delete an edge).
    - **Undo group** (Ben, 2026-09-14; the same term Apple's `NSUndoManager` uses): the operations from one user action — one keystroke, one agent tool call — grouped automatically and applied together; one undo step. It is also the natural unit for auto-save and for broadcasting to collaborators, even though it's named for undo.
    - **Change set:** a named, reviewable group of undo groups, created deliberately and accepted or rejected as a unit (the git-like part); may span many actions.
    - Undo groups and change sets are both groups applied together; the names distinguish their purpose (automatic per action vs. deliberate and reviewable). "Transaction" is avoided because it blurs the two.
  - **"Atomic" means all-or-nothing** (as in databases), which is true at every level: an operation, an undo group, and a change set each apply entirely or not at all. So "operation" alone names the smallest unit; "atomic" describes how any change is applied.
  - **Live mode:** your changes are **published** to everyone as you make them (Docs-like, incremental).
  - **Draft mode:** your changes collect in a private change set until you **publish** it (or **propose** it for review) — like a branch or Docs' suggesting mode.
  - **Change-set states:** draft → proposed → accepted / rejected. Individual changes are **published** or **unpublished**.
  - **Naming (decided 2026-09-14):** code and the file model use one name, **change set**, for the whole lifecycle, so nothing is renamed as its state changes. User-facing text names the current state instead: "Your draft (7 changes)", "Agent's draft: MVP cleanup", "Proposal from Claude". An accepted change set simply becomes history.
  - "Incremental" and "atomic" describe granularity and are only needed when discussing that axis; live mode implies incremental publishing, draft mode implies atomic publishing.
  - This is a different question from undo.

## Core idea: an agent is just another participant

Agent mode *is* multiplayer with one AI participant. Presence (crosshairs, selection, viewport), pointing, captions, follow mode, and change attribution should be built **once, for any participant** — a person in another browser or an agent — not as agent-only features.

## Three kinds of state — keep them separate

1. **Shared document state:** the graph (nodes, edges, labels, tags) and shared style sets (views, tours, captions). Persisted, synced, undoable.
2. **Per-participant awareness (presence):** crosshairs position, selection, current viewport, who they're following, which label they're editing. Broadcast to others, never persisted, never undoable.
3. **Local preferences:** theme, key profile, keymenu layout, window size. Never shared.

New code should never mix these; e.g. panning must not touch the undo stack or the saved document.

## Concrete seams in today's code

- **Operations, not snapshots.** All mutations — keyboard commands, agent tools, and later remote edits — become operations (`{ id, author, kind, target, fields, expect? }`) applied through **one apply path** to a graph model; the renderer reacts to model changes regardless of who caused them. This is the "separate graph model from rendering" item in [idea-drawing-area-refactor](idea-drawing-area-refactor.md). Today `DANode`/`DAEdge` are Konva objects mutated directly inside `DrawingAreaComponent` (~8,700 lines).
- **Undo is per participant and operation-based.** Today `UndoRedoService` stores **whole-graph snapshots**; with several editors, undo would restore the whole graph and erase other people's work. Undo should instead apply inverse operations of *your own* changes. The same mechanism gives agent "tracked changes" per-change revert, so it pays off before multiplayer.
  - **How:** every operation records its inverse when applied — relabel `A→B` records relabel `B→A`; add node records delete node; delete node records re-adding the node *with* its edges, positions, and tags; move records the move back.
  - **One keystroke, one undo step:** compound actions (e.g. insert node + connect edge + start label edit) are grouped into one undo group that undoes as a unit.
  - **When an inverse no longer applies** (someone else deleted or changed the item since), skip or adjust that part rather than failing — Yjs's undo manager handles this if adopted later.
  - **Migration:** keep snapshot undo working while commands move over one at a time; test each operation with "apply, then apply its inverse, gives back the original graph".
- **Globally unique ids.** Today `nextId()` returns `da-${++counter}` per tab (reserving only `da-N` ids on load), so two participants would mint the same ids. New elements need collision-free ids (random, e.g. nanoid, or client-id-prefixed). Keep reading existing `da-N` / `n0` ids unchanged.
- **Author on every operation**, so attribution ("added by Ben", "agent: tour-bot") and per-participant undo come for free.

## Views with several people

- Views are world-space rectangles fitted into each participant's own window (already the plan), so everyone sees at least the intended region whatever their screen size.
- **Presenting to followers:** optionally compute the common safe region — the largest rect every follower can see given their window sizes and aspect ratios (Ben's "minimal screen width/height for the people working on the graph") — and show the presenter an outline of it, like a video safe area.
- Headless agents have no window; they work purely in world-space rectangles.

## Taking and retaking control of the view

One follow model for humans and agents:
- **Following** — someone else (the tour, the agent, or a presenting colleague) drives your camera.
- **Free** — you drive. Others' "look here" requests appear as indicators (an edge-of-screen arrow, "Agent is showing *Pre-MVP* — press `F` to follow") instead of moving your view.
- **Any manual view input** (pan, zoom, navigation keys) switches you to Free immediately; tour next/back or the Follow key switches you back. No camera fighting: others' view commands are ignored for a moment after your own input.
- "Look at what I'm looking at" is the reverse: let others (or the agent) follow *you*.

## Defaults (leaning, 2026-09-14)

- **Undo:** per participant, always.
- **Editing mode:** people edit in **live mode** by default (Docs-like); **draft mode** (branch / suggesting) is opt-in. For agents, draft mode may be the better default — that's the open change-model question in [idea-mcp-server](idea-mcp-server.md).
- **Presence and view state:** never operations on the document at all.

## Conflicts

- Structural and field edits: per-field last-writer-wins is usually enough, plus operation preconditions (`expect`) where intent matters (agents especially).
- Label text being typed by two people: show "Ben is editing this label" presence first; collaborative text (per-character merging) only if needed.
- Agents' change sets (git-like vs Docs-like) are an open question in [idea-mcp-server](idea-mcp-server.md); operations support either.

## Later, not now

- **Sync library:** likely a CRDT. Yjs is the obvious candidate (awareness protocol for presence, undo manager scoped per participant, WebSocket providers); Automerge is the alternative. Don't adopt yet — design the operation/model layer so a CRDT-backed store can replace the in-memory one.
- **Sync host:** the same authenticated `wss://` pattern as the remote `kidraw-agent`; plausibly the deferred cloud vault ([decision-vault-model](decision-vault-model.md)). YAML files remain the export/snapshot format.
- **Roles:** owner, editor, commenter, viewer — and agents get a role too (e.g. "suggest only").

## Cheap things to do now

1. Route new mutations (starting with agent tools) through operations and a single apply path.
2. Give new elements collision-free ids.
3. Convert undo to inverse operations when undo is next touched.
4. Keep awareness state out of the document and the undo stack in all new code.
5. Put an author on operations.
