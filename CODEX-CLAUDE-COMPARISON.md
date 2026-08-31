# Claude and Codex proposal comparison

Date: 2026-08-30

Comparison base: local main at ddaf9bb, including Claude’s proposed project
README, Claude’s tests and review, and the Codex tests and review.

## Bottom line

The proposals are complementary.

Claude’s work is strongest where KiDraw is most distinctive: keyboard
ergonomics, geometry, visual overlays, placement, recent bug history, and a
practical introduction for someone returning to the application. Its 64
Angular tests exercise real TypeScript/Konva behavior and currently pass.

The Codex work is strongest below the visible interaction layer: command
transactions, undo boundaries, autosave, stale shared state, asynchronous
routing, resource disposal, file failure handling, persistence, and
accessibility. Its six tests intentionally fail because they are issue
detectors for behavior the current architecture does not yet guarantee.

Neither should replace the other. Claude covers “does this interaction still
feel and draw correctly?” Codex covers “did the action participate in every
system-level responsibility it should have?” KiDraw needs both.

For the project’s main README, Claude’s README.claude-proposal.md is the better
starting point. The Codex README is better retained as an engineering review,
not used as the front door to the project.

## Artifacts compared

| Artifact | Purpose | Current behavior |
| --- | --- | --- |
| README.claude-proposal.md | Proposed project-level introduction | Documentation only |
| claude-proposed-tests/README.md | Recent-bug analysis and recommendations | Documentation only |
| src/claude-proposed-tests/*.spec.ts | Keyboard, caret, overlay, and placement invariants | 64 of 64 pass |
| claude-proposed-tests/check-command-wiring.mjs | Static command reachability check | Passes, with one dead command noted |
| claude-proposed-tests/repro-health.mjs | Baseline runner for Playwright repro scripts | Partially baselined |
| codex-proposed-tests/README.md | Systemic reliability and interface review | Documentation only |
| codex-proposed-tests/command-effect-registry.test.mjs | Undo, autosave, context, and routing policy checks | Four expected failures |
| codex-proposed-tests/lifecycle-cleanup.test.mjs | Resource and caret-timer cleanup checks | Two expected failures |

## The shared diagnosis

Both reviews independently arrive at the same architectural problem:

> One fact is represented in multiple places, and correctness depends on
> remembering to update every representation.

Claude found this in interaction and geometry:

- a label and node supplied competing geometry to the caret;
- an overlay remembered an old node box;
- key behavior depended on both a binding tree and special interception code;
- keyboard ergonomics existed in design notes but not executable data;
- placement mixed fixed distances with variable node sizes.

Codex found the same pattern in command and application state:

- a command’s effects are repeated across mutation, context, routing, and
  handler-specific lists;
- the canvas, header, keymenu, undo service, and file session can hold
  different versions of editor state;
- “dirty” is inferred from a pending timer instead of explicit document state;
- resource creation and resource disposal are separate, incomplete lists.

This can be summarized as four layers of duplicated truth:

1. Interaction truth: what a key does, what card is drawn, what the hand can
   press, and which listener currently owns the keyboard.
2. Geometry truth: the object’s box, its text box, cached overlays, and layout
   spacing.
3. Transaction truth: what changed, whether it is undoable, whether it is
   persistent, whether routing is now obsolete, and what shared state changed.
4. Lifetime truth: which object created a subscription, timer, worker, browser
   observer, or Konva resource and therefore must release it.

The common design principle should be “one fact, one owner, derived views.”

## Coverage comparison

| Area | Claude | Codex | Combined conclusion |
| --- | --- | --- | --- |
| Product onboarding | Excellent five-minute tour and mental model | Shorter architecture glossary inside an engineering report | Use Claude as the project README |
| Recent bug history | Strong, names concrete failures and dates | Broader static review, less tied to reports | Preserve Claude’s history as project memory |
| Keyboard ergonomics | Strong finger/chord invariants for both profiles | Notes global focus interception and accessibility | Put physical-key metadata in production, then test both ergonomics and focus ownership |
| Chord timing | Identifies the hold-timing failure and proposes a test | Not covered | Add a real timing-independent event test |
| Command reachability | Static declared/emitted/handled check | Exhaustive effect-policy proposal | Reachability is necessary but not sufficient; every reachable command also needs an effect policy |
| Undo granularity | Notes node-plus-label intent mismatch | Finds missing and duplicate snapshots | Centralize transactions and define user-intent undo units |
| Autosave and drafts | Notes beforeunload staleness | Detailed document/saved/draft revision model | Make persistence transaction-driven |
| Async routing | Mentions stale routing in bug explanations | Finds missing locks and proposes revision tokens | Revision-check every worker result |
| Header state | Identifies ViewChild field assignment and stale mode | Generalizes to one EditorState authority | Replace direct assignments with bound shared state |
| Header appearance | Specific shared tokens, floating layout, viewport inset | Accessibility, responsive state, and persistent save status | Do the visual restyle on top of shared state and shared layout tokens |
| Geometry | Strong caret, overlay, and placement tests | Notes colors missing from snapshots | Keep behavioral geometry tests and add full snapshot round trips |
| Lifecycle cleanup | Not covered | Finds subscription, observer, frame, timer, stage, and caret cleanup gaps | Add behavioral disposal tests |
| File interaction | Mentions vault and draft workflow | Finds picker race and cancellation/error conflation | Introduce typed file-operation results and test slow reads |
| Accessibility | Mostly discoverability and mode visibility | Tab order, focus ownership, dialogs, aria-live, responsive header | Treat this as a separate interface workstream |
| No-op feedback | Strong rule that every declined command speaks | Recommends visible persistent save/errors | Use one non-blocking status/notification system |
| Component decomposition | Concrete overlay, label-edit, and grow-mode extractions | Transaction, model, state, session, and routing extractions | Extract pure policy/state first, then the interaction controllers |
| Test infrastructure | Repro baseline runner and command smoke check | CI pyramid and systemic invariant plan | Harden Claude’s tools, turn Codex failures green, then wire both into CI |

## What Claude adds that Codex did not

### A usable project front door

README.claude-proposal.md answers the questions a returning maintainer asks
first:

- What is KiDraw?
- How do I make a tiny graph?
- What is the keymenu?
- Which component owns which visible area?
- How do commands move through the app?
- What should I run locally?
- Which source files matter first?

The Codex README assumes the reader already wants a reliability review. It is
too long and too problem-focused to be the main project README.

### Evidence from actual interaction failures

Claude traces recommendations to recently observed regressions: caret
placement, stale overlays, impossible chords, timing-dependent Shift behavior,
placement gaps, global key interception, and stale repro scripts. This makes
the recommendations easier to trust and prioritize.

### Stronger executable geometry coverage

The caret and placement suites run matrices over real DANode and
DrawingAreaComponent behavior. The overlay tests manipulate real Konva shapes.
These are closer to behavior than either Codex source parser.

### Keyboard-specific invariants

The keymap suite captures a product constraint generic web tests would miss:
the displayed shortcut must be physically pressable while its hub is held.
It also checks card visibility, submenu labels, and both keyboard profiles.

### Repro-suite visibility

The repository already has 50 Playwright repro scripts. A single health runner
and checked-in baseline is a sensible way to stop that evidence from silently
rotting.

### Specific header design guidance

Claude connects the header restyle to shared chip tokens, canvas occlusion, and
input-driven state. That is more actionable visual design guidance than the
Codex interface section.

## What Codex adds that Claude did not

### Command effects beyond “a handler exists”

A command can reach a handler and still be wrong. The current code can:

- change the graph without creating an undo record;
- change the graph without scheduling autosave;
- create two undo snapshots for one action;
- leave the header’s Undo state stale;
- change geometry while a routing result for the old geometry is in flight.

The Codex test names the current examples of each failure class.

### Explicit transaction semantics

The Codex review separates document mutation, selection mutation, geometry
mutation, and view-only mutation. That distinction is needed to answer:

- Does this action dirty the file?
- Should it be undoable?
- Should it invalidate routing?
- Should it refresh shared state?
- Is a no-op allowed to create history?

Claude’s “every command has a handler” invariant cannot answer those questions.

### Persistence as state, not timers

The Codex review proposes documentRevision, savedRevision, and draftRevision.
This is stronger than debouncing alone because failed, cancelled, superseded,
and cross-document saves remain representable.

### Asynchronous correctness

Codex proposes revision tokens for routing and file operations. Cancellation
helps performance, but a revision comparison is what prevents a late result
from changing a newer document.

### Lifecycle ownership

Claude’s tests instantiate several timer-owning objects but do not examine
their disposal. The Codex review identifies incomplete teardown of the drawing
area and caret intervals on removed nodes/labels.

### Accessibility and native-control focus

Claude examines whether keymenu actions are visible. Codex also examines
whether native settings are reachable at all and whether global shortcuts can
fire behind a focused select, button, summary, or dialog.

### File failure semantics

Codex distinguishes user cancellation, read failure, parse failure, and
permission failure, and notes the 200 ms focus fallback race in FileIoService.

### Snapshot completeness

Codex finds that per-item runtime colors are not represented in GraphSnapshot
and can be overwritten by theme application. Claude’s geometry suites do not
exercise undo/file/draft round trips.

## Test results independently verified

The following commands were run during this comparison.

### Claude Angular invariants

    CHROME_BIN=/home/bot/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
      npx ng test --watch=false --browsers=ChromeHeadless \
      --include='src/claude-proposed-tests/**/*.spec.ts'

