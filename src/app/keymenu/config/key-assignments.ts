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
    readonly nodeTypeSubmenu: KeyString;
  };
  readonly insert: {
    readonly node: KeyString;
    readonly waypoint: KeyString;
    readonly edge: KeyString;
    readonly label: KeyString;
  };
  readonly nodeTypes: {
    readonly box: KeyString;
    readonly circle: KeyString;
    readonly diamond: KeyString;
    readonly junction: KeyString;
  };
  readonly shared: {
    readonly toggleWaypointVisibility: KeyString;
    readonly delete: KeyString;
    readonly select: KeyString;
    readonly undo: KeyString;
  };
  readonly speed: {
    readonly submenu: KeyString;
    readonly medium: KeyString;
    readonly large: KeyString;
  };
  readonly pan: {
    readonly submenu: KeyString;
    readonly medium: KeyString;
    readonly large: KeyString;
  };
  readonly moveByNode: {
    readonly submenu: KeyString;
    readonly nodeJump: DirectionalKeyAssignments;
    readonly zoomIn: KeyString;
    readonly zoomOut: KeyString;
    readonly recenterView: KeyString;
    readonly recenterCrosshairs: KeyString;
    readonly toggleWaypoints: KeyString;
    readonly reload: KeyString;
  };
  readonly moveByGraph: {
    readonly submenu: KeyString;
    readonly outgoingNext: KeyString;
    readonly outgoingPrev: KeyString;
  };
  readonly edit: {
    readonly overflowSubmenu: KeyString;
  };
  readonly overflow: {
    readonly clip: KeyString;
    readonly shrinkFont: KeyString;
    readonly ellipsis: KeyString;
    readonly widenH: KeyString;
    readonly widenV: KeyString;
    readonly widenBoth: KeyString;
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
    nodeTypeSubmenu: 'w',
  },
  insert: {
    node: 'j',
    waypoint: 'k',
    edge: 'l',
    label: ';',
  },
  nodeTypes: {
    box: 'u',
    circle: 'i',
    diamond: 'o',
    junction: 'p',
  },
  shared: {
    toggleWaypointVisibility: 'w',
    delete: 'x',
    select: 'c',
    undo: 'u',
  },
  speed: {
    submenu: 'd',
    medium: 's',
    large: 'a',
  },
  pan: {
    submenu: 'r',
    medium: 'e',
    large: 'w',
  },
  moveByNode: {
    submenu: 't',
    nodeJump: {up: 'i', left: 'j', down: 'k', right: 'l'},
    zoomIn: 'o',
    zoomOut: 'i',
    recenterView: 'a',
    recenterCrosshairs: 's',
    toggleWaypoints: 'd',
    reload: 'q',
  },
  moveByGraph: {
    submenu: 'g',
    outgoingNext: 'n',
    outgoingPrev: 'p',
  },
  edit: {overflowSubmenu: 'k'},
  overflow: {clip: 'r', shrinkFont: 't', ellipsis: 'y', widenH: 'f', widenV: 'g', widenBoth: 'h'},
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
    nodeTypeSubmenu: 'w',
  },
  insert: {
    node: 'd',     // left-hand keys while left index holds f
    waypoint: 'w',  // avoid g — same finger as f
    edge: 's',
    label: 'e',
  },
  nodeTypes: {
    box: 'j',
    circle: 'k',
    diamond: 'l',
    junction: ';',
  },
  shared: {
    toggleWaypointVisibility: 'w',
    delete: 'x',
    select: 'c',
    undo: 'u',
  },
  speed: {
    submenu: 'e',
    medium: 'w',
    large: 'q',
  },
  pan: {
    submenu: 'r',
    medium: 'w',
    large: 'q',
  },
  moveByNode: {
    submenu: 't',
    nodeJump: {up: 'k', left: 'h', down: 'j', right: 'l'},
    zoomIn: 'i',
    zoomOut: 'o',
    recenterView: 'a',
    recenterCrosshairs: 's',
    toggleWaypoints: 'd',
    reload: 'q',
  },
  moveByGraph: {
    submenu: 'g',
    outgoingNext: 'n',
    outgoingPrev: 'p',
  },
  edit: {overflowSubmenu: 'u'},
  overflow: {clip: 'a', shrinkFont: 's', ellipsis: 'd', widenH: 'f', widenV: 'w', widenBoth: 'e'},
};
