# KiDraw reliability and maintainability review

This document is a handoff for the person who next works on KiDraw. It assumes
no recent familiarity with the project and no Angular experience.

The short version is that KiDraw has a capable graph editor and a substantial
amount of thoughtful interaction work, but too many correctness rules are
maintained by hand in one very large component. A new command can successfully
change what is visible on the canvas while accidentally skipping undo,
autosave, routing protection, or the state shown in the header. That is the
main source of both current bugs and likely future regressions.

Two small source-level test files are included here to make that risk concrete:

- command-effect-registry.test.mjs checks command side effects.
- lifecycle-cleanup.test.mjs checks cleanup of subscriptions, browser
  resources, Konva objects, and caret timers.

They are deliberately red against the reviewed code. They describe behavior
that the production design should guarantee; they are not a new passing test
suite.

## Executive summary

The highest-value improvement is to give every drawing command one exhaustive,
typed policy describing its effects. Better still, command handlers should
return what actually changed, and one transaction coordinator should perform
undo, autosave, context refresh, and routing invalidation from that result.
Today those responsibilities are split across several independent sets and
some individual handlers.

The next priorities are:

1. Publish application state from one authoritative place so the header,
   keymenu, canvas, and saved-file state cannot disagree.
2. Save a recovery draft after each persistent transaction, not only during
   page unload.
3. Dispose every timer, observer, subscription, animation frame, worker, and
   Konva stage owned by a component or graph object.
4. Break DrawingAreaComponent into testable command, document, selection,
   routing, navigation, and rendering units.
5. Make settings and file flows keyboard-accessible, replace blocking browser
   dialogs, and report errors separately from user cancellation.

These should be incremental changes. A large rewrite would put the project’s
many carefully tuned keyboard and geometry behaviors at unnecessary risk.

## What KiDraw is

KiDraw is a keyboard-first graph drawing application. A drawing contains:

- nodes: the boxes or other shapes;
- edges: the links between nodes;
- labels: text on nodes or edges;
- waypoints: user-controlled bend points on edges;
- semantic metadata such as graph type, tags, task status, directedness, and
  line style;
- view state such as pan and zoom.

The crosshairs are the keyboard user’s pointer. The keymenu changes meaning as
the user enters modes such as adding, moving, selecting, navigating links, or
editing a label.

The visual canvas is rendered by Konva, a canvas graphics library. Angular
owns the surrounding web application: the header, settings, keymenu, component
lifecycle, and the wiring between them.

### A small Angular glossary

| Term | Plain-language meaning in this project |
| --- | --- |
| Component | A class responsible for part of the screen and its behavior. |
| Template | The HTML associated with a component. |
| Service | A shared object for concerns such as storage, themes, logging, or undo. |
| Input and Output | Values and events passed between components. |
| Observable or Subject | An event stream. Code subscribes to receive future events. |
| Subscription | The live connection to an event stream; it must eventually be released. |
| Lifecycle hook | A method Angular calls when a component is created or destroyed. |
| Worker | Background JavaScript used here so graph routing does not freeze the UI. |
| Snapshot | A serializable copy of the graph, used for undo, files, and drafts. |

Angular is not itself the central problem found in this review. The problem is
that application state and side effects are coordinated manually across large
classes, which makes it easy for one path to omit a necessary step.

## How an action travels through the app

A typical keyboard action follows this path:

    physical key
        |
        v
    KeymenuComponent interprets the current mode and key binding
        |
        v
    a DACommand is emitted through an Angular Subject
        |
        v
    AppComponent forwards the command
        |
        v
    DrawingAreaComponent.handleCommands dispatches a large switch
        |
        +--> graph/Konva objects are changed
        +--> an undo snapshot may be taken
        +--> vault autosave may be scheduled
        +--> routing may reject the command
        +--> context may be sent back to the header
        |
        v
    DrawingAreaComponent emits DANotification events
        |
        v
    AppComponent manually updates HeaderComponent and KeymenuComponent

The repeated “may” is the reliability problem. The same command kind must be
remembered in several unrelated places. The compiler verifies the switch is
exhaustive, but it does not verify that a new graph edit was also added to all
the relevant policy sets.

