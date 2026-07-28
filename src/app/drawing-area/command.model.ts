import { GraphSnapshot } from './graph-snapshot';

export type NodeShape = 'box' | 'circle' | 'diamond' | 'junction' | 'invisible';

export type TextOverflowMode = 'clip' | 'shrink-font' | 'ellipsis' | 'widen-h' | 'widen-v' | 'widen-both' | 'fit';

// The '-clear' variants are the same algorithms with straight-edge
// guarantees (no chord through a non-endpoint node); kept alongside the
// originals for comparison. 'grid' is currently unbound in the keymenu but
// still a valid layout.
export type LayoutType = 'force-directed' | 'force-clear' | 'tree-down' | 'tree-down-clear'
  | 'tree-right' | 'tree-right-clear' | 'grid' | 'circular' | 'radial';

/** Edge-routing algorithms selectable from the Layout submenu. */
export type RoutingAlgorithm = 'bezier-fit-weighted-chain' | 'desiderata' | 'incremental-desiderata-v2' | 'incremental-desiderata-v3';

export type EdgeDirectedness = 'directed' | 'undirected' | 'bidirectional';

/** Which kinds of stop move-by-node steps between (tiered by modifier). */
export type NavTargetKind = 'nodes' | 'labels' | 'all';

/** Spatial policies available to graph-item navigation. */
export type GraphItemNavigationStrategy =
  | 'adaptive-band-grid'
  | 'adaptive-quadrant-grid'
  | 'adaptive-quadrant-rings';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export type ItemColor = 'default' | 'red' | 'blue' | 'green' | 'orange' | 'purple';

/** Task statuses on todo graphs; 'none' clears the status. The tag persisted
 *  on the node is `status/<value>` (see the todo-graph extension's tag group). */
export type TaskStatus = 'draft' | 'todo' | 'in-progress' | 'blocked' | 'done' | 'none';

