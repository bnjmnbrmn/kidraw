export type Command =
  | {kind: "move-cursor-left"}
  | {kind: "move-cursor-right"}
  | {kind: "move-cursor-up"}
  | {kind: "move-cursor-down"}
  | {kind: "create-new-node"}
  | {kind: "select-item"}
  | {kind: "unselect-item"}
  | {kind: "create-connected-node"}
  | {kind: "toggle-selected-item-dragging"}

