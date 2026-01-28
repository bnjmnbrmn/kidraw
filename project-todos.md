# Project Todos

## Key Menu
- [x] Add Konva stage, and add hints as stage items
- [x] Ignore System Key Repeat
- [x] Handle Key release for DefaultUSStackKMMode
- [x] Handle Switching Modes
- [ ] Introduce App Key Repeat
- [ ] Adjust keyboard shortcuts to be non-vim specific with movement keys FDSE

## Drawing Area
- [x] Recenter view
- [x] Recenter crosshairs
- [ ] Drag-able nodes
- [ ] Delete-able nodes
- [ ] Editable nodes
- [ ] Z-cycle
- [x] Add arrowheads to directed edges
- [ ] Add waypoints to edges
- [ ] Remove waypoints from edges
- [ ] Connect to new node
- [ ] Set new node direction
- [ ] Allow node text to be editable after creation
- [ ] Change node size to allow for more/less text
- [ ] Push nodes away from each other when they get too close
- [ ] Make edges movable
- [ ] Separate edges when they are too close
- [ ] Allow for directed and un-directed edges
- [ ] Graph Navigation
- [ ] Animate node add (fade in)
- [ ] Undo/Redo

## Deployment
- [ ] Deploy using S3/Route 53
- [ ] Set up analytics

## General
- [ ] Finish moving logic from component into layers
- [ ] Set up Konva source code for debugging
- [ ] Update Header
- [ ] Set up testing
- [ ] Set up tailwind
- [ ] Set up monorepo

## Architecture Refactoring Plan
1. [x] Refactor KMKey types with interface hierarchy + composition
   - Interfaces: `KMActionKey`, `KMSubmenuKey`, `KMActionSubmenuKey`
   - Classes: `DefaultKMActionKey`, `DefaultKMSubmenuKey`, `DefaultKMActionSubmenuKey`
   - Use composition to avoid code duplication
   - Action types have `onKeyDown`/`onKeyUp` (after rendering) + `onKeyDownBeforeRender`/`onKeyUpBeforeRender` (noops by default)
   - Enables drag feature: select on keydown, show direction submenu, unselect on keyup
2. [ ] Shorten names and reorganize with namespaces/modules
   - Tutorial on TypeScript namespaces vs modules
   - Create layout hierarchy for future multi-keyboard support
3. [ ] Refactor drawing-area to use composition instead of inheritance
   - `DANode extends Konva.Group` → `DANode { group: Konva.Group }`
   - Reconcile approaches across codebase

## Alternative Approaches to Try Later
- [ ] Try ActionKey/SubmenuKey inheritance (SubmenuKey extends ActionKey)
- [ ] Try mixins approach for flexible behavior composition
- [ ] Try factory methods + type guards/casts instead of Default classes