export enum DACommandType {
  MOVE_CROSSHAIRS_LEFT = 'MOVE_CROSSHAIRS_LEFT',
  MOVE_CROSSHAIRS_RIGHT = 'MOVE_CROSSHAIRS_RIGHT',
  MOVE_CROSSHAIRS_UP = 'MOVE_CROSSHAIRS_UP',
  MOVE_CROSSHAIRS_DOWN = 'MOVE_CROSSHAIRS_DOWN',
  STEER_FORWARD = 'STEER_FORWARD',
  STEER_BACKWARD = 'STEER_BACKWARD',
  STRAFE_LEFT = 'STRAFE_LEFT',
  STRAFE_RIGHT = 'STRAFE_RIGHT',
  ROTATE_HEADING_LEFT = 'ROTATE_HEADING_LEFT',
  ROTATE_HEADING_RIGHT = 'ROTATE_HEADING_RIGHT',
  INCREASE_MOVE_SPEED = 'INCREASE_MOVE_SPEED',
  DECREASE_MOVE_SPEED = 'DECREASE_MOVE_SPEED',
  TRAVERSE_SMART = 'TRAVERSE_SMART',
  NAV_HISTORY_BACK = 'NAV_HISTORY_BACK',
  NAV_HISTORY_FORWARD = 'NAV_HISTORY_FORWARD',
  SNAP_TO_NEAREST_NODE = 'SNAP_TO_NEAREST_NODE',
  SET_GRAPH_ITEM_NAVIGATION_STRATEGY = 'SET_GRAPH_ITEM_NAVIGATION_STRATEGY',
  SHOW_NODE_GRID = 'SHOW_NODE_GRID',
  HIDE_NODE_GRID = 'HIDE_NODE_GRID',
  SNAP_TO_NODE_LEFT = 'SNAP_TO_NODE_LEFT',
  SNAP_TO_NODE_RIGHT = 'SNAP_TO_NODE_RIGHT',
  SNAP_TO_NODE_UP = 'SNAP_TO_NODE_UP',
  SNAP_TO_NODE_DOWN = 'SNAP_TO_NODE_DOWN',
  ADJUST_GRAPH_ITEM_GOAL_SOUTH = 'ADJUST_GRAPH_ITEM_GOAL_SOUTH',
  ADJUST_GRAPH_ITEM_GOAL_NORTH = 'ADJUST_GRAPH_ITEM_GOAL_NORTH',
  INCREASE_SELECTED_NODE_SIZE = 'INCREASE_SELECTED_NODE_SIZE',
  DECREASE_SELECTED_NODE_SIZE = 'DECREASE_SELECTED_NODE_SIZE',
  INCREASE_SELECTED_TEXT_SIZE = 'INCREASE_SELECTED_TEXT_SIZE',
  DECREASE_SELECTED_TEXT_SIZE = 'DECREASE_SELECTED_TEXT_SIZE',
  CREATE_NEW_NODE = 'CREATE_NEW_NODE',
  INSERT_WAYPOINT = 'INSERT_WAYPOINT',
  INSERT_CHAR = 'INSERT_CHAR',
  EXIT_LABEL_EDIT_MODE = 'EXIT_LABEL_EDIT_MODE',
  MULTI_ITEM_SELECT = 'MULTI_ITEM_SELECT',
  ZOOM_IN = 'ZOOM_IN',
  ZOOM_OUT = 'ZOOM_OUT',
  CONNECT_SELECTED_NODES = 'CONNECT_SELECTED_NODES',
  SINGLE_ITEM_TOGGLE_SELECT = 'SINGLE_ITEM_TOGGLE_SELECT',
  RECENTER_VIEW = 'RECENTER_VIEW',
  RECENTER_CROSSHAIRS = 'RECENTER_CROSSHAIRS',
  RECENTER_VIEW_ON_CROSSHAIRS = 'RECENTER_VIEW_ON_CROSSHAIRS',
  UNSELECT_ALL = 'UNSELECT_ALL',
  ENTER_DRAG_MODE = 'ENTER_DRAG_MODE',
  DRAG_SELECTED_LEFT = 'DRAG_SELECTED_LEFT',
  DRAG_SELECTED_RIGHT = 'DRAG_SELECTED_RIGHT',
  DRAG_SELECTED_UP = 'DRAG_SELECTED_UP',
  DRAG_SELECTED_DOWN = 'DRAG_SELECTED_DOWN',
  EXIT_DRAG_MODE = 'EXIT_DRAG_MODE',
  DELETE = 'DELETE',
  ADD_LABEL = 'ADD_LABEL',
  OPEN_INSERT_SUBMENU = 'OPEN_INSERT_SUBMENU',
  EDIT_SELECTED = 'EDIT_SELECTED',
  DELETE_LAST_CHAR = 'DELETE_LAST_CHAR',
  UNDO = 'UNDO',
  REDO = 'REDO',
  SET_TEXT_OVERFLOW_MODE = 'SET_TEXT_OVERFLOW_MODE',
  SET_NODE_SHAPE = 'SET_NODE_SHAPE',
  PAN_LEFT = 'PAN_LEFT',
  PAN_RIGHT = 'PAN_RIGHT',
  PAN_UP = 'PAN_UP',
  PAN_DOWN = 'PAN_DOWN',
  GATHER_CONNECTED_NODES = 'GATHER_CONNECTED_NODES',
  UNGATHER = 'UNGATHER',
  SET_EDGE_DIRECTEDNESS = 'SET_EDGE_DIRECTEDNESS',
  SET_LINE_STYLE = 'SET_LINE_STYLE',
  SET_ITEM_COLOR = 'SET_ITEM_COLOR',
  SET_DEFAULT_EDGE_DIRECTEDNESS = 'SET_DEFAULT_EDGE_DIRECTEDNESS',
  SET_DEFAULT_LINE_STYLE = 'SET_DEFAULT_LINE_STYLE',
  LOAD_SAMPLE_GRAPH = 'LOAD_SAMPLE_GRAPH',
  SAVE_GRAPH_AS = 'SAVE_GRAPH_AS',
  LOAD_NAMED_GRAPH = 'LOAD_NAMED_GRAPH',
  NEW_GRAPH = 'NEW_GRAPH',
  OPEN_FILE = 'OPEN_FILE',
  SAVE_FILE_AS = 'SAVE_FILE_AS',
  EXPORT_ZIP = 'EXPORT_ZIP',
  CYCLE_DISPLAY = 'CYCLE_DISPLAY',
  SET_DIAGRAM_TYPE = 'SET_DIAGRAM_TYPE',
  SET_TASK_STATUS = 'SET_TASK_STATUS',
  CONNECT_VAULT = 'CONNECT_VAULT',
  VAULT_OPEN = 'VAULT_OPEN',
  VAULT_SAVE_AS = 'VAULT_SAVE_AS',
  SEARCH_GRAPH = 'SEARCH_GRAPH',
  SEARCH_NEXT_MATCH = 'SEARCH_NEXT_MATCH',
  SEARCH_PREV_MATCH = 'SEARCH_PREV_MATCH',
  TOGGLE_PIN_SELECTED = 'TOGGLE_PIN_SELECTED',
  APPLY_LAYOUT = 'APPLY_LAYOUT',
  APPLY_EDGE_ROUTING = 'APPLY_EDGE_ROUTING',
  QUICK_ADD = 'QUICK_ADD',
  BEGIN_NEW_NODE_LABEL_EDIT = 'BEGIN_NEW_NODE_LABEL_EDIT',
  ENTER_ADD_MODE = 'ENTER_ADD_MODE',
  EDIT_TEXT_AT_CROSSHAIRS = 'EDIT_TEXT_AT_CROSSHAIRS',
  CYCLE_EDGE_DIRECTEDNESS = 'CYCLE_EDGE_DIRECTEDNESS',
  // Label-edit caret (vim-normal-in-edit motions + delete-under-cursor).
  CURSOR_LEFT = 'CURSOR_LEFT',
  CURSOR_RIGHT = 'CURSOR_RIGHT',
  CURSOR_UP = 'CURSOR_UP',
  CURSOR_DOWN = 'CURSOR_DOWN',
  CURSOR_LINE_START = 'CURSOR_LINE_START',
  CURSOR_LINE_END = 'CURSOR_LINE_END',
  CURSOR_WORD_FORWARD = 'CURSOR_WORD_FORWARD',
  CURSOR_WORD_BACK = 'CURSOR_WORD_BACK',
  DELETE_CHAR_AT_CURSOR = 'DELETE_CHAR_AT_CURSOR',
}

