# Project Todos

## Interaction Redesign: Held-Key Modes + Waypoints vs Labels

### Concepts
- **Waypoint** = geometry-only bend point on an edge (no text, just changes edge path)
- **Label** = text annotation on an edge (has text, positioned along edge, visible box)
- **Held-key mode** = while a base-level key is held, a submenu or movement mode is active; releasing the key exits the mode

### Key Layout (base level, normal mode)
Three base-level held keys, all allowing opposite-hand movement + zoom while held:
- **Add+Drag key** — opens submenu to add node / waypoint / edge / label
  - Context-sensitive: grey out options that don't make sense (e.g. "edge" requires 2 selected nodes)
  - After adding, the new item is auto-selected and draggable while key is held
  - Releasing the key unselects the item and returns to normal mode
- **Select+Drag key** — selects item under crosshairs, then drag while held
  - Releasing the key unselects and returns to normal mode
- **Move key** — move crosshairs with opposite hand while held
  - Also allows zoom in/out with opposite hand
- **Delete key** — delete selected or item under crosshairs (already implemented as `x`)

While any of the three held keys are active, opposite-hand keys provide:
- **Movement**: jkli (right-hand) or fdse (left-hand), depending on handedness setting
- **Zoom**: m. or vx (TBD based on handedness)
- Handedness togglable under a "Basic Settings" menu (left-hand-dominant vs right-hand-dominant)

### Implementation Phases

#### Phase 1: Distinguish Waypoints vs Labels in Data Model
- [ ] Rename existing waypoint-with-text concept to "Label" (DALabel class)
- [ ] Simplify DAWaypoint to geometry-only (circle, no text/rect)
- [ ] DALabel: text annotation on edge, always-visible text, positioned along edge
- [ ] Both share: position on edge, selectable, draggable, deletable
- [ ] Update DAEdge to hold both waypoints[] and labels[]
- [ ] Unit tests for waypoint vs label creation, selection, deletion

#### Phase 2: Held-Key Mode Infrastructure in KeyMenu
- [ ] Add "held-key mode" concept to KeyMenu: keyDown enters mode, keyUp exits mode
  - Different from current submenu which waits for a second keypress
  - Need to track which base key is held and route opposite-hand keys as movement/zoom
- [ ] Define HeldKeyMode interface: onEnter, onMovement, onZoom, onExit
- [ ] Wire up app key repeat (suppress system repeat, use app-controlled repeat for movement)
- [ ] Unit tests for held-key mode enter/exit lifecycle

#### Phase 3: Move Mode
- [ ] Implement Move as simplest held-key mode (crosshair movement + zoom only)
- [ ] Opposite-hand movement keys (jkli or fdse) move crosshairs
- [ ] Opposite-hand zoom keys zoom in/out
- [ ] Crosshairs visible during move mode
- [ ] Unit tests + Puppeteer test: hold move key, press movement keys, verify crosshair position

#### Phase 4: Add+Drag Mode
- [ ] Add+Drag key enters held mode, shows submenu overlay (node / waypoint / edge / label)
- [ ] Submenu key press triggers creation at crosshairs position
  - Node: create node at crosshairs
  - Waypoint: create waypoint on edge under crosshairs
  - Edge: connect selected nodes (greyed if < 2 nodes selected)
  - Label: create label on edge under crosshairs
- [ ] After creation, auto-select new item
- [ ] While Add+Drag key still held, opposite-hand movement drags the new item
- [ ] Releasing Add+Drag key unselects and returns to normal mode
- [ ] Grey out inapplicable submenu options based on context
- [ ] Unit tests + Puppeteer tests for each add scenario

#### Phase 5: Select+Drag Mode
- [ ] Select+Drag key held: select item under crosshairs (node, edge, waypoint, or label)
- [ ] While held, opposite-hand movement drags the selected item
- [ ] Releasing unselects and returns to normal mode
- [ ] Support multi-select: crosshairs over additional items while held adds to selection
- [ ] Unit tests + Puppeteer tests for select+drag lifecycle

