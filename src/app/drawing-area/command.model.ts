export type DACommand =
  | {kind: "move-cursor-left"}
  | {kind: "move-cursor-right"}
  | {kind: "move-cursor-up"}
  | {kind: "move-cursor-down"}
  | {kind: "create-new-node"}
  | {kind: "insert-char", value: string}
  | {kind: "exit-label-edit-mode"}
  | {kind: "toggle-item-selection"}
  | {kind: "zoom-in"}
  | {kind: "zoom-out"}
  | {kind: "pan-left"}
  | {kind: "pan-right"}
  | {kind: "pan-up"}
  | {kind: "pan-down"}
  | {kind: "connect-selected-nodes"}
  | {kind: "create-connected-node"}

