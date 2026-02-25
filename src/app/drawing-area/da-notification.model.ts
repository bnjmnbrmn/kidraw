export type DANotification =
  | {kind: "started-label-editing-mode"}
  | {kind: "started-select-mode" }
  | {kind: "open-insert-submenu"}
