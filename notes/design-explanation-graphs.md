# Explanation graphs

_2026-09-15. Branch `explanation-graphs` (off `agent-mode-v0`)._

The first main use of agent mode: the agent builds an explanation or tutorial
as a graph, and the reader walks it, points at the step that doesn't follow
(or is too fine-grained), and the agent rewrites that part live.

Related: [idea-mcp-server.md](idea-mcp-server.md) (agent mode),
[idea-multiplayer-readiness.md](idea-multiplayer-readiness.md) (terminology),
[idea-diagram-types.md](idea-diagram-types.md) (extensions).

## Decisions (Ben, 2026-09-15)

- One statement per node, roughly one sentence. Expect to iterate.
- No nesting for now: when something is too granular or not granular enough,
  the agent rewrites (merges or adds steps).
- The reader points at the thing that doesn't make sense, rather than quoting
  it or giving coordinates.
- The agent works explanations out from scratch (no source documents yet).
- The user must be able to stop the agent.
- Labels: bold, italic and code first; math after.
- Gather-style views need a lot of iteration, so not in the first pass.
- "Extension" in the code is "plugin" in the UI and in conversation.

## Vocabulary

- **Supports edge** (`explanation/supports`, blue): from a premise to the
  statement it helps establish. A statement can rest on premises from much
  earlier.
- **Reading path** (`explanation/path`, green): the order to read in. The
  label starts with the step number (`1`, `2`, …). A statement can appear on
  the path more than once.
- **Operation / undo group / change set**: as in
  [idea-multiplayer-readiness.md](idea-multiplayer-readiness.md). Each
  `apply_changes` call is one undo group with an author (`agent:codex`); each
  prompt turn is one change set.
- **Publish mode** (`live` | `draft`): per participant, not in the file. The
  agent edits in live mode only, so far.

## What is built

1. **Operations and undo groups** (`graph-operations.ts`,
   `graph-operation-applier.ts`). Add, remove and update for nodes and edges;
   removals carry full snapshots, and updates carry `before` values.
   `findConflict` checks a whole batch before anything is applied (all or
   nothing), and inverses make selective undo possible. `UndoRedoService`
   holds both snapshot entries (keymenu edits) and operation groups. Undoing a
   group that no longer applies cleanly is cancelled with a status message.
2. **Plugins**. The header's type chip shows the graph's plugin (diagram
   type). `:type` lists the plugins, `:type explanation` switches (`:plugin`
   works too). Plugins can declare **edge kinds** (tag, name, colour); an
   edge kind's colour wins over directedness and theme colours. The
   Explanation plugin declares the two kinds above and box nodes sized for a
   sentence.
3. **Agent edits** (`agent-change-planner.ts`, the `apply_changes` tool).
   - The agent sends changes by node label or id, with handles for nodes it
     adds in the same batch. The planner places new nodes below `near`, or
     below everything.
   - A batch that conflicts with newer edits changes nothing, and the agent is
     told to re-read the outline.
   - Changed nodes flash. "Undo the agent's last turn" in the chat reverts the
     turn's change set; keymenu undo steps back one batch at a time.
   - Stop (or Ctrl+C) refuses further edits until the user's next message.
   - The session preamble describes explanation style: one statement per
     node, supports edges from every premise, numbered path edges renumbered
     on insert, add steps where something doesn't follow, merge where too
     detailed.
4. **Reading mode** (`src/app/reading/`).
   - Root `e` (vim) or `h` (ijkl) starts reading at the selected statement if
     it is on the path, otherwise at step 1.
   - `n`/`p` move to the next and previous step, moving the view and marking
     the statement. `w` ("why?") marks and names the premises.
   - `d` ("doesn't follow") and `t` ("too detailed") open the chat with the
     current step and the one before it attached as reference pills, and a
     ready-to-edit request.
   - The path is re-read on every step, so steps the agent inserts while you
     read appear in place.
   - Esc stops reading. Esc in the chat goes back to reading.
   - The keymenu is suspended while reading and shows the reading keys (the
     same pattern as the chat).

## Not yet

- **Markdown labels** (step 5): rendered bold, italic and code when not
  editing; monospace with syntax highlighting while editing. Then math.
- **Persistent feedback marks.** For now, feedback is a chat message with
  pills; nothing stays on the canvas to show what is unresolved.
- **Detail level**, a general setting the agent reads, as Ben suggested.
- **Draft mode** for agent edits.
- **References inside labels**, gather views, nesting. Explore later.
- A live Codex run that writes an explanation end to end (tests so far use a
  fake agent).
