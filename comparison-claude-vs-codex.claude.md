# Two reviews of KiDraw, side by side

Claude and Codex reviewed the same codebase on the same day without seeing each
other's work. This is my comparison of the two, written before either of us
proposes a combined plan.

**Short version:** the two reviews barely overlap, and both are right. Codex
looked at what the architecture cannot guarantee and found real data-loss bugs.
I looked at what actually broke in the interface this week and built a
regression net for it. Neither is a substitute for the other, and Codex's half
is the more urgent one.

---

## 1. What each of us produced

| | Claude | Codex |
| :--- | :--- | :--- |
| Review document | `claude-proposed-tests/README.md`, 253 lines | `codex-proposed-tests/README.md`, 671 lines |
| Proposed README | `README.claude-proposal.md`, 238 lines — a replacement for the CLI boilerplate | (the review doubles as the handoff) |
| Tests | 4 karma specs (76 assertions) + 2 node scripts | 2 node scripts (6 assertions) |
| Test state | **64 green**, guarding contracts | **6 red by design**, characterising gaps |
| Method | Reproduce the bug in the running app, then encode the invariant | Read the source, extract the policy sets, diff them against intent |
| Production code touched | one key rebinding (`g`-`r` → `g`-`u`) | none |

Both of us stayed in our own folder and left the other's alone.

---

## 2. Where we agree

Three findings arrived independently from opposite directions, which makes them
the safest bets in either document:

1. **`DrawingAreaComponent` is the bottleneck.** 8,518 lines, ~124 command
   cases, and both of us proposed extraction as the highest-leverage structural
   change. Our extraction orders differ (below), but not the diagnosis.
2. **Application state has several authorities.** Codex describes it in general
   (`AppComponent` assigning fields on `ViewChild`s, notifications racing);
   I hit the same thing concretely — the header's mode chip going stale, and my
   README calls the field-assignment pattern out as the wart not to copy.
3. **Nothing runs automatically.** No CI, no lint gate, `CHROME_BIN` unset, and
   50 Playwright scripts nobody runs. Both documents ask for this first-class.

---

## 3. Where we don't overlap at all

This is the interesting part. Mapped by bug class:

| Bug class | Claude | Codex |
| :--- | :---: | :---: |
| Undo/autosave policy drift (a command edits the graph with no undo entry) | — | **yes** |
| Stale async results (routing worker answering for an older graph) | — | **yes** |
| Persistence: draft only on `beforeunload`, dirty state inferred from a timer | — | **yes** |
| Lifecycle: timers, observers, Konva stages not disposed | — | **yes** |
| Per-item colour not surviving a snapshot round trip | — | **yes** |
| File-open conflating cancel with failure | — | **yes** |
| Accessibility: `tabindex="-1"` on settings, global key guard too narrow | — | **yes** |
| Chord ergonomics (a chord the hand cannot make) | **yes** | — |
| Timing-dependent chord meaning (fast Shift+U ≠ held Shift+U) | **yes** | — |
| Geometry expressed twice (caret vs label box; CSS vs TS constants) | **yes** | — |
| Overlays as stale snapshots (the dashed outline beside its node) | **yes** | — |
| Placement/layout constants blind to node size | **yes** | — |
| Menu contract regressions (labels, keys, undrawn bindings) | **yes** | — |
| Repro-script rot with no baseline | **yes** | partly |

The split is not accidental. My inputs were the bugs Ben reported this week,
all of which were visible on screen. Codex's inputs were the invariants the
source cannot enforce, most of which are invisible until you lose work.

**Codex's half contains the worse bugs.** A caret drawn 40px off is annoying;
a colour that silently does not survive undo is data loss.

---

## 4. I checked Codex's findings against the running app

Its tests are source parsers and its document is careful to call them
characterization tests, so I verified the three highest-stakes claims
independently rather than take them on faith.

