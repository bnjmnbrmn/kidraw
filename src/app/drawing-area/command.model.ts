export type Command =
  | {kind: "move-cursor-left"}
  | {kind: "move-cursor-right"}
  | {kind: "move-cursor-up"}
  | {kind: "move-cursor-down"}
  | {kind: "create-new-node"}
  | {kind: "insert-char", value: string}
  | {kind: "exit-label-edit-mode"}
  | {kind: "select-item"}
  | {kind: "unselect-item"}
  | {kind: "create-connected-node"}

