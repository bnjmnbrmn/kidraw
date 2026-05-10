import {EdgeDirectedness, LineStyle, NodeShape} from './command.model';

export type DANotification =
  | {kind: "started-label-editing-mode"}
  | {kind: "exit-label-editing-mode"}
  | {kind: "context-state-update", selectionSummary: string, totalNodes: number, totalEdges: number, defaultNodeShape: NodeShape, defaultEdgeDirectedness: EdgeDirectedness, defaultLineStyle: LineStyle, canUndo: boolean, canRedo: boolean}
  | {kind: "status-message", message: string}
