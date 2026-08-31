import {EdgeDirectedness, LineStyle, NodeShape, TextCursorMode} from './command.model';

/** The non-keymenu interaction currently owning the keyboard. The keymenu
 *  still renders this surface's live controls while its command handlers are
 *  suspended. */
export type KeyboardSurface =
  | 'nav-popup'
  | 'grow-targeting'
  | 'grow-edge'
  | 'grow-empty'
  | 'grow-target-popup'
  | 'grow-type-popup'
  | 'grow-placement';

/** The backing location of the graph currently on the canvas. Vault identity
 * stays structured so a directory name is never guessed by splitting a path. */
export type DAFileState =
  | {storage: 'vault', vaultName: string, path: string}
  | {storage: 'external', path: string}
  | null;

export type DANotification =
  | {kind: "started-label-editing-mode", mode: Extract<TextCursorMode, 'insert' | 'vimNormal'>}
  | {kind: "label-added"}
  | {kind: "node-inserted", labelable: boolean}
  | {kind: "exit-label-editing-mode"}
  | {kind: "context-state-update", selectionSummary: string, totalNodes: number, totalEdges: number, defaultNodeShape: NodeShape, defaultEdgeDirectedness: EdgeDirectedness, defaultLineStyle: LineStyle, canUndo: boolean, canRedo: boolean}
  | {kind: "status-message", message: string}
  | {kind: "file-state-update", fileState: DAFileState}
  | {kind: "popup-state", open: true, surface: KeyboardSurface}
  | {kind: "popup-state", open: false}
