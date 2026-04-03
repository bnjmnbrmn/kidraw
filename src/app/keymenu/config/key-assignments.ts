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

export interface SpeedModifierKeys {
  readonly bigger: KeyString;
  readonly biggest: KeyString;
  readonly smaller: KeyString;
  readonly smallest: KeyString;
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
  readonly moveSpeed: SpeedModifierKeys;
  readonly panZoom: {
    readonly submenu: KeyString;
    readonly speed: SpeedModifierKeys;
    readonly zoomIn: KeyString;
    readonly zoomOut: KeyString;
    readonly recenterView: KeyString;
    readonly recenterCrosshairs: KeyString;
  };
  readonly dragSpeed: SpeedModifierKeys;
  readonly moveByNode: {
    readonly submenu: KeyString;
    readonly nodeJump: DirectionalKeyAssignments;
    readonly toggleWaypoints: KeyString;
  };
  readonly moveByGraph: {
    readonly submenu: KeyString;
    readonly outgoingNext: KeyString;
    readonly outgoingPrev: KeyString;
    readonly forwards: KeyString;
    readonly backwards: KeyString;
  };
  readonly ctrl: {
    readonly submenu: KeyString;
  };
  readonly misc: {
    readonly submenu: KeyString;
    readonly reload: KeyString;
  };
  readonly edit: {
    readonly overflowSubmenu: KeyString;
    readonly layoutSubmenu: KeyString;
    readonly togglePin: KeyString;
  };
  readonly overflow: {
    readonly clip: KeyString;
    readonly shrinkFont: KeyString;
    readonly ellipsis: KeyString;
    readonly widenH: KeyString;
    readonly widenV: KeyString;
    readonly widenBoth: KeyString;
  };
  readonly layout: {
    readonly forceDirected: KeyString;
    readonly treeDown: KeyString;
    readonly treeRight: KeyString;
    readonly grid: KeyString;
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
  moveSpeed: {
    bigger: 'd',
    biggest: 's',
    smaller: 'a',
    smallest: 'q',
  },
  panZoom: {
    submenu: 'r',
    speed: { bigger: 'e', biggest: 'w', smaller: 'a', smallest: 'q' },
    zoomIn: 'o',
    zoomOut: 'i',
    recenterView: 'a',
    recenterCrosshairs: 's',
  },
  dragSpeed: {
    bigger: 'c',
    biggest: 'x',
    smaller: 'z',
    smallest: 'a',
  },
  moveByNode: {
    submenu: 't',
    nodeJump: {up: 'i', left: 'j', down: 'k', right: 'l'},
    toggleWaypoints: 'd',
  },
  moveByGraph: {
    submenu: 'g',
    outgoingNext: 'n',
    outgoingPrev: 'p',
    forwards: 'k',
    backwards: 'i',
  },
  ctrl: {submenu: 'Control'},
  misc: {
    submenu: 'm',
    reload: 'r',
  },
  edit: {overflowSubmenu: 'k', layoutSubmenu: 'l', togglePin: 'p'},
  overflow: {clip: 'r', shrinkFont: 't', ellipsis: 'y', widenH: 'f', widenV: 'g', widenBoth: 'h'},
  layout: {forceDirected: 'f', treeDown: 'd', treeRight: 'r', grid: 'g'},
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
    node: 'd',
    waypoint: 'w',
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
  moveSpeed: {
    bigger: 's',
    biggest: 'a',
    smaller: 'd',
    smallest: 's',
  },
  panZoom: {
    submenu: 'r',
    speed: { bigger: 'w', biggest: 'q', smaller: 'e', smallest: 'w' },
    zoomIn: 'i',
    zoomOut: 'o',
    recenterView: 'y',
    recenterCrosshairs: 'u',
  },
  dragSpeed: {
    bigger: 'x',
    biggest: 'z',
    smaller: 'c',
    smallest: 'x',
  },
  moveByNode: {
    submenu: 't',
    nodeJump: {up: 'k', left: 'h', down: 'j', right: 'l'},
    toggleWaypoints: 'd',
  },
  moveByGraph: {
    submenu: 'g',
    outgoingNext: 'n',
    outgoingPrev: 'p',
    forwards: 'j',
    backwards: 'k',
  },
  ctrl: {submenu: 'Control'},
  misc: {
    submenu: 'm',
    reload: 'r',
  },
  edit: {overflowSubmenu: 'u', layoutSubmenu: 'l', togglePin: 'p'},
  overflow: {clip: 'a', shrinkFont: 's', ellipsis: 'd', widenH: 'f', widenV: 'w', widenBoth: 'e'},
  layout: {forceDirected: 'f', treeDown: 'd', treeRight: 'r', grid: 'g'},
};