## Source map

These are the most useful starting points for a new maintainer:

| Path | Responsibility | Why it matters |
| --- | --- | --- |
| src/app/drawing-area/drawing-area.component.ts | Command dispatch, editing, navigation, routing, files, drafts, vault behavior, canvas orchestration | It is 8,518 lines at the time of review and is the main reliability bottleneck. |
| src/app/drawing-area/command.model.ts | Command types and payloads | The natural source for an exhaustive command policy. |
| src/app/drawing-area/drawing.layer.ts | Runtime graph collection, serialization, restoration, and theme application | It currently mixes model and Konva concerns. |
| src/app/drawing-area/graph-snapshot.ts | Shape of the runtime snapshot | Anything absent here cannot reliably survive undo or draft round trips. |
| src/app/drawing-area/da-node.ts | Node model plus Konva rendering and node text caret | Owns a repeating caret timer. |
| src/app/drawing-area/da-edge.ts | Edge model plus Konva rendering | Removes edge labels. |
| src/app/drawing-area/da-label.ts | Edge label model, rendering, and caret | Also owns a repeating caret timer. |
| src/app/app.component.ts | Routes events between the drawing area, header, keymenu, and overlays | Contains manual cross-component state synchronization. |
| src/app/keymenu/keymenu.component.ts | Global keyboard handling and mode transitions | Needs a broader focus/interactive-element guard. |
| src/app/header/header.component.html | Header and settings controls | Many native controls are explicitly removed from the tab order. |
| src/app/services/draft-storage.service.ts | Browser localStorage recovery draft | Save errors are swallowed and writes are not transaction-driven. |
| src/app/services/file-io.service.ts | Portable browser file open/download behavior | Contains a focus-and-timeout picker fallback that can race slow reads. |
| src/app/services/vault.service.ts | Directory-backed file access | Participates in autosave and external-change handling. |
| src/app/drawing-area/routing.worker.ts | Background edge routing | Async results need version/conflict protection. |

## Finding 1: command effects can drift apart

DrawingAreaComponent has separate lists for at least these policies:

- CONTEXT_AFFECTING_COMMANDS: refresh data displayed outside the canvas;
- MUTATING_COMMANDS: take a pre-change undo snapshot and schedule autosave;
- ROUTING_LOCKED_COMMANDS: reject edits while a routing worker is active;
- MOVE_BY_NODE_COMMANDS: select a particular interaction/display behavior.

Some handlers also take their own undo snapshot. This creates two opposite
failure modes:

- a graph edit omitted from MUTATING_COMMANDS is visible but may have no undo
  entry and may not schedule vault autosave;
- a command in MUTATING_COMMANDS whose handler also takes a snapshot can add
  two snapshots for one action, potentially requiring two Undo operations.

The proposed test currently reports these persistent edits missing from the
generic mutation policy:

- DELETE_CHAR_AT_CURSOR
- REPLACE_CHAR_AT_CURSOR
- CHANGE_TEXT_AT_CURSOR
- SET_EDGE_DIRECTEDNESS
- SET_LINE_STYLE
- APPLY_LAYOUT
- APPLY_EDGE_ROUTING

It also finds three commands with both generic and handler-owned snapshots:

- CYCLE_EDGE_DIRECTEDNESS
- SET_DIAGRAM_TYPE
- SET_TASK_STATUS

Seventeen commands that are currently classified as mutating are absent from
the context-refresh policy. These include insert/delete text, size changes,
dragging, cut/paste, diagram type, task status, pinning, and text overflow.
After one of these actions, the graph may be right while the header’s Undo
availability or summary is stale.

### Recommended design

As a safe first step, introduce one exhaustive table:

    type CommandPolicy = {
      documentMutation: boolean;
      selectionMutation: boolean;
      changesGeometry: boolean;
      allowedDuringRouting: boolean;
      refreshesContext: boolean;
      undo: "none" | "single" | "coalesced-text" | "coalesced-drag";
    };

    const COMMAND_POLICY: Record<DACommandType, CommandPolicy> = {
      // Every command type is required here by TypeScript.
    };

