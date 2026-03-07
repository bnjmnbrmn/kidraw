# Project Todos

## Active: Interaction Redesign — Held-Key Modes + Waypoints vs Labels

See `design_notes.md` for the design: concepts, key layout, and open questions.

### Implementation Phases

#### Phase 0: Vim Profile as Default
Switch to the vim profile (`hjkl` movement, `i` for insert) as the working default. This requires no architectural changes — just new key assignments — and makes the app immediately testable by vim users.

- [x] Define `VIM_KEYMENU_KEY_ASSIGNMENTS` with h/j/k/l for movement, i for insert submenu
- [x] Set vim profile as the default (replace current right-hand-dominant assignments)
- [x] Verify all existing behavior works: insert+drag, select+drag, delete, zoom, label edit
- [x] Decide and assign zoom keys for vim profile — kept p/y (unchanged; u and y noted as possible vim conflicts for future undo/yank)

#### Phase 1: Distinguish Waypoints vs Labels in Data Model
- [ ] Rename existing waypoint-with-text concept to "Label" (DALabel class)
- [ ] Simplify DAWaypoint to geometry-only (circle, no text/rect)
- [ ] DALabel: text annotation on edge, always-visible text, positioned along edge
- [ ] Both share: position on edge, selectable, draggable, deletable
- [ ] Update DAEdge to hold both waypoints[] and labels[]
- [ ] Unit tests for waypoint vs label creation, selection, deletion

#### Phase 2: Held-Key Mode Infrastructure in KeyMenu
- [ ] Add "held-key mode" concept to KeyMenu: keyDown enters mode, keyUp exits mode
- [ ] Define HeldKeyMode interface: onEnter, onMovement, onZoom, onExit
- [ ] Wire up app key repeat (suppress system repeat, use app-controlled repeat for movement)
- [ ] Unit tests for held-key mode enter/exit lifecycle

#### Phase 3: Move Mode
- [ ] Implement Move as simplest held-key mode (crosshair movement + zoom only)
- [ ] Opposite-hand movement keys (jkli or fdse) move crosshairs
- [ ] Opposite-hand zoom keys zoom in/out
- [ ] Unit tests + Puppeteer test: hold move key, press movement keys, verify crosshair position

#### Phase 4: Add+Drag Mode
- [ ] Add+Drag key enters held mode, shows submenu overlay (node / waypoint / edge / label)
- [ ] Submenu key press triggers creation at crosshairs position
- [ ] After creation, auto-select new item; opposite-hand movement drags it while key is held
- [ ] Releasing Add+Drag key unselects and returns to normal mode
- [ ] Grey out inapplicable submenu options based on context
- [ ] Unit tests + Puppeteer tests for each add scenario

#### Phase 5: Select+Drag Mode
- [ ] Select+Drag key held: select item under crosshairs
- [ ] While held, opposite-hand movement drags the selected item
- [ ] Support multi-select: crosshairs over additional items while held adds to selection
- [ ] Releasing unselects and returns to normal mode
- [ ] Unit tests + Puppeteer tests for select+drag lifecycle

#### Phase 6: Multiple Movement Profiles + Settings Menu
- [ ] Add "Basic Settings" menu accessible from a key (TBD)
- [ ] Profile selection: Vim / Right-hand-dominant / Left-hand-dominant (see design_notes.md)
- [ ] Persist selected profile in localStorage
- [ ] Active profile drives all key assignments (no hardcoded fallback)
- [ ] Unit tests for key mapping under each profile

---

## Core Features

- [x] Undo/redo (snapshot-based; Ctrl+Z, Ctrl+Shift+Z, Ctrl+R, `u` in normal mode)
- [ ] Graph serialization — save/load to browser localStorage
- [ ] Graph management UI — list, rename, delete saved graphs
- [ ] Cloud storage for graphs (longer term; paid option for hosted storage)
- [ ] Export/import (serialization/deserialization)
- [ ] Semantic/graph navigation (follow edges, jump to connected nodes)
- [ ] Self-linking edges (3 waypoints instead of 2)
- [ ] Bidirectional and undirected edges
- [ ] Parallel edges between nodes
- [ ] Bezier/smooth bend edges
- [ ] Links from/to nowhere (dangling edges)
- [ ] Lines and boxes/circles for grouping nodes
- [ ] Labels on edges (untested end-to-end)
- [ ] Larger vs smaller nodes (resize commands)
- [ ] Shortcut to create a new node connected to the currently selected one
- [ ] Figure out how to deal with overlapping nodes (z-cycle? push-apart? block insertion?)
- [ ] Rename "edges" → "links"? (naming decision pending)
- [ ] Vertical linked node series with auto-routing back-references (goal: as easy as bullet points in org-mode/markdown)
- [ ] Back-reference edges auto-route around nodes instead of through them, non-overlapping
- [ ] Pin nodes/waypoints/labels to stay fixed during auto-layout
- [ ] Multiple layout mechanisms (physics-based, constraint-based, etc.)

