import {EdgeDirectedness, LineStyle, NodeShape} from './command.model';

/** What a tap/hold of the edit/insert key would act on right now.
 *  Selection wins over crosshairs position; a waypoint under the crosshairs
 *  counts as 'empty' (insert node) rather than 'edge', per the i-key spec. */
export type EditContext = 'multi-select' | 'single-select' | 'item' | 'edge' | 'empty';

export type DANotification =
  | {kind: "started-label-editing-mode"}
  | {kind: "exit-label-editing-mode"}
  | {kind: "context-state-update", selectionSummary: string, totalNodes: number, totalEdges: number, defaultNodeShape: NodeShape, defaultEdgeDirectedness: EdgeDirectedness, defaultLineStyle: LineStyle, canUndo: boolean, canRedo: boolean}
  | {kind: "status-message", message: string}
  | {kind: "edit-context", context: EditContext}
