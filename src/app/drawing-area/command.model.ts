export type DACommand =
  | {kind: "move-cursor-left"}
  | {kind: "move-cursor-right"}
  | {kind: "move-cursor-up"}
  | {kind: "move-cursor-down"}
  | {kind: "create-new-node"}
  | {kind: "insert-char", value: string}
  | {kind: "exit-label-edit-mode"}
  | {kind: "toggle-item-selection"}
  | {kind: "connect-selected-nodes"}
  | {kind: "create-connected-node"}

