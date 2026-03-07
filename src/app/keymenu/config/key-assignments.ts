import {KeyString} from '../../lib/keymenu/layouts/us-qwerty';

export interface DirectionalKeyAssignments {
  readonly up: KeyString;
  readonly left: KeyString;
  readonly down: KeyString;
  readonly right: KeyString;
}

export interface ZoomKeyAssignments {
  readonly out: KeyString;
  readonly in: KeyString;
}

export interface KeymenuKeyAssignments {
  readonly movement: DirectionalKeyAssignments;
  readonly drag: DirectionalKeyAssignments;
  readonly zoom: ZoomKeyAssignments;
  readonly root: {
    readonly editSubmenu: KeyString;
    readonly insertSubmenu: KeyString;
    readonly selectDragSubmenu: KeyString;
  };
  readonly insert: {
    readonly node: KeyString;
    readonly waypoint: KeyString;
    readonly edge: KeyString;
    readonly label: KeyString;
  };
  readonly shared: {
    readonly toggleWaypointVisibility: KeyString;
    readonly delete: KeyString;
    readonly navSubmenu: KeyString;
    readonly select: KeyString;
    readonly undo: KeyString;
  };
  readonly nav: {
    readonly nodeJump: DirectionalKeyAssignments;
    readonly zoomIn: KeyString;
    readonly zoomOut: KeyString;
    readonly outgoingNext: KeyString;
    readonly outgoingPrev: KeyString;
    readonly recenterView: KeyString;
    readonly recenterCrosshairs: KeyString;
    readonly toggleWaypoints: KeyString;
    readonly reload: KeyString;
  };
}

// Original right-hand-dominant layout: movement on right hand (jilk), insert on left (f).
export const DEFAULT_KEYMENU_KEY_ASSIGNMENTS: KeymenuKeyAssignments = {
  movement: {up: 'i', left: 'j', down: 'k', right: 'l'},
  drag: {up: 'i', left: 'j', down: 'k', right: 'l'},
  zoom: {out: 'p', in: 'y'},
  root: {
    editSubmenu: 'e',
    insertSubmenu: 'f',
    selectDragSubmenu: 'v',
  },
  insert: {
    node: 'j',
    waypoint: 'k',
    edge: 'l',
    label: ';',
  },
  shared: {
    toggleWaypointVisibility: 'w',
    delete: 'x',
    navSubmenu: 'r',
    select: 'c',
    undo: 'u',
  },
  nav: {
    nodeJump: {up: 'i', left: 'j', down: 'k', right: 'l'},
    zoomIn: 'o',
    zoomOut: 'i',
    outgoingNext: 'n',
    outgoingPrev: 'p',
    recenterView: 'a',
    recenterCrosshairs: 's',
    toggleWaypoints: 'd',
    reload: 'r',
  },
};

// Vim-inspired layout: hjkl movement, f for insert submenu, i for edit.
export const VIM_KEYMENU_KEY_ASSIGNMENTS: KeymenuKeyAssignments = {
  movement: {up: 'k', left: 'h', down: 'j', right: 'l'},
  drag: {up: 'k', left: 'h', down: 'j', right: 'l'},
  zoom: {out: 'p', in: 'y'},
  root: {
    editSubmenu: 'i',
    insertSubmenu: 'f',
    selectDragSubmenu: 'v',
  },
  insert: {
    node: 'd',     // left-hand keys while left index holds f
    waypoint: 'w',  // avoid g — same finger as f
    edge: 's',
    label: 'e',
  },
  shared: {
    toggleWaypointVisibility: 'w',
    delete: 'x',
    navSubmenu: 'r',
    select: 'c',
    undo: 'u',
  },
  nav: {
    nodeJump: {up: 'k', left: 'h', down: 'j', right: 'l'},
    zoomIn: 'i',
    zoomOut: 'o',
    outgoingNext: 'n',   // clockwise outgoing edge
    outgoingPrev: 'p',   // anticlockwise outgoing edge
    // Shift+n / Shift+p for incoming edges (handled in keydown intercept)
    recenterView: 'a',       // left ring — comfortable with pinky on z
    recenterCrosshairs: 's',  // left middle
    toggleWaypoints: 'd',    // left index
    reload: 'r',             // left index reach up
  },
};
