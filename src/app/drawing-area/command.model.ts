export type DACommand =
  | {kind: "move-crosshairs-left"}
  | {kind: "move-crosshairs-right"}
  | {kind: "move-crosshairs-up"}
  | {kind: "move-crosshairs-down"}
  | {kind: "create-new-node"}
  | {kind: "insert-char", value: string}
  | {kind: "exit-label-edit-mode"}
  | {kind: "toggle-item-selection"}
  | {kind: "zoom-in"}
  | {kind: "zoom-out"}
  | {kind: "connect-selected-nodes"}
  | {kind: "create-connected-node"}

