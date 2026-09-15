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
   - `d` ("doesn't follow") and `t` ("too detailed") mark the current
     statement with a badge, as an undoable edit. A statement has at most one
     mark, and the same key again clears it. `s` opens the chat with every
     marked statement attached, in reading order, and a ready-to-edit
     request.
   - Marks are tags (`feedback/doesnt-follow`, `feedback/too-detailed`) in
     the Explanation plugin's Feedback tag group, so they are saved with the
     graph and the agent sees them in `get_outline`. It removes each one once
     it has addressed it.
   - The path is re-read on every step, so steps the agent inserts while you
     read appear in place.
   - Esc stops reading. Esc in the chat goes back to reading.
   - The keymenu is suspended while reading and shows the reading keys (the
     same pattern as the chat).
5. **Markdown labels** (`markdown-label.ts`, DANode).
   - Node labels render `**bold**`, `*italic*` / `_italic_` and `` `code` ``,
     with backslash escapes. Anything that isn't a closed pair stays literal,
     so `2 * 3` and `snake_case` read as typed.
   - While editing, the label is its source: monospace, markers faded, code
     in blue, bold and italic shown. The caret and vim motions work on the raw
     text as before, since the raw `Konva.Text` still does the layout.
   - Fit sizing measures what is drawn: markers don't widen a box. A node can
     change size as editing starts or ends; it keeps its centre and its edges
     follow, the same as when typing grows it.
   - **Plugins opt in** (`labelFormat: 'markdown'`); Explanation does.
     Other graphs, including todo graphs, draw and edit labels exactly as
     before. Decided so existing graphs don't change font whenever editing
     starts; easy to flip if markdown should be everywhere.
   - The agent is told node text supports bold, italic and code.
6. **Detail level**: brief, standard or thorough, kept in this browser.
   - `:detail` shows or sets it; so does the Detail button under the chat
     input.
   - Every prompt carries it. The server tells the agent on the first prompt
     and whenever it changes, not with every message.
7. **Math** in node labels: TeX between single dollar signs.
   - MathJax 4 (`math-renderer.ts`) renders each formula as a self-contained
     SVG, with glyphs as paths and no web fonts, drawn on the canvas as an
     image.
   - MathJax is a lazy chunk (2.8 MB, about 750 kB compressed) that loads the
     first time a label has math. Until then the TeX shows as faded source,
     and labels lay out again when it arrives. The only always-loaded part is
     the small cache in `math-images.ts`.
   - A line with a fraction on it is taller. Formulas never break across
     lines.
   - Prices stay text (`$5 or $6`, the same rule as pandoc), and `\$` is a
     literal dollar. TeX that doesn't parse shows its source in red.
   - While editing, the TeX is purple. The agent is told to write formulas as
     `$…$` rather than Unicode.
   - MathJax 3 (`mathjax-full`) was tried first and dropped: npm marks it
     deprecated, and it pulled in an `@xmldom/xmldom` with known issues.

## Live check with Codex (2026-09-15)

A real Codex session, through the Docker runner, against a scripted tab:

- Asked to explain why there are infinitely many primes, it read the outline
  and made one `apply_changes` batch of 42 changes: 12 statements, 19
  supports edges, and a reading path numbered 1–11 without gaps.
- Told "this step doesn't follow" about step 6, with both statements
  attached, it inserted three intermediate steps in one batch and renumbered
  the path to 1–14.
- It wrote math as Unicode (p₁, ×, ⋯), so math rendering will be welcome.

A second run, after marks, detail levels and math were in:

- Asked the same question at detail "standard", it wrote 10 statements and
  a path numbered 1–9. It used `$…$` TeX in 8 of them and bold for the key
  terms.
- One middle step was then marked "doesn't follow" and the mark sent with
  detail "thorough". The agent added definitions (multiple, divides,
  remainder) and intermediate steps, growing the explanation to 18
  statements with the path renumbered 1–17. It cleared the mark in the same
  batch.

## Not yet

- Display math (`$$…$$`), and markdown and math in edge labels.
- Markdown in **edge labels** (`DALabel`).
- Marking statements outside reading mode (for example the selection).
- A live Codex run of marks and detail levels.
- **Draft mode** for agent edits.
- **References inside labels**, gather views, nesting. Explore later.