This is still metadata that can drift from behavior, but it consolidates the
rules and makes omissions compile-time failures.

The stronger destination is a transaction result:

    type CommandResult = {
      changedDocument: boolean;
      changedSelection: boolean;
      changedGeometry: boolean;
      status?: string;
    };

    snapshot before dispatch
    result = handler(command)
    if result.changedDocument, record the snapshot and mark the document dirty
    publish current application state once
    if result.changedGeometry, invalidate or restart routing as appropriate

This also avoids adding an undo record when a command has no valid target.
That detail matters: taking the snapshot solely from the command’s declared
intent can record a no-op.

Keep selection changes distinct from document changes. Selection may belong in
an undo snapshot for a particular interaction, but it should not by itself
mark a file dirty or trigger a file write unless that is an explicit product
decision.

## Finding 2: a routing worker can apply an obsolete answer

Routing is asynchronous. The worker receives graph geometry, computes in the
background, and returns control points later. If geometry changes meanwhile,
the result may describe an older graph.

There is a routing lock, but the proposed test identifies geometry-affecting
paths not included in it:

- DELETE_CHAR_AT_CURSOR
- REPLACE_CHAR_AT_CURSOR
- CHANGE_TEXT_AT_CURSOR
- ENTER_ADD_MODE

Text is geometry because node and label measurements can change. Grow/add mode
also changes geometry over time.

The robust fix is not only a longer block list. Give every document state a
monotonically increasing revision number. Send the revision with the worker
request, and apply the result only if it still matches the live document
revision. Cancellation remains useful for responsiveness, while revision
checking supplies correctness even when a cancellation races a worker reply.

An integration test should:

1. start a controlled, delayed routing request;
2. change graph geometry;
3. release the old worker result;
4. verify the old result is ignored and the new graph is unchanged.

## Finding 3: application state has several authorities

The canvas, keymenu, header, AppComponent, undo service, and file/vault state
all hold pieces of “what mode and document are active.” Some paths update these
through notifications; other paths assign fields directly.

Examples include label-edit mode, held modes, file loading, display cycling,
routing completion, and context refresh after commands. Correctness depends on
every path remembering to emit the right notification at the right time.

Likely user-facing symptoms are:

- the mode label describes a mode the keyboard is no longer in;
- Undo or Redo looks disabled when it is available, or the reverse;
- selected-item or graph counts lag behind the canvas;
- the open-file/save status describes the previous document;
- a status message is overwritten by an unrelated late callback.

### Recommended design

Create a small AppState or EditorState service with immutable snapshots. It
should contain only shared state, for example:

- current interaction mode and text submode;
- selection summary;
- node and edge counts;
- canUndo and canRedo;
- active file label and dirty/save state;
- routing state and current status message;
- current defaults shown by the header.

Components should render this state rather than mutate one another through
ViewChild references. Drawing commands should cause one state publication
after their transaction completes. Async operations should publish from their
completion path using the same mechanism.

This does not require a large state-management library. A typed service backed
by one Angular signal or BehaviorSubject is enough.

## Finding 4: lifecycle cleanup is incomplete

Browsers keep a callback alive as long as its subscription, observer, timer, or
animation handle is alive. Konva stages also own DOM/canvas resources. If these
are not released, recreating a component can produce duplicate command
handling, stale callbacks, memory growth, or attempts to draw into a destroyed
screen.

The proposed cleanup test currently reports these DrawingAreaComponent
resources as not released by ngOnDestroy:

- command subscription;
- ResizeObserver;
- drag animation frame;
- grid fade timer;
- link-navigation refresh timer;
- navigation-popup reveal timer;
- deferred gather timer;
- Konva stage.

The existing teardown already releases several other resources, including
routing work, theme and visual subscriptions, beforeunload, vault timers,
crosshair refresh, and some Konva shapes. The finding is not that cleanup is
absent; it is that ownership is not complete or mechanically enforced.

