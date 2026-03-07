# Improvement Ideas

Notes from a codebase review session. Organized into UI/UX ideas and process/architecture ideas.

---

## UI/UX Improvements

### Card Keymenu Polish

- **Card color progression**: The current card background array could use more deliberate color design. A gradual hue shift (e.g., slate → blue → indigo → violet as depth increases) would make the stack hierarchy more intuitive than arbitrary color changes. Worth experimenting with 5-6 levels since the insert+drag flow already hits depth 3.

- **Card transition direction**: Currently all cards slide in from the right. Consider sliding from the direction of the key that was pressed — e.g., pressing a key on the left side of the keyboard could slide the card in from the left. This creates a spatial relationship between the physical key and the resulting card.

- **Held-key hole styling**: The transparent hole punch works but could be enhanced with a subtle glow or highlight border around the hole to draw the eye to "where you are" in the key hierarchy. A thin colored border (matching the parent card's color) around the cutout would reinforce the stack metaphor.

- **Blank key styling by purpose**: Currently all unbound positions render as identical dashed-outline squares. Could distinguish between "available for future binding" (dashed) vs "structurally empty" (no visual at all, e.g., gaps between keyboard rows). This reduces visual noise.

- **Key shape language**: Different key types (action, submenu, action+submenu, release-action) could have distinct visual shapes — rounded corners for actions, cut corners for submenus, etc. This is already in project-todos.md but worth noting as high-impact for learnability.

### Drawing Area

- **Selection highlight that complements the theme**: The current selected state uses hardcoded `darkblue` for waypoints and labels, and a separate stroke width change for nodes. These should be theme-aware — in dark mode a bright accent color (cyan or amber) would be more visible than darkblue on dark backgrounds.

- **Crosshairs theming**: The crosshairs reticle and heading arrow should respond to theme changes too. A light crosshair on dark canvas, dark crosshair on light canvas.

- **Node text overflow handling**: Currently text just overflows the node rect if it's too long. Could add ellipsis truncation or auto-shrink font size to fit. Alternatively, show full text on selection/hover and truncated text otherwise.

- **Edge label positioning**: Labels on edges sit at fixed positions. Could auto-position them at the midpoint of the nearest edge segment, with collision avoidance to prevent overlapping other labels or nodes.

- **Grid/snap-to-grid option**: A subtle background grid with optional snap-to-grid for node placement would help create cleaner diagrams. The grid should respect the theme (very faint lines).

- **Minimap**: For large diagrams, a small minimap in a corner showing the full graph with a viewport indicator. This is a bigger feature but standard in diagramming tools.

### Header

- **Theme toggle icon**: Use a sun/moon icon instead of text "Dark"/"Light". Small thing but standard UX pattern.

- **Undo/redo indicators**: Show in the header whether undo/redo are available (e.g., subtle stack depth count). Helps users know if they have history to go back to.

- **Mode indicator**: Show the current keymenu mode (normal/labelEdit) in the header. When in label edit mode, show what's being edited.

---

## Architecture & Code Quality

### High Priority: Extract Services from DrawingAreaComponent

The drawing area component is ~1,940 lines with 54 command cases and 17+ state fields tracking different concerns. It handles graph mutation, selection, dragging, traversal, undo/redo, zooming, and auto-pan all in one place.

Suggested extraction:
1. **SelectionService** — tracks what's selected, handles select/unselect/toggle logic
2. **DragService** — manages drag state machine (enter/exit drag mode, position updates, auto-pan during drag)
3. **TraversalService** — node/edge traversal indices and jump logic
4. **DirectedEdgeService** — the begin/set-destination/finalize directed edge flow state machine

Each service would receive the DrawingLayer and emit commands back. The component would become a thin dispatcher.

### High Priority: Formalize Submenu Stack Invariants

The design notes document 3 invariants (I1a, I2, I3) for the submenu stack, but they're enforced only through careful coding in `USQwertyMode`. Consider:
- A `SubmenuStack` class that enforces invariants in its push/pop/replace methods
- Type-level encoding where possible (e.g., the stack always has at least one element — the root)
- Assertions in debug mode that validate invariants after every operation

### Medium Priority: Separate Graph Model from Rendering

Currently `DANode`, `DAEdge`, etc. are inseparable from their Konva rendering. A pure data model layer would enable:
- Easier serialization (already partially done with `GraphSnapshot`, but it's a manual mapping)
- Testability without Konva
- Potential future: collaborative editing, server-side graph operations

### Medium Priority: Test Coverage Gaps

Critical untested flows:
- Directed edge creation (begin → set destination → finalize)
- Undo/redo coalescing (the `dragSnapshotCaptured` / `textEditSnapshotCaptured` flags)
- Insert+drag interaction (submenu replacement during held key)
- Double-shift mode reset
- Traversal index cycling (outgoing/incoming traversal maps)
- Auto-pan during drag near edges
- Theme toggle reactivity (keymenu rebuild, drawing area recolor)

### Low Priority: Centralize Constants

Animation timings, distances, sizes, and other magic numbers are scattered across files. A `src/app/config/constants.ts` with semantic grouping would make tuning easier:
```
AnimationTimings: { slideIn, slideOut, crosshairsMove, recenter, ... }
GraphSizes: { nodeWidth, nodeHeight, waypointRadius, labelRect, ... }
InteractionThresholds: { doubleShiftInterval, edgeMargin, minZoom, maxZoom, ... }
```

Not urgent since the current approach works and these are "intentionally non-stable" per CLAUDE.md.

---

## Process Improvements

### What Worked Well

- **Incremental build verification**: Running `ng build` after each significant change caught type errors early. This prevented accumulation of broken state.

- **Bug-driven iteration**: Implementing the plan in phases then fixing bugs as they appeared was productive. The bugs (z-ordering, x-drift, ghost cards, theme reactivity) were all interaction-specific issues that wouldn't have been caught by unit tests anyway.

- **The plan document**: Having a detailed plan with phases made it easy to track progress and know what was done vs. remaining.

### What Could Be Better

- **Test-first for state machines**: The ghost card bug and the x-drift bug were both state management issues (tween lifecycle, interrupted animation state). Writing a state machine test before implementing animations would have caught these patterns. The test doesn't need Konva — just verify that after push→pop→push, the stack state is clean.

- **Smaller commits**: We accumulated a large amount of changes across 20+ files without committing. If something had gone wrong, rolling back would have been painful. Committing after each phase (or at least after each working milestone) would be safer.

- **Visual regression snapshots**: Several bugs were visual (cards behind parents, ghost cards, color mismatches). A screenshot comparison workflow — even manual screenshots saved to a `screenshots/` directory with notes — would make it easier to verify fixes and catch regressions.

- **Try the UI more during implementation**: Some bugs (z-ordering, ghost cards) were immediately visible on first interaction. A quick manual test after each phase would have caught them before moving to the next phase, reducing the back-and-forth.

- **Palette design upfront**: The theme palette grew organically (started with keymenu colors, then added drawing area colors). Designing the full palette structure upfront — even as a typed interface with placeholder values — would have avoided the incremental additions and the "toned down green" adjustment pass.

### Suggested Workflow for Future Feature Work

1. **Design the data model changes first** (types, interfaces, state shape)
2. **Write skeleton tests** for the new state transitions
3. **Implement in small, buildable increments** — commit after each
4. **Manual visual check** after any rendering change
5. **Theme/style pass** as a deliberate last step (not interleaved)
