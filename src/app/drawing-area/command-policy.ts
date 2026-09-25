/**
 * Cross-cutting policy about commands, independent of what each one does.
 *
 * Before the drawing area runs a command it asks four questions that have
 * nothing to do with the command's own effect: may it run right now, does it
 * need an undo snapshot, should the movement overlay appear, does the keymenu
 * need a fresh context. Each answer is a membership test over a list of
 * command kinds, so the lists and the predicates reading them live here rather
 * than as static members of a component that never varies them.
 *
 * Adding a command kind is a two-step job: give it a handler in its owner's
 * slice (see command-handlers.ts; the compiler refuses a kind with none), then
 * decide which of these lists it belongs in.
 */
import { DACommand, DACommandType } from './command.model';

/** Commands that change the graph: each takes an undo snapshot first and
 *  schedules a vault auto-save afterwards. Changing the diagram type is not a
 *  command: `:type` reaches it directly, so FileController.setDiagramType
 *  snapshots and saves for itself. A command
 *  listed here must not also snapshot for itself, or undo gets a spare step
 *  (tools/qa/undo/one-step-per-change.js). PLUGIN_COMMAND is not here either:
 *  plugins change the graph through operations, which record their own undo
 *  group and save (plugins/plugin-host.ts). */
const MUTATING_COMMANDS = new Set<DACommandType>([
  DACommandType.CREATE_NEW_NODE,
  DACommandType.ADD_SELF_EDGE,
  DACommandType.CYCLE_EDGE_DIRECTEDNESS,
  DACommandType.INSERT_WAYPOINT,
  DACommandType.ADD_LABEL,
  DACommandType.TOGGLE_PIN_SELECTED,
  DACommandType.INSERT_CHAR,
  DACommandType.DELETE_LAST_CHAR,
  DACommandType.DRAG_SELECTED_LEFT,
  DACommandType.DRAG_SELECTED_RIGHT,
  DACommandType.DRAG_SELECTED_UP,
  DACommandType.DRAG_SELECTED_DOWN,
  DACommandType.MULTI_ITEM_SELECT,
  DACommandType.UNSELECT_ALL,
  DACommandType.SET_TEXT_OVERFLOW_MODE,
  DACommandType.SET_NODE_SHAPE,
  DACommandType.SET_LINE_STYLE,
  DACommandType.SET_ITEM_COLOR,
  DACommandType.CUT_SELECTION,
  DACommandType.PASTE_CLIPBOARD,
]);

/** Commands refused while a routing pass is in flight, because they would
 *  edit the graph the router is still working on. */
const ROUTING_LOCKED_COMMANDS = new Set<DACommandType>([
  DACommandType.CREATE_NEW_NODE,
  DACommandType.ADD_SELF_EDGE,
  DACommandType.INSERT_WAYPOINT,
  DACommandType.ADD_LABEL,
  DACommandType.QUICK_ADD,
  DACommandType.CYCLE_EDGE_DIRECTEDNESS,
  DACommandType.INSERT_CHAR,
  DACommandType.DELETE_LAST_CHAR,
  DACommandType.CUT_SELECTION,
  DACommandType.PASTE_CLIPBOARD,
  DACommandType.UNDO,
  DACommandType.REDO,
  DACommandType.DRAG_SELECTED_LEFT,
  DACommandType.DRAG_SELECTED_RIGHT,
  DACommandType.DRAG_SELECTED_UP,
  DACommandType.DRAG_SELECTED_DOWN,
  DACommandType.SET_TEXT_OVERFLOW_MODE,
  DACommandType.SET_NODE_SHAPE,
  DACommandType.SET_LINE_STYLE,
  DACommandType.SET_ITEM_COLOR,
  DACommandType.LOAD_SAMPLE_GRAPH,
  DACommandType.LOAD_NAMED_GRAPH,
  DACommandType.NEW_GRAPH,
  DACommandType.VAULT_OPEN,
  DACommandType.TOGGLE_PIN_SELECTED,
  DACommandType.APPLY_LAYOUT,
  DACommandType.PLUGIN_COMMAND,
]);

/** Move-by-node has its own spatial overlay. Showing the ordinary drawing
 *  grid for these commands makes the band model visually ambiguous. */
const MOVE_BY_NODE_COMMANDS = new Set<DACommandType>([
  DACommandType.SET_GRAPH_ITEM_NAVIGATION_STRATEGY,
  DACommandType.SHOW_NODE_GRID,
  DACommandType.HIDE_NODE_GRID,
  DACommandType.SNAP_TO_NODE_LEFT,
  DACommandType.SNAP_TO_NODE_RIGHT,
  DACommandType.SNAP_TO_NODE_UP,
  DACommandType.SNAP_TO_NODE_DOWN,
  DACommandType.ADJUST_GRAPH_ITEM_GOAL_SOUTH,
  DACommandType.ADJUST_GRAPH_ITEM_GOAL_NORTH,
]);