## UX / Feel

- [ ] Movement profiles: support vim (hjkl/i) and left-hand-dominant (fdse) in addition to current right-hand-dominant — see Phase 6
- [ ] Directional insert shortcuts: `i`→`d`→`j/k/l/h` — one chord auto-creates a node AND a link from the current node in that direction (below/above/right/left); goal is rapid linear graph building
- [ ] Movement acceleration (fast/accelerating and slow/decelerating movement)
- [ ] Auto-placement for next node (smart positioning after creation)
- [ ] Multi-node selection via drag box
- [ ] Crosshair selection area indicator (circle/box showing selection radius)
- [ ] Proximity selection visibility (waypoints/nodes highlight when crosshairs nearby)
- [ ] Text editing: vim/emacs modes, cut/copy/paste within text
- [ ] Cut/copy/paste for nodes/edges/waypoints/labels
- [ ] Upper/lowercase letter handling in text editing
- [ ] Auto-shrink text vs auto-grow node size (configurable)
- [ ] Panning (combined pan/zoom mode where crosshairs follow view)

## Key Menu

- [ ] Show modifier keys (Shift, Alt, Ctrl) in the visible keyboard overlay
- [ ] Ctrl/Caps Lock swap toggle — checkbox in UI, persisted in localStorage
- [ ] Representational/layered UI (KCM — cards with holes, colors per layer); see design_notes.md
- [ ] which-key style hints (emacs-inspired, show bindings on demand)
- [ ] Delay before updating menu display (only if user is exploring)
- [ ] Hide/show toggle: shift-shift
- [ ] Auto-show if key held ~1.5 seconds with no action
- [ ] Handle canvas pan/recenter when menu opens over drawing area
- [ ] Card color experimentation: gradual blue→green over 4+ levels, exact palette TBD
- [ ] Color-blind accessibility: textures or patterns on cards as alternative to color alone
- [ ] Key shape indicators: cut corners, rounded corners, etc. to distinguish action/submenu/both/release-action keys
- [ ] Number row and space bar row on keyboard cards
- [ ] Label edit card: show Backspace, Enter, Escape, Shift as labeled keys (requires expanded layout)
- [ ] Timing experiments: quick double-press actions, 3-second inactivity reset/cancel
- [ ] Card slide animation tuning: direction, duration, easing, delay
- [ ] Add command registry layer to decouple command details from keymenu
- [ ] Add pluggable visualization layer (different renderers)
- [ ] Support different keyboard layouts
- [ ] Make keymenu reusable for other applications
- [ ] Rename: remove Config suffix from config classes, add Renderer suffix to Konva implementations

## Content / Formatting

- [ ] Markdown in node text
- [ ] Math support (longer term)

## Visual / Style

- [ ] Separate edges when they are too close (parallel edge spacing)
- [ ] Different node shapes, colors, line types
- [ ] Animate node add/remove
- [ ] Overall visual polish pass

## Infrastructure

- [ ] Analytics (GA4)
- [ ] AWS deployment (secure, SSO, roles)
- [ ] CI/CD pipeline for automated testing
- [ ] Set up as reusable libraries

## Auto-layout / Edge Routing

- [ ] Near-term: investigate dagre/elkjs for automatic edge routing
- [ ] Longer-term: SMT solver-based layout (also relevant for key menu layout)

## Longer Term

- [ ] AI generation/refactoring of diagrams
- [ ] Auto-arrangement of nodes/subsets
- [ ] OpenClaw integration
- [ ] Integration with Slack, WhatsApp, API
- [ ] Private deployments
- [ ] Sequence/class/UML diagram support

---

## Alternative Approaches to Try Later (Key Menu Code Organization)
- [ ] Try ActionKey/SubmenuKey inheritance (SubmenuKey extends ActionKey)
- [ ] Try mixins approach for flexible behavior composition
- [ ] Try factory methods + type guards/casts instead of Default classes

---

## Completed

- [x] Key assignment configuration layer (`KeymenuKeyAssignments` + `DEFAULT_KEYMENU_KEY_ASSIGNMENTS`)
- [x] Reusable `KeyMenuConfig` interface
- [x] Drag-able nodes
  - Submenu key for "drag selected"; crosshairs disappear during drag; auto-pan near edges
- [x] Deletion
  - Delete selected nodes + connected edges; selected edges; waypoints (rejoining edges); item under crosshairs if nothing selected
- [x] Basic waypoints on edges
  - Add waypoint to edge under crosshairs, visible when selected, draggable, deletable