export type GridTier = 'fine' | 'normal' | 'coarse';

export type DACommand =
  | {kind: DACommandType.MOVE_CROSSHAIRS_LEFT; distance?: number; gridTier?: GridTier}
  | {kind: DACommandType.MOVE_CROSSHAIRS_RIGHT; distance?: number; gridTier?: GridTier}
  | {kind: DACommandType.MOVE_CROSSHAIRS_UP; distance?: number; gridTier?: GridTier}
  | {kind: DACommandType.MOVE_CROSSHAIRS_DOWN; distance?: number; gridTier?: GridTier}
  | {kind: DACommandType.STEER_FORWARD}
  | {kind: DACommandType.STEER_BACKWARD}
  | {kind: DACommandType.STRAFE_LEFT}
  | {kind: DACommandType.STRAFE_RIGHT}
  | {kind: DACommandType.ROTATE_HEADING_LEFT}
  | {kind: DACommandType.ROTATE_HEADING_RIGHT}
  | {kind: DACommandType.INCREASE_MOVE_SPEED}
  | {kind: DACommandType.DECREASE_MOVE_SPEED}
  // holdKey: the physical key bound to Go, still held from the tap that fired
  // this — the popup treats its release as "activate the search pseudo-item".
  | {kind: DACommandType.TRAVERSE_SMART, holdKey?: string}
  | {kind: DACommandType.NAV_HISTORY_BACK}
  | {kind: DACommandType.NAV_HISTORY_FORWARD}
  | {kind: DACommandType.SNAP_TO_NEAREST_NODE}
  | {kind: DACommandType.SET_GRAPH_ITEM_NAVIGATION_STRATEGY; strategy: GraphItemNavigationStrategy}
  // targets: which stops move-by-node jumps between — 'nodes' (coarse),
  // 'labels' = nodes+labels (default), 'all' = nodes+labels+waypoints (fine).
  // Move-by-node grid overlay: shown while the move-by-node key is held.
  | {kind: DACommandType.SHOW_NODE_GRID; targets?: NavTargetKind}
  | {kind: DACommandType.HIDE_NODE_GRID}
  | {kind: DACommandType.SNAP_TO_NODE_LEFT; targets?: NavTargetKind}
  | {kind: DACommandType.SNAP_TO_NODE_RIGHT; targets?: NavTargetKind}
  | {kind: DACommandType.SNAP_TO_NODE_UP; targets?: NavTargetKind}
  | {kind: DACommandType.SNAP_TO_NODE_DOWN; targets?: NavTargetKind}
  | {kind: DACommandType.ADJUST_GRAPH_ITEM_GOAL_SOUTH; targets?: NavTargetKind}
  | {kind: DACommandType.ADJUST_GRAPH_ITEM_GOAL_NORTH; targets?: NavTargetKind}
  | {kind: DACommandType.INCREASE_SELECTED_NODE_SIZE}
  | {kind: DACommandType.DECREASE_SELECTED_NODE_SIZE}
  | {kind: DACommandType.INCREASE_SELECTED_TEXT_SIZE}
  | {kind: DACommandType.DECREASE_SELECTED_TEXT_SIZE}
  | {kind: DACommandType.CREATE_NEW_NODE; nodeShape?: NodeShape}
  | {kind: DACommandType.INSERT_WAYPOINT}
  | {kind: DACommandType.INSERT_CHAR, value: string}
  | {kind: DACommandType.EXIT_LABEL_EDIT_MODE}
  | {kind: DACommandType.MULTI_ITEM_SELECT}
  | {kind: DACommandType.ZOOM_IN}
  | {kind: DACommandType.ZOOM_OUT}
  | {kind: DACommandType.CONNECT_SELECTED_NODES}
  | {kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT}
  | {kind: DACommandType.RECENTER_VIEW}
  | {kind: DACommandType.RECENTER_CROSSHAIRS}
  | {kind: DACommandType.RECENTER_VIEW_ON_CROSSHAIRS}
  | {kind: DACommandType.UNSELECT_ALL}
  | {kind: DACommandType.ENTER_DRAG_MODE}
  | {kind: DACommandType.DRAG_SELECTED_LEFT; distance?: number; gridTier?: GridTier}
  | {kind: DACommandType.DRAG_SELECTED_RIGHT; distance?: number; gridTier?: GridTier}
  | {kind: DACommandType.DRAG_SELECTED_UP; distance?: number; gridTier?: GridTier}
  | {kind: DACommandType.DRAG_SELECTED_DOWN; distance?: number; gridTier?: GridTier}
  | {kind: DACommandType.EXIT_DRAG_MODE}
  | {kind: DACommandType.DELETE}
  | {kind: DACommandType.ADD_LABEL}
  | {kind: DACommandType.EDIT_SELECTED}
  | {kind: DACommandType.DELETE_LAST_CHAR}
  | {kind: DACommandType.UNDO}
  | {kind: DACommandType.REDO}
  | {kind: DACommandType.SET_TEXT_OVERFLOW_MODE; mode: TextOverflowMode}
  | {kind: DACommandType.SET_NODE_SHAPE; shape: NodeShape}
  | {kind: DACommandType.PAN_LEFT; distance?: number}
  | {kind: DACommandType.PAN_RIGHT; distance?: number}
  | {kind: DACommandType.PAN_UP; distance?: number}
  | {kind: DACommandType.PAN_DOWN; distance?: number}
  | {kind: DACommandType.GATHER_CONNECTED_NODES}
  | {kind: DACommandType.UNGATHER}
  | {kind: DACommandType.SET_EDGE_DIRECTEDNESS; directedness: EdgeDirectedness}
  | {kind: DACommandType.SET_LINE_STYLE; lineStyle: LineStyle}
  | {kind: DACommandType.SET_ITEM_COLOR; color: ItemColor}
  | {kind: DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS; directedness: EdgeDirectedness}
  | {kind: DACommandType.SET_DEFAULT_LINE_STYLE; lineStyle: LineStyle}
  | {kind: DACommandType.LOAD_SAMPLE_GRAPH; graphId: string}
  | {kind: DACommandType.SAVE_GRAPH_AS; name: string}
  | {kind: DACommandType.LOAD_NAMED_GRAPH; graphSnapshot: GraphSnapshot}
  | {kind: DACommandType.NEW_GRAPH}
  | {kind: DACommandType.OPEN_FILE}
  | {kind: DACommandType.SAVE_FILE_AS}
  | {kind: DACommandType.EXPORT_ZIP}
  | {kind: DACommandType.CYCLE_DISPLAY}
  | {kind: DACommandType.SET_DIAGRAM_TYPE; typeId: string}
  | {kind: DACommandType.SET_TASK_STATUS; status: TaskStatus}
  | {kind: DACommandType.CONNECT_VAULT}
  | {kind: DACommandType.VAULT_OPEN}
  | {kind: DACommandType.VAULT_SAVE_AS}
  | {kind: DACommandType.SEARCH_GRAPH}
  | {kind: DACommandType.SEARCH_NEXT_MATCH}
  | {kind: DACommandType.SEARCH_PREV_MATCH}
  | {kind: DACommandType.TOGGLE_PIN_SELECTED}
  | {kind: DACommandType.APPLY_LAYOUT; layout: LayoutType}
  | {kind: DACommandType.APPLY_EDGE_ROUTING; algorithm: RoutingAlgorithm}
  // Tap of the add key: default node at the crosshairs on empty canvas, or a
  // connected default node one slot right of the node under the crosshairs.
  | {kind: DACommandType.QUICK_ADD}
  // Release of a held node-insert flow after its optional drag phase.
  | {kind: DACommandType.BEGIN_NEW_NODE_LABEL_EDIT}
  // Keydown of the held add key. Over a node the drawing area enters the
  // grow mode (suspending the keymenu synchronously via popup-state) and
  // steers it with its own document-level listeners; otherwise this is a
  // no-op and the keymenu proceeds with the held hub submenu. keys carries
  // the active profile's steering bindings; holdKey's release commits.
  | {kind: DACommandType.ENTER_ADD_MODE; holdKey: string;
     keys: {up: string; left: string; down: string; right: string; cycle: string; newNode: string; search: string; coarse: string; fine: string}}
  // Tap of the insert-text key: edit the text of whatever is under the
  // crosshairs (node label, edge label, free label).
  | {kind: DACommandType.EDIT_TEXT_AT_CROSSHAIRS}
  // Cycle directedness of the selected edge(s): directed -> undirected ->
  // bidirectional. (Reversal of existing edges is a future structural op.)
  | {kind: DACommandType.CYCLE_EDGE_DIRECTEDNESS}
  | {kind: DACommandType.CURSOR_LEFT}
  | {kind: DACommandType.CURSOR_RIGHT}
  | {kind: DACommandType.CURSOR_UP}
  | {kind: DACommandType.CURSOR_DOWN}
  | {kind: DACommandType.CURSOR_LINE_START}
  | {kind: DACommandType.CURSOR_LINE_END}
  | {kind: DACommandType.CURSOR_WORD_FORWARD}
  | {kind: DACommandType.CURSOR_WORD_BACK}
  | {kind: DACommandType.DELETE_CHAR_AT_CURSOR}