| Claim | Verdict | Evidence |
| :--- | :--- | :--- |
| Per-item colour does not round-trip through `GraphSnapshot` | **Confirmed** | Set a node red (`#ffcccc`), serialize, restore → `#ffffff`; the snapshot JSON contains no colour at all |
| `SET_LINE_STYLE` is missing from the undo policy | **Confirmed** | solid → dashed, then Undo → **still dashed**. The change is not undoable |
| Caret blink intervals leak when a node is removed | **Confirmed by reading** | `DrawingLayer.removeNode` calls `konvaGroup.remove()` and splices the array; it never calls `hideCursor()`, and `_cursorBlinkTimer` is a `window.setInterval` |
| `CYCLE_EDGE_DIRECTEDNESS` takes two snapshots → "two Undo operations" | **Real but milder** | Cycling reversed the edge; **one** Undo restored it; the second Undo did nothing. The duplicate costs a wasted undo step, not an un-undoable change |
| Its 6 assertions fail as documented | **Confirmed** | `node --test codex-proposed-tests/*.test.mjs` → 6 failed, each printing the gap it found |

That is a strong hit rate for a review done without running the app.

---

## 5. Honest assessment

### Codex's review

**Strengths.** It found the bugs that matter most and that nobody would notice
until they cost work. The architectural spine it proposes —
`COMMAND_POLICY` → `CommandResult` → one `EditorState` publication → document
revisions — is the right shape, and it is proposed incrementally with a
"what not to do" section that specifically warns against a big-bang rewrite.
The phased sequence and "definition of done" are directly usable as a plan.

**Weaknesses.**
- **It is not a README.** Ben asked for something a rusty reader can land on;
  this is a 671-line reliability review. It never says how to run the app, what
  using it feels like, or what a key card means. Someone reading it still
  cannot open KiDraw and do anything. Its Angular glossary is good and its
  source map is good — both belong in a README that has a tour in front of them.
- **The tests parse source text.** They regex over
  `drawing-area.component.ts` for policy-set membership. Codex says plainly
  that these are temporary, but as written they will break on a rename or a
  reformat, and being red by design they cannot gate anything.
- **Nothing was verified against the running app**, which is why one of its
  four undo claims overstates the symptom.
- **Volume.** Nine findings, five phases, seven pull requests, a definition of
  done and a not-to-do list is a lot to hold. The single most important
  sentence — colour silently does not persist — is on line 380 of 671.

### My review

**Strengths.** Every finding is a bug Ben actually reported, reproduced before
and after; the tests are green and guard contracts rather than describing them;
`repro-health.mjs` converts 50 rotting scripts into one signal; and the README
is written for the person who has to come back to this in a year.

**Weaknesses.**
- **Narrow.** I looked where the week's bugs were — geometry, overlays, the
  menu — and never asked whether an edit is undoable or whether a file write
  can fail silently. Codex asked, and the answers are worse than anything in my
  list.
- **My tests are green by construction.** They encode contracts that hold
  *because I had just fixed them*. That guards regressions, but it surfaced
  only two latent bugs (a same-finger chord, a stranded command) where Codex's
  red tests surfaced seven.
- **My proposal under-specifies the destination.** "Extract `overlays.ts`" is a
  direction; Codex's `CommandResult` is a design.

---

## 6. What this implies for a combined plan

Not the plan itself — that comes next — but the shape is already clear:

- **Codex's correctness spine is the backbone.** Command policy, transaction
  result, single state publication, document revisions, disposal. That is where
  the losable bugs are.
- **My invariants are the net under it.** While that surgery happens in the
  8,518-line file, the geometry/menu/overlay contracts are exactly what a large
  refactor breaks silently. Green tests that fail loudly are worth more during a
  refactor than after it.
- **Sequencing matters and we disagree slightly.** Codex extracts command
  policy first; I would put `repro-health --update` and the invariant specs
  first, because they are hours of work and they make every subsequent
  extraction safe to attempt.
- **The README should be one document, not two.** My tour, Angular refresher
  and house rules; Codex's source map and glossary; the review content lives in
  `notes/` where the project's memory already is.

The immediate items, on which I do not think there is any disagreement worth
having: **colour round-trip or remove the colour command**, **`SET_LINE_STYLE`
into the undo policy**, **dispose caret timers on removal**, and **CI**.

---

## 7. On the header

Ben's stated cleanup — restyle the header to match the keymenu — sits neatly
inside Codex's Finding 3. The header is the clearest case of state pushed by
field assignment through a `ViewChild`, so rebuilding it is the natural first
consumer of an `EditorState` service: it stops being told what to display and
starts rendering what is true. Doing the restyle without that is a fifth copy
of the chip styling on top of an unchanged sync problem.