DANode and DALabel each start a repeating caret-blink interval. Removal paths
do not consistently call hideCursor or a dispose method, so removed graph
objects can leave their intervals alive.

### Recommended design

- Keep every owned handle in a named field.
- Pair creation and release in the same class.
- Use Angular DestroyRef/takeUntilDestroyed for Angular subscriptions.
- Give DANode, DAEdge, DALabel, and other long-lived render objects an
  idempotent dispose method.
- Have DrawingLayer removal and clear operations call dispose before removing
  Konva nodes.
- Make component teardown tests create, destroy, and then verify that no
  callback can update or draw.
- Run relevant tests with fake timers so leaks do not depend on wall-clock
  delays.

## Finding 5: recovery and dirty state are event-list driven

The local recovery draft is restored at startup, but normal draft saving is
attached to beforeunload. beforeunload is not a dependable crash-recovery
boundary: a crashed browser process, killed mobile tab, power loss, or browser
policy can skip it.

Vault autosave is scheduled only for commands in MUTATING_COMMANDS plus Undo
and Redo. Therefore the command-policy omissions described above are also
potential persistence omissions.

The vault polling code treats the presence of a pending debounce timer as the
dirty signal. A timer is an implementation detail, not document state. Once a
timer fires, fails, is cancelled, or is replaced during another document
operation, it is no longer a trustworthy answer to “does memory differ from
disk?”

DraftStorageService silently ignores localStorage failures such as quota
exhaustion or disabled storage. The user can therefore believe recovery is
available when it is not.

### Recommended design

Track explicit document revisions:

- documentRevision increments after every persistent transaction;
- savedRevision records the revision successfully written to the backing file;
- draftRevision records the revision successfully written to recovery storage;
- dirty is documentRevision !== savedRevision.

Debounce the work, not the truth. If a save fails, keep the document dirty and
show a persistent, non-blocking error.

Write the recovery draft shortly after each persistent transaction and on
visibilitychange when the page becomes hidden. Keep beforeunload only as a
best-effort final attempt. Test localStorage failure, vault write failure,
switching files with a save queued, and an external file change while local
changes are dirty.

## Finding 6: runtime colors do not round-trip through GraphSnapshot

GraphSnapshot records geometry, text, selection, shapes, line styles, tags,
and related data, but it does not record per-item colors. applyThemeColors then
recolors every restored node, edge, and label from the current theme.

SET_ITEM_COLOR therefore appears able to change the live Konva object without
that choice surviving the same snapshot path used for undo, drafts, and file
conversion. Theme changes can also overwrite an item-specific color.

Clarify the intended model:

- if per-item colors are document data, add explicit optional color overrides
  to the model, snapshot, file mapping, migrations, and round-trip tests;
- if colors are always derived from theme/style/tags, remove or redesign the
  item-color command so the UI does not promise persistence it cannot provide.

Do not store only the resolved display color if the real source of truth is a
style token or semantic tag. Persist the intent and derive the display value.

## Finding 7: file opening conflates cancellation and failure

FileIoService’s portable picker fallback waits for window focus to return and
then settles as cancelled after 200 ms. On a slow device, file selection and
reading can race that timer. Read errors are also converted to null, the same
result as deliberate cancellation.

This makes a real failure look like “nothing happened.”

Recommended changes:

- prefer the picker’s cancel event where supported;
- treat change as ownership of the operation and disable the focus fallback;
- represent results as selected, cancelled, or failed rather than value/null;
- show parse, permission, and read errors in the application status surface;
- add browser tests with delayed file reads and repeated open/cancel cycles.

File and style import errors currently also rely in part on window.alert.
Replace blocking alerts and prompts with an in-app dialog/status model that is
testable, preserves keyboard mode, and can provide recovery actions.

## Finding 8: keyboard-first controls are not consistently accessible

The settings template assigns tabindex="-1" to its summary, selects, inputs,
color controls, and restore button. That removes native controls from ordinary
Tab navigation.

The global key handler stands down for input, textarea, and contenteditable,
but not for every interactive element such as select, button, summary, or
dialog content. A future accessible control can therefore receive focus while
the same keystroke also triggers a graph command behind it.