/** Text entry and the gestures that open it. The crosshairs are standing on
 *  the thing being typed into, so the movement grid is noise. */
const TEXT_ENTRY_COMMANDS = new Set<DACommandType>([
  DACommandType.INSERT_CHAR,
  DACommandType.DELETE_LAST_CHAR,
  DACommandType.EXIT_LABEL_EDIT_MODE,
  DACommandType.QUICK_ADD,
  DACommandType.BEGIN_NEW_NODE_LABEL_EDIT,
  DACommandType.ENTER_ADD_MODE,
  DACommandType.EDIT_TEXT_AT_CROSSHAIRS,
  DACommandType.REDO,
]);

/** Commands after which the keymenu needs a fresh picture of what is selected
 *  and where the crosshairs are, so it can enable the right entries. */
const CONTEXT_AFFECTING_COMMANDS = new Set<DACommandType>([
  DACommandType.CREATE_NEW_NODE,
  DACommandType.ADD_SELF_EDGE,
  DACommandType.ADD_LABEL,
  DACommandType.MULTI_ITEM_SELECT,
  DACommandType.UNSELECT_ALL,
  DACommandType.UNDO,
  DACommandType.REDO,
  DACommandType.SNAP_TO_NODE_LEFT,
  DACommandType.SNAP_TO_NODE_RIGHT,
  DACommandType.SNAP_TO_NODE_UP,
  DACommandType.SNAP_TO_NODE_DOWN,
  DACommandType.ADJUST_GRAPH_ITEM_GOAL_SOUTH,
  DACommandType.ADJUST_GRAPH_ITEM_GOAL_NORTH,
  DACommandType.ENTER_LINK_NAV,
  DACommandType.MOVE_LINK_LEFT,
  DACommandType.MOVE_LINK_RIGHT,
  DACommandType.MOVE_LINK_UP,
  DACommandType.MOVE_LINK_DOWN,
  DACommandType.RELEASE_LINK_NAV,
  DACommandType.NAV_HISTORY_BACK,
  DACommandType.NAV_HISTORY_FORWARD,
  DACommandType.LOAD_SAMPLE_GRAPH,
  DACommandType.NEW_GRAPH,
  DACommandType.EXIT_LABEL_EDIT_MODE,
  DACommandType.RECENTER_VIEW,
  DACommandType.RECENTER_CROSSHAIRS,
  DACommandType.SET_NODE_SHAPE,
  DACommandType.QUICK_ADD,
  DACommandType.CYCLE_EDGE_DIRECTEDNESS,
  DACommandType.SEARCH_GRAPH,
  DACommandType.SEARCH_NEXT_MATCH,
  DACommandType.SEARCH_PREV_MATCH,
]);

/** Does this command change the graph? Such commands take an undo snapshot
 *  before running and schedule a vault auto-save after. */
export function mutatesGraph(kind: DACommandType): boolean {
  return MUTATING_COMMANDS.has(kind);
}

/** Is this command refused while a routing pass is in flight? */
export function isBlockedWhileRouting(kind: DACommandType): boolean {
  return ROUTING_LOCKED_COMMANDS.has(kind);
}

/** Should the drawing grid and movement indicators appear for this command?
 *  True for spatial and manipulation work; false where another overlay owns
 *  the screen or the user is typing. */
export function showsMovementIndicators(kind: DACommandType): boolean {
  return !MOVE_BY_NODE_COMMANDS.has(kind) && !TEXT_ENTRY_COMMANDS.has(kind);
}

/** Does the keymenu need a fresh context state after this command? */
export function affectsContextState(kind: DACommandType): boolean {
  return CONTEXT_AFFECTING_COMMANDS.has(kind);
}

/**
 * Does this command end the current normal-movement gesture?
 *
 * The ordinary goal line describes one uninterrupted normal-movement gesture.
 * Any other command ends that gesture immediately rather than leaving a stale
 * guide over editing, dragging, or graph navigation — and so does a crosshairs
 * move on a coarser or finer grid tier, which is a different gesture.
 */
export function endsNormalMovementGoal(command: DACommand): boolean {
  switch (command.kind) {
    case DACommandType.MOVE_CROSSHAIRS_LEFT:
    case DACommandType.MOVE_CROSSHAIRS_RIGHT:
    case DACommandType.MOVE_CROSSHAIRS_UP:
    case DACommandType.MOVE_CROSSHAIRS_DOWN:
      return command.gridTier !== undefined && command.gridTier !== 'normal';
    default:
      return true;
  }
}
