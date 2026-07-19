import {EdgeDirectedness, LineStyle, NodeShape} from './command.model';

/** The non-keymenu interaction currently owning the keyboard. The keymenu
 *  still renders this surface's live controls while its command handlers are
 *  suspended. */
export type KeyboardSurface =
  | 'nav-popup'
  | 'grow-targeting'
  | 'grow-empty'
  | 'grow-target-popup'
  | 'grow-type-popup'
  | 'grow-placement';

export type DANotification =
  | {kind: "started-label-editing-mode"}
  | {kind: "label-added"}
  | {kind: "node-inserted", labelable: boolean}
  | {kind: "exit-label-editing-mode"}
  | {kind: "context-state-update", selectionSummary: string, totalNodes: number, totalEdges: number, defaultNodeShape: NodeShape, defaultEdgeDirectedness: EdgeDirectedness, defaultLineStyle: LineStyle, canUndo: boolean, canRedo: boolean}
  | {kind: "status-message", message: string}
  | {kind: "file-state-update", fileLabel: string | null}
  | {kind: "popup-state", open: true, surface: KeyboardSurface}
  | {kind: "popup-state", open: false}