Recommended changes:

- return native settings controls to the tab order;
- suspend keymenu command handling whenever the target is inside an
  interactive control or active modal surface;
- give canvas/keymenu modes an explicit accessible name and help text;
- make status changes available through a restrained aria-live region;
- restore focus predictably when settings or a dialog closes;
- add keyboard-only and screen-reader-oriented component tests;
- test narrow widths and zoomed text so the header does not hide document or
  save status.

KiDraw can remain keyboard-first without intercepting keys globally when a
native control owns focus.

## Finding 9: DrawingAreaComponent has too many reasons to change

At 8,518 lines, DrawingAreaComponent currently handles:

- command policy and dispatch;
- graph mutation and selection;
- text editing;
- canvas/Konva rendering coordination;
- keyboard movement and graph navigation;
- layout and worker-based routing;
- undo boundaries;
- draft, file, archive, style, and vault operations;
- autosave and external-change polling;
- status and header context;
- a large collection of timers and interaction state machines.

This makes even a small feature cross-cutting. It also encourages tests to
construct a partial component with many mocks instead of testing plain data
operations.

### Incremental extraction order

1. Extract pure command policy and transaction coordination.
2. Extract a pure graph/document model from DrawingLayer serialization.
3. Extract EditorState publication.
4. Extract document session behavior: open, dirty, draft, save, vault, and
   external-change resolution.
5. Extract routing request/version management.
6. Extract selection and text-edit sessions.
7. Leave DrawingAreaComponent as the adapter between those services and
   Konva, then split visual interaction controllers only where useful.

Each extraction should preserve the public command behavior and add tests
before moving the next responsibility. Avoid a big-bang conversion.

## A practical implementation sequence

### Phase 1: stop the known correctness gaps

- Decide the expected undo unit for each command.
- Remove duplicate handler-owned snapshots or remove those commands from the
  generic policy, consistently.
- Add the missing persistent edits to undo/autosave protection.
- Add missing routing protection and a worker revision check.
- Make every current mutation refresh shared context.
- Complete DrawingAreaComponent and graph-object disposal.
- Add color round-trip coverage or remove the misleading item-color path.

At the end of this phase, convert the proposed source parsers to tests of a
real exported policy. Source parsing is intentionally temporary.

### Phase 2: establish one transaction and state path

- Add the typed command policy.
- Make handlers return CommandResult.
- Publish EditorState once after a transaction.
- Make async completions use revision tokens and the same state publisher.
- Separate document mutation, selection mutation, and view-only mutation.

### Phase 3: make data loss visible and recoverable

- Add explicit document/saved/draft revisions.
- Save drafts after persistent transactions.
- Preserve dirty state across failed writes.
- Resolve queued saves when switching documents.
- Add recovery UI for draft, parse, permission, and external-change cases.

### Phase 4: improve the interface

- Restore accessible settings navigation.
- Add an application dialog/notification surface.
- Make command availability visible instead of silently doing nothing.
- Add responsive header behavior and persistent save state.
- Add a compact, searchable command/help view generated from the same command
  metadata as the keymenu.

### Phase 5: keep it fixed

- Run unit tests and a production build in CI on every push.
- Add a small end-to-end suite for open, edit, undo, reload/recover, and save.
- Use fake timers for held keys, caret blinking, autosave, and routing timeout.
- Add file-format round trips for every persisted field.
- Add an invariant test that every DACommandType has exactly one policy.

## Proposed test strategy

The best test pyramid for this project is:

1. Pure unit tests for graph mutations, file mappings, command policy, routing
   revisions, and editor-state reduction. These should be most of the suite.
2. Angular component tests for event wiring, focus, lifecycle cleanup, and
   rendering of shared state.
3. A small number of browser tests for real keyboard sequences, file pickers,
   canvas behavior, refresh recovery, and responsive layout.
4. Visual screenshots only for geometry or appearance that cannot be asserted
   structurally.

Important scenarios include:

