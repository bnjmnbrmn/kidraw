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

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export type ItemColor = 'default' | 'red' | 'blue' | 'green' | 'orange' | 'purple';

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
  TRAVERSE_OUTGOING_NEXT = 'TRAVERSE_OUTGOING_NEXT',
  TRAVERSE_INCOMING_NEXT = 'TRAVERSE_INCOMING_NEXT',
  TRAVERSE_NEXT_EDGE = 'TRAVERSE_NEXT_EDGE',
  TRAVERSE_PREV_EDGE = 'TRAVERSE_PREV_EDGE',
  FOCUS_SELECTED_FOR_GRAPH_NAV = 'FOCUS_SELECTED_FOR_GRAPH_NAV',
  SNAP_TO_NEAREST_NODE = 'SNAP_TO_NEAREST_NODE',
  SNAP_TO_NODE_LEFT = 'SNAP_TO_NODE_LEFT',
  SNAP_TO_NODE_RIGHT = 'SNAP_TO_NODE_RIGHT',
  SNAP_TO_NODE_UP = 'SNAP_TO_NODE_UP',
  SNAP_TO_NODE_DOWN = 'SNAP_TO_NODE_DOWN',
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
  CREATE_NEW_NODE_DIRECTED = 'CREATE_NEW_NODE_DIRECTED',
  BEGIN_DIRECTED_EDGE = 'BEGIN_DIRECTED_EDGE',
  SET_EDGE_DESTINATION = 'SET_EDGE_DESTINATION',
  FINALIZE_DIRECTED_EDGE = 'FINALIZE_DIRECTED_EDGE',
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
  GRAPH_NAV_EXIT = 'GRAPH_NAV_EXIT',
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
  CONNECT_VAULT = 'CONNECT_VAULT',
  VAULT_OPEN = 'VAULT_OPEN',
  VAULT_SAVE_AS = 'VAULT_SAVE_AS',
  SEARCH_GRAPH = 'SEARCH_GRAPH',
  SEARCH_NEXT_MATCH = 'SEARCH_NEXT_MATCH',
  SEARCH_PREV_MATCH = 'SEARCH_PREV_MATCH',
  TOGGLE_PIN_SELECTED = 'TOGGLE_PIN_SELECTED',
  APPLY_LAYOUT = 'APPLY_LAYOUT',
  APPLY_EDGE_ROUTING = 'APPLY_EDGE_ROUTING',
  QUERY_EDIT_CONTEXT = 'QUERY_EDIT_CONTEXT',
  EDIT_OR_INSERT = 'EDIT_OR_INSERT',
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
  | {kind: DACommandType.TRAVERSE_OUTGOING_NEXT; gridTier?: GridTier}
  | {kind: DACommandType.TRAVERSE_INCOMING_NEXT; gridTier?: GridTier}
  | {kind: DACommandType.TRAVERSE_NEXT_EDGE}
  | {kind: DACommandType.TRAVERSE_PREV_EDGE}
  | {kind: DACommandType.FOCUS_SELECTED_FOR_GRAPH_NAV}
  | {kind: DACommandType.SNAP_TO_NEAREST_NODE}
  | {kind: DACommandType.SNAP_TO_NODE_LEFT}
  | {kind: DACommandType.SNAP_TO_NODE_RIGHT}
  | {kind: DACommandType.SNAP_TO_NODE_UP}
  | {kind: DACommandType.SNAP_TO_NODE_DOWN}
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
  | {kind: DACommandType.CREATE_NEW_NODE_DIRECTED; direction: 'up' | 'down' | 'left' | 'right'; nodeShape?: NodeShape}
  | {kind: DACommandType.BEGIN_DIRECTED_EDGE}
  | {kind: DACommandType.SET_EDGE_DESTINATION, direction: 'up' | 'down' | 'left' | 'right'}
  | {kind: DACommandType.FINALIZE_DIRECTED_EDGE}
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
  | {kind: DACommandType.GRAPH_NAV_EXIT}
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
  | {kind: DACommandType.CONNECT_VAULT}
  | {kind: DACommandType.VAULT_OPEN}
  | {kind: DACommandType.VAULT_SAVE_AS}
  | {kind: DACommandType.SEARCH_GRAPH}
  | {kind: DACommandType.SEARCH_NEXT_MATCH}
  | {kind: DACommandType.SEARCH_PREV_MATCH}
  | {kind: DACommandType.TOGGLE_PIN_SELECTED}
  | {kind: DACommandType.APPLY_LAYOUT; layout: LayoutType}
  | {kind: DACommandType.APPLY_EDGE_ROUTING; algorithm: RoutingAlgorithm}
  | {kind: DACommandType.QUERY_EDIT_CONTEXT}
  | {kind: DACommandType.EDIT_OR_INSERT}
