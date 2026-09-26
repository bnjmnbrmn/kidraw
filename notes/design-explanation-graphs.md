# Explanation graphs

> Renamed 2026-09-23: extensions are called plugins in the code too (`src/app/plugins/`, `KidrawPlugin`) — Ben's decision, [`design-plugins.md`](design-plugins.md).

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
- "Extension" in the code is "plugin" in the UI and in conversation. *(Superseded 2026-09-23: "plugin" everywhere, code included — Ben.)*
- The reading order is numbers on the statements, not edges. A statement
  read twice shows two numbers. (This replaced numbered path edges the same
  day.)
- Each statement carries its own assumptions ("where each $p_i$ is a
  prime…").
- A reader can mark a link as not following, as well as a statement.
- Assumptions are nodes linked to the statements that rely on them, so shared
  assumptions are visible. Definitions are nodes too, linked to their uses and
  read before them. Examples are encouraged, as nodes.
- The one-column layout isn't helpful: the agent lays the graph out.
- The chat shows markdown rendered by default, with the source a toggle away;
  label text copies into the chat and back out.
- Try non-math topics too (AI).
- Next: have the agent write real explanations, and record where they go
  wrong (`:note`).
- Definition and assumption links are drawn faint, except where reading
  first meets them, or when they otherwise need emphasis. (A live run linked
  one assumption to 30 statements and definitions to 65; drawn at full
  strength that was a tangle.)

## Vocabulary

- **Supports edge** (`explanation/supports`, blue): from a premise to the
  statement it helps establish. A statement can rest on premises from much
  earlier.
- **Reading order**: step numbers on the statements, as `step/N` tags drawn
  as a green badge. A statement the reader comes back to carries several
  (`1 · 5`). The agent sets the whole order at once with a
  `set_reading_order` change, so an inserted step can't leave the numbers
  broken.
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
   group that no longer applies cleanly is canceled with a status message.
2. **Plugins**. The header's type chip shows the graph's plugin (diagram
   type). `:type` lists the plugins, `:type explanation` switches (`:plugin`
   works too). Plugins can declare **edge kinds** (tag, name, color); an
   edge kind's color wins over directedness and theme colors. The
   Explanation plugin declares the two kinds above and box nodes sized for a
   sentence.
3. **Agent edits** (`canvas-change-planner.ts`, the `apply_changes` tool).
   - The agent sends changes by node label or id, with handles for nodes it
     adds in the same batch. The planner places new nodes below `near`, or
     below everything.
   - A batch that conflicts with newer edits changes nothing, and the agent is
     told to re-read the outline.
   - Changed nodes flash. "Undo the agent's last turn" in the chat reverts the
     turn's change set; keymenu undo steps back one batch at a time.
   - Stop (or Ctrl+C) refuses further edits until the user's next message.
   - The session preamble describes explanation style: one statement per
     node, carrying its own assumptions; supports edges from every premise;
     the full reading order sent again after any change; add steps where
     something doesn't follow, merge where too detailed.
4. **Reading mode** (`src/app/reading/`).
   - Root `e` (vim) or `h` (ijkl) starts reading at the selected statement if
     it is on the path, otherwise at step 1.
   - `n`/`p` move to the next and previous step, moving the view and marking
     the statement. `w` ("why?") marks and names the premises.
   - `l` points at the supports links into the statement one at a time, then
     back at the statement. A mark key then applies to that link.
   - `d` ("doesn't follow") and `t` ("too detailed") mark the current
     statement with a badge, as an undoable edit. On a link, `d` marks the
     link, which is then drawn in the mark's color. Each has at most one
     mark, and the same key again clears it. `s` opens the chat with every
     marked statement and link attached, in reading order, and a
     ready-to-edit request.
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
     change size as editing starts or ends; it keeps its center and its edges
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
8. **Assumptions, definitions and examples** are node kinds
   (`kind/assumption`, `kind/definition`, `kind/example`), drawn with a
   colored border and a name badge.
   - Each has a link kind in the same color. Like supports, links run from
     what the reader needs first to what builds on it: assumption → statement,
     definition → statement, statement → example.
   - Reading mode warns when a step comes before something it depends on.
     "Why?" names assumptions, definitions and examples along with premises,
     and `l` walks all the links in.
   - The agent sets kinds with `nodeKind`, and is told to give assumptions and
     definitions their own nodes and to add examples.
   - Assumption and definition links are background links (`faint` on the edge
     kind). They are drawn faint unless emphasized:
     - on the reading step that first uses that assumption or definition;
     - by "Why?", or when `l` points at them;
     - when either end is selected;
     - when the agent highlights them;
     - when they carry a feedback mark.
9. **Arrange.** An `arrange` change lays the graph out top-down
   (`layered-layout.ts`):
   - every node sits below what it depends on, and a definition or assumption
     sits just above its first use;
   - layers are ordered to cut crossings;
   - the moves are operations in the agent's change set, so undoing the turn
     puts nodes back, and pinned nodes stay put.

   The agent is told to end a batch with it.
10. **Chat markdown and copying.**
    - Chat messages render bold, italic, code, math, bullets and headings.
      "Show markdown" switches to the source.
    - Each message has a Copy button (markdown, with pills as their labels).
    - Copy on the canvas also puts a node's text on the system clipboard, and
      pasting while editing a label inserts clipboard text. So labels go into
      the chat and replies come back out.
11. **`:note <text>`** records a problem while trying an explanation. Along
    with the note it records the graph, reading step and statement,
    selection, and the agent's last reply. It goes to the debug log
    (`tools/debug.log` for the dev site) and this browser's storage. `:`
    works while reading.
12. **The chat message box types like a node label** (Ben asked for his vim
    keys there). The keymenu goes into label editing, so the keyboard hides
    while typing and there is no second stacked card.
    - Insert mode to start; Esc gives vim normal mode, and Esc again returns
      the keyboard to the canvas (or to reading).
    - Enter sends, Ctrl+C stops the agent, and paste inserts at the caret.
    - The draft lives in `ChatDraft` (`src/app/agent/chat-draft.ts`), which
      applies the same text commands a node label does.
13. **Source sharing for the agent.** With `KIDRAW_AGENT_SOURCE_DIR` set,
    the agent can read that source tree (read-only) to explain the code. See
    `agent/README.md` for what is hidden and which commands are allowed.

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

## Open design: statements that combine under a rule

Ben (2026-09-15) wants to show sets of statements joining to draw a
conclusion by a particular rule. This is natural-deduction territory (his
grad school work), but in English rather than symbolic logic. Statements
should carry their own assumptions, and context may later be shown with
links and nodes.

Today a conclusion has one supports edge per premise. So the graph can't say
which premises are used together, or by what rule.

1. **Inference node** (recommended). A small node sits between the premises
   and the conclusion: an edge from each premise into it, and one edge out to
   the conclusion. Its label is the rule in English ("by the definition of a
   prime", "combining the two", "by contradiction"). A conclusion reached in
   two independent ways has two inference nodes.
   - Marks get sharper meanings:
     - on a statement: "this isn't clear, or isn't justified";
     - on a link into the inference: "this premise isn't used, or doesn't
       apply";
     - on the inference node: "these don't give that" (wrong rule, or a
       missing premise).
   - It needs nothing new on the canvas: nodes and two-ended edges. The node
     could be a junction, or a small pill showing the rule.
   - The reading order stays on statements. "Why?" shows the rule and its
     premises together.
2. **Labeled edge bundle.** Keep one edge per premise, and group a
   conclusion's edges with a shared tag and a rule label where they meet.
   Lighter on the canvas, but there is nothing to point at for "the step as a
   whole", and a conclusion reached two ways gets confusing.
3. **Rule on the conclusion.** Put the rule in the conclusion's text or in a
   badge. Simplest, but it allows only one set of premises per conclusion and
   leaves nowhere to mark the inference itself.

Questions for Ben:
- Is option 1 close to what you had in mind?
- Should rules be free English, or come from a small vocabulary that the
  agent extends by defining new rules as statements?
- Should assumptions become nodes that steps depend on (like hypotheses that
  are later discharged), or stay in each statement's text as they do now?

## Not yet

- Display math (`$$…$$`), and markdown and math in edge labels.
- Markdown in **edge labels** (`DALabel`).
- Marking statements outside reading mode (for example the selection).
- A live Codex run of marks and detail levels.
- **Draft mode** for agent edits.
- **References inside labels**, gather views, nesting. Explore later.