- each persistent command creates exactly one appropriate undo unit;
- a no-op command creates no undo unit and no dirty transition;
- Undo and Redo update both the graph and the header;
- autosave writes the newest revision even after rapid edits;
- switching files cannot save the previous graph into the new target;
- an old routing response cannot alter a newer graph;
- every snapshot/file field survives save and restore;
- destroying and recreating the editor does not duplicate command handling;
- removing an actively edited node or label stops its caret interval;
- focused native controls never trigger graph shortcuts;
- a reload restores the latest debounced draft, viewport, and file state.

## The included proposed tests

Run them from the repository root:

    /usr/bin/node --test codex-proposed-tests/*.test.mjs

The explicit /usr/bin/node is only necessary on this development machine if
the default node command resolves through an unreliable Snap shim. On a normal
Node installation, this is sufficient:

    node --test codex-proposed-tests/*.test.mjs

Current result on 2026-08-30:

    tests: 6
    passed: 0
    failed: 6

That failure is expected and intentional. Each assertion prints the exact
policy or cleanup gap it found.

### command-effect-registry.test.mjs

This test reads DrawingAreaComponent’s current command sets and checks four
invariants:

1. known persistent edits participate in undo/autosave;
2. current mutations refresh context and Undo availability;
3. geometry-changing text/grow actions cannot race routing;
4. generic snapshots are not duplicated inside handlers.

This is a characterization test, not the desired architecture. Once an
exhaustive COMMAND_POLICY exists, import that policy and delete the source
parser and its duplicated persistentEdits list.

### lifecycle-cleanup.test.mjs

This test checks:

- that DrawingAreaComponent releases representative resources it owns;
- that removing nodes and labels stops their caret blink intervals.

It is also a transition test. The eventual version should instantiate the
real owners with fake timers and spies, destroy/remove them, and prove that
callbacks stop. The source check provides a cheap guard while the current
classes are difficult to construct in isolation.

## Verification performed for this review

- The production application builds successfully with npx ng build
  --progress=false.
- The build has existing warnings for initial bundle size, the header CSS
  budget, and Konva CommonJS modules; it has no compile errors.
- Both proposed test files pass Node syntax checking.
- The six proposed assertions execute and fail for the documented current
  gaps.
- No production source or Angular/Karma configuration was changed by this
  proposal.

## Definition of done for the reliability work

- Every command has one compiler-enforced effect policy.
- Every persistent command produces exactly one intended undo unit.
- No-op commands do not create undo entries or dirty the document.
- Persistent changes schedule both recovery-draft and backing-file behavior.
- Shared editor state is published from one authoritative mechanism.
- Async routing and file operations reject obsolete completions.
- Dirty state survives save failures and is visible to the user.
- Every owned asynchronous/browser/Konva resource is disposed.
- Per-item style intent either round-trips or is not exposed as persistent.
- Native controls are reachable and safe from global shortcuts.
- Unit, component, browser, and production-build checks run in CI.

## What not to do

- Do not only add the currently missing names to three separate sets and call
  the design fixed. That is an appropriate immediate repair, but future drift
  remains until the policy is exhaustive and centralized.
- Do not rewrite the entire drawing area at once. Preserve behavior with
  tests, extract one seam, and ship small commits.
- Do not use autosave timer presence as dirty state.
- Do not let old worker or file-operation callbacks apply without checking
  the document/session revision they belong to.
- Do not treat browser cancellation, read failure, parse failure, and
  permission failure as the same null result.
- Do not persist rendered theme colors if semantic style intent is the real
  source of truth.
- Do not fold generated screenshots or unrelated concurrent-agent files into
  reliability commits.

## Suggested first pull requests

A reviewable starting series would be:

1. Fix the existing duplicate/missing undo policy and add behavioral tests.
2. Add routing revisions and a stale-result test.
3. Complete lifecycle disposal with fake-timer tests.
4. Introduce exhaustive COMMAND_POLICY without otherwise changing behavior.
5. Add CommandResult and central post-command state publication.
6. Add explicit document revisions and transaction-driven draft saving.
7. Restore settings focus behavior and harden the global key guard.

The first three reduce immediate risk. The next four make it substantially
harder to reintroduce the same classes of bug.