Result:

    TOTAL: 64 SUCCESS

### Claude command wiring

    /usr/bin/node claude-proposed-tests/check-command-wiring.mjs

Result:

    121 commands declared
    73 detected as reachable from a menu
    120 detected as handled by the drawing area
    0 emitted commands reported unhandled
    1 declared command reported stranded: OPEN_INSERT_SUBMENU
    exit status 0

### Codex reliability guards

    /usr/bin/node --test codex-proposed-tests/*.test.mjs

Result:

    tests: 6
    passed: 0
    failed: 6

The Codex failures are intentional. They enumerate unresolved gaps rather than
regressions introduced by the test commit.

The full Claude repro-health run was not repeated for this comparison. It
requires the running development app, can invoke 50 browser scripts
sequentially, and only seven scripts currently have baseline entries.

## Test-quality review

### Claude suite: strengths

- Most assertions execute real application or Konva behavior.
- Matrix tests cover more combinations than one-bug-one-example tests.
- Tests encode KiDraw-specific product invariants.
- The Angular subset is fast once compiled.
- Comments explain the user-visible failure behind each contract.
- The repro runner turns scattered scripts into one discoverable command.

### Claude suite: limitations to fix

1. The duplicate-key test cannot detect duplicate keys already overwritten in
   an object literal. It reads the finished object, where keys are necessarily
   unique, and then compares that list with its own Set. Detect duplicates at
   construction time, use an entry-array representation, or add a source/AST
   check until the configuration changes shape.

2. The finger map and accepted hard-chord exceptions live in the test. That
   duplicates the product rule. Move finger identity and explicit ergonomic
   exceptions into typed production metadata, then test the real metadata.

3. “64 green” includes accepted exceptions and skipped cases. Five difficult
   ijkl chords and two deliberately off-card Ctrl-[ bindings are allowlisted;
   overwide caret lines and clip mode are excluded; a 2 px tolerance accepts a
   known Konva measurement difference. Green means “matches today’s declared
   policy,” not “all findings are fixed.”

4. The overlay file discusses both hover and navigation-landing overlays, but
   its assertions exercise crosshairHoverHighlight only. Add a landing-ghost
   movement/resize assertion or narrow the claim.

5. Several tests construct objects through Object.create, use private fields
   through any, or inspect Konva’s internal textArr. These are useful
   characterization tests but will be brittle during extraction. Move the
   geometry into exported pure functions so tests can target supported APIs.

6. The caret tests call showCursor without disposing the node or hiding the
   cursor. The short-lived Karma process masks the interval ownership issue
   identified by Codex. Add afterEach cleanup now and disposal assertions when
   the object API exists.

7. check-command-wiring.mjs is regex-based. Its shellHandled set counts every
   DACommandType reference in AppComponent, including emissions, so a
   shell-emitted command can look handled simply because it was emitted there.
   Parse explicit dispatch/handler sites or replace the check with typed
   registration.

8. repro-health.mjs ignores the child process exit error except for patterns
   found in output. A nonzero exit with unfamiliar text, or zero PASS and zero
   FAIL lines, can be classified as passing. Treat nonzero exit, signal, and
   timeout as first-class failures.

9. Only seven of 50 repro scripts are baselined. An unbaselined failing script
   is reported as unknown but does not make the runner exit nonzero. Complete
   and review the baseline before presenting the runner as a CI gate.

### Codex suite: strengths

- It finds systemic omissions that passing interaction tests do not cover.
- Failure messages list the exact commands or resources requiring a decision.
- It does not modify Angular/Karma configuration or production code.
- It runs quickly without a browser.
- It explicitly labels itself transitional instead of presenting source
  parsing as the desired architecture.

### Codex suite: limitations to fix

1. Both files parse source text with regular expressions. Renaming, formatting,
   comments, or refactoring can break or accidentally satisfy them without
   changing behavior.

2. The persistent-edits list is duplicated test knowledge. The correct
   destination is an exhaustive production policy and behavioral transaction
   tests.

3. Permanently red tests are poor CI gates. Fix one failure group at a time,
   convert its assertion to a green test of the exported policy/behavior, and
   track remaining work separately.

4. The lifecycle check looks for cleanup spellings rather than proving that
   callbacks stop. A comment or unused call could satisfy it. Replace it with
   fake timers, spies, component destruction, and idempotent dispose tests.

5. The command test assumes the current MUTATING_COMMANDS classification is
   itself correct. In particular, selection mutation and document mutation
   need an explicit product decision before the policy is frozen.

6. There is no real keyboard, geometry, canvas, or browser coverage. Claude’s
   suite fills that gap.

7. Some review findings, such as the slow file-read race and item-color
   persistence, are strong static inferences but do not yet have reproductions.
   Add focused tests before changing behavior.

## README comparison

### Claude’s proposed root README

Use this as the basis for README.md. It has a clear voice, shows the product
before explaining the code, and gives a returning maintainer a working mental
model quickly.

Recommended corrections before adoption:

- “Four standalone components” is too literal. The application currently has
  additional component files for the compact menu, ex line, and navigation
  popup. Say “four main surfaces” or show the supporting components.
- “No dragging” is ambiguous because KiDraw has drag commands. Say “no
  mouse-dragging required” if that is the intended distinction.
- Machine-specific Chrome paths, memory pressure, and watcher state will age
  quickly. Keep stable commands in README.md and move workstation details to
  AGENTS.md or dev-status.md.
- Exact line counts, command counts, unit-test counts, and repro counts are
  useful now but will stale. Date them, generate them, or use approximate
  wording.
- The README should link to the reliability roadmap rather than contain too
  much cleanup planning itself.

The five-minute tour, component diagram, command flow, key-card explanation,
source map, and Angular primer should remain.

### Claude’s reliability README

Keep it as a dated engineering note. Its bug genealogy is valuable project
memory and should not be collapsed into a generic best-practices list.

The test-status table needs language that separates:

- fixed findings;
- accepted product decisions;
- excluded or tolerated cases;
- still-unimplemented proposed tests.

### Codex’s reliability README

Keep it as the systemic engineering appendix. It is intentionally more
complete than a root README and provides the transaction/persistence/lifecycle
roadmap Claude’s onboarding document does not.

Consider moving both engineering reviews under notes/reliability/ after the
comparison is accepted, with stable links from the root README. Their current
test folders are useful during proposal work but are not the clearest
long-term documentation location.

## Recommended merged principles

1. One fact has one production owner.
2. Every command is reachable, exhaustive, and has one typed effect policy.
3. Handlers report what changed; transaction infrastructure owns undo, dirty
   state, autosave, context publication, and async invalidation.
4. Derived visuals are rebuilt from current model state through one
   invalidation path.
5. Geometry comes from model boxes and shared dimension functions, not copied
   constants.
6. Async work carries a document/session revision and obsolete results are
   ignored.
7. Every created resource has one idempotent disposal owner.
8. A declined, failed, or unavailable action explains itself without a
   blocking browser alert.
9. Keyboard-first behavior yields to native controls and remains accessible.
10. Product invariants are executable and run automatically.

## Recommended merged work order

### Step 0: make the evidence trustworthy

- Keep Claude’s 64 behavioral assertions.
- Fix the tautological duplicate-key assertion.
- Add cleanup to caret tests.
- Harden command-wiring parsing or replace it with typed registration.
- Make repro-health honor exit codes/timeouts and baseline all 50 scripts.
- Add package scripts so contributors do not copy a workstation-specific
  Chrome path.
- Decide which test groups are fast enough for every push and which are
  scheduled/browser checks.

### Step 1: repair current transaction bugs

- Define document, selection, geometry, and view effects for every command.
- Resolve the seven known mutation omissions.
- Resolve the three known duplicate-snapshot paths.
- Refresh shared context after every relevant action.
- Add a routing/document revision and reject stale worker results.
- Convert each repaired Codex assertion into a green policy or behavioral
  test.

### Step 2: fix lifetime and persistence

- Complete DrawingAreaComponent teardown.
- Add dispose methods to timer-owning graph/Konva objects.
- Replace timer-as-dirty-state with document/saved/draft revisions.
- Save recovery drafts after persistent transactions.
- Keep dirty/error state visible after failed storage.
- Test switching documents with pending work and external changes.

### Step 3: consolidate shared application state

- Introduce a small typed EditorState service.
- Replace AppComponent-to-HeaderComponent field assignment with bindings.
- Publish mode, selection, undo, file, dirty, routing, and status state through
  one mechanism.
- Use the same revision-aware path for async completions.

### Step 4: strengthen interaction architecture

- Move keyboard finger metadata and accepted exceptions into production.
- Add timing-independent chord tests.
- Extract pure caret/label geometry.
- Extract overlay derivation/invalidation.
- Extract grow-mode state.
- Keep Claude’s matrix tests pointed at the resulting supported APIs.

### Step 5: improve the interface on the stronger state model

- Apply Claude’s shared chip tokens and viewport-inset approach to the header.
- Restore native settings controls to keyboard navigation.
- Suspend graph shortcuts for every interactive/modal focus target.
- Add an in-app dialog and non-blocking notification/status surface.
- Expose persistent file/dirty/save state.
- Report what destructive transformations changed.

### Step 6: continue decomposition

After the transaction and state seams exist, reduce DrawingAreaComponent by
extracting:

1. document session and persistence;
2. routing request/version management;
3. selection and text-edit sessions;
4. overlay rendering;
5. grow/navigation interaction controllers.

This order creates stable seams before moving hundreds of lines.

## Suggested pull-request series

1. Adopt Claude’s root README after the factual/volatility edits above and
   link both reliability reviews.
2. Harden Claude’s invariant and repro tooling without changing product
   behavior.
3. Add exhaustive CommandPolicy and fix missing/duplicate undo effects.
4. Add worker revisions and stale-result tests.
5. Complete lifecycle disposal with behavioral fake-timer tests.
6. Add explicit document revisions and transaction-driven draft saving.
7. Introduce EditorState and replace header ViewChild assignments.
8. Restore settings focus and harden global key ownership.
9. Extract label geometry and overlay derivation behind supported APIs.
10. Restyle the header using shared tokens and real viewport insets.

## Recommended disposition

| Item | Recommendation |
| --- | --- |
| README.claude-proposal.md | Adopt as root README after small corrections |
| claude-proposed-tests/README.md | Keep as dated interaction/recent-bug review |
| Claude Angular specs | Keep; harden weak assertions and cleanup |
| check-command-wiring.mjs | Keep temporarily; replace with typed registration |
| repro-health.mjs | Keep, but do not use as a gate until hardened and fully baselined |
| codex-proposed-tests/README.md | Keep as the systemic reliability roadmap |
| Codex source-level tests | Use as temporary issue guards; turn green and behavioral during fixes |
| This comparison | Use as the index and merged implementation order |

## Final assessment

Claude produced the better explanation of KiDraw as a product and the better
tests for the interaction failures that recently hurt it. Codex produced the
broader explanation of why commands, persistence, state, async work, and
lifetimes will continue to generate bugs unless their policies are
centralized.

The most useful synthesis is:

- Claude’s README becomes the front door.
- Claude’s recent-bug review remains the interaction history.
- Codex’s review becomes the systemic reliability roadmap.
- Claude’s green behavior tests and hardened repro runner protect known user
  experience.
- Codex’s red issue guards are converted, category by category, into green
  transaction and lifecycle tests.

Together they form a substantially stronger plan than either proposal alone.