#### Phase 6: Handedness Toggle + Basic Settings
- [ ] Add "Basic Settings" menu accessible from a key (TBD)
- [ ] Handedness setting: left-hand-dominant vs right-hand-dominant
  - Left-hand: base keys on left (f/d/s area), movement on right (jkli)
  - Right-hand: base keys on right (j/k/l area), movement on left (fdse)
- [ ] Persist setting in localStorage
- [ ] Movement/zoom key assignments update based on handedness
- [ ] Unit tests for key mapping based on handedness setting

### Open Questions
- Exact key assignments for Add+Drag, Select+Drag, Move (depends on handedness default)
- How to visualize greyed-out submenu options
- Should multi-select persist across Select+Drag holds? (probably not initially)
- Edge label positioning algorithm details (defer to later)

---

## Other Remaining Work

### Core Features
- [ ] Editable text on nodes
   - What sorts of keybindings to support when editing text?  Vim/Emacs/Ctrl-c etc + arrow keys?
   - How to make this configurable?
   - Change node size to allow for more/less text?  Change text size?  Max text length?
- [ ] Figure out how to deal with overlapping nodes
  - Z-cycle?
  - Blocking insertion of overlapping nodes?
  - Pushing nodes away when too close?
- [ ] Allow edges to be non-directed or bidirectional
- [ ] Allow connecting nodes to themselves
- [ ] Undo/Redo
- [ ] Graph Navigation
- [ ] Shortcut to create a new node connected to the currently selected one
- [ ] Panning
   - Maybe have combined pan/zoom mode, where the crosshairs follow the view area
- [ ] Fast/accelerating and slow/decelerating movement/zooming/panning
- [ ] Savable/loadable diagrams (local storage or file system)

### Polish & Infrastructure
- [ ] Introduce App Key Repeat / Ignore System Key Repeat
- [ ] Make pretty (animate node add, etc.)
- [ ] Separate edges when they are too close
- [ ] Make keymenu keybindings configurable
- [ ] Update keymenu to optionally use "cards"
- [ ] Create entity-relation diagram to help understand system
- [ ] Deploy using S3/Route 53
- [ ] Set up analytics
- [ ] Set up as libraries
- [ ] Add CI/CD pipeline for automated testing

## Key Menu Refactoring 
- [ ] Add command registry layer to hide command details
- [ ] Add pluggable visualization layer (different renderers)
- [ ] Add key assignment configuration layer
- [ ] Create reusable KeyMenuConfig interface
- [ ] Support different keyboard layouts and visualizations
- [ ] Make keymenu reusable for other applications
- [ ] Rename: Remove Config suffix from config classes, add "Renderer" suffix to Konva implementation classes

## Alternative Approaches to Try Later for Key Menu Code organization
- [ ] Try ActionKey/SubmenuKey inheritance (SubmenuKey extends ActionKey)
- [ ] Try mixins approach for flexible behavior composition
- [ ] Try factory methods + type guards/casts instead of Default classes

---

## Completed
- [x] Drag-able nodes
  - Have a submenukey on the left side, maybe r, for "drag selected"
  - The submenu continues to have left/right/up/down options
  - Crosshairs disappear during the drag
  - When your leftmost selected item goes off screen (or partially off), you start to auto-pan left (same logic for other directions)
  - **Known Issues:**
    - ~~Edge alignment during drag needs fine-tuning - edges move but may not align perfectly with node centers during animation~~ ✅ **FIXED**
    - ~~Edge points update after animation rather than smoothly during movement~~ ✅ **FIXED**
- [x] Deletion
   - If one or more nodes are selected, delete them and any edges connected to them
   - If one or more edges are selected (and no nodes), delete them
   - If a waypoint is selected, remove it and join the edges it connects with
   - If nothing is selected, delete the node/edge/waypoint under the crosshairs, if any
- [x] Basic waypoints on edges
  - Key to add waypoint to edge under crosshairs (`w`)
  - Waypoints visible when selected
  - Waypoints draggable
  - Waypoints deletable (`x` key)
  - Auto-enable waypoint visibility when adding waypoint
