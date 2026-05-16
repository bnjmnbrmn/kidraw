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
    readonly styleSubmenu: KeyString;
    readonly layoutSubmenu: KeyString;
  };
  readonly insert: {
    readonly node: KeyString;
    readonly invisibleNode: KeyString;
    readonly edge: KeyString;
    readonly label: KeyString;
  };
  readonly nodeTypes: {
    readonly box: KeyString;
    readonly circle: KeyString;
    readonly diamond: KeyString;
    readonly junction: KeyString;
    readonly invisible: KeyString;
  };
  readonly style: {
    readonly shapeSubmenu: KeyString;
    readonly directednessSubmenu: KeyString;
    readonly lineStyleSubmenu: KeyString;
    readonly colorSubmenu: KeyString;
    readonly defaultsSubmenu: KeyString;
  };
  readonly directedness: {
    readonly directed: KeyString;
    readonly undirected: KeyString;
    readonly bidirectional: KeyString;
  };
  readonly lineStyles: {
    readonly solid: KeyString;
    readonly dashed: KeyString;
    readonly dotted: KeyString;
  };
  readonly colors: {
    readonly default: KeyString;
    readonly red: KeyString;
    readonly blue: KeyString;
    readonly green: KeyString;
    readonly orange: KeyString;
    readonly purple: KeyString;
  };
  readonly shared: {
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
  };
  readonly moveByGraph: {
    readonly submenu: KeyString;
    readonly outgoingNext: KeyString;
    readonly outgoingPrev: KeyString;
    readonly forwards: KeyString;
    readonly backwards: KeyString;
    readonly gather: KeyString;
  };
  readonly ctrl: {
    readonly submenu: KeyString;
  };
  readonly misc: {
    readonly submenu: KeyString;
    readonly reload: KeyString;
    readonly saveGraph: KeyString;
    readonly loadGraph: KeyString;
    readonly newGraph: KeyString;
    readonly openFile: KeyString;
    readonly saveFileAs: KeyString;
  };
  readonly edit: {
    readonly overflowSubmenu: KeyString;
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
    readonly circular: KeyString;
    readonly radial: KeyString;
    readonly chargedSpringEdges: KeyString;
    readonly bezierRouteEdges: KeyString;
    readonly bezierFitChargedSpringEdges: KeyString;
    readonly flexibleWireEdges: KeyString;
    readonly weightedChainEdges: KeyString;
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
    styleSubmenu: 'w',
    layoutSubmenu: 'b',
  },
  insert: {
    node: 'j',
    invisibleNode: 'k',
    edge: 'l',
    label: ';',
  },
  nodeTypes: {
    box: 'u',
    circle: 'i',
    diamond: 'o',
    junction: 'p',
    invisible: 'k',
  },
  style: {
    shapeSubmenu: 's',
    directednessSubmenu: 'd',
    lineStyleSubmenu: 'l',
    colorSubmenu: 'c',
    defaultsSubmenu: 'f',
  },
  directedness: {
    directed: 'd',
    undirected: 'u',
    bidirectional: 'b',
  },
  lineStyles: {
    solid: 's',
    dashed: 'd',
    dotted: 'o',
  },
  colors: {
    default: 'd',
    red: 'r',
    blue: 'b',
    green: 'g',
    orange: 'o',
    purple: 'p',
  },
  shared: {
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
  },
  moveByGraph: {
    submenu: 'g',
    outgoingNext: 'n',
    outgoingPrev: 'p',
    forwards: 'k',
    backwards: 'i',
    gather: 'h',
  },
  ctrl: {submenu: 'Control'},
  misc: {
    submenu: 'm',
    reload: 'r',
    saveGraph: 's',
    loadGraph: 'l',
    newGraph: 'n',
    openFile: 'o',
    saveFileAs: 'a',
  },
  edit: {overflowSubmenu: 'k', togglePin: 'p'},
  overflow: {clip: 'r', shrinkFont: 't', ellipsis: 'y', widenH: 'f', widenV: 'g', widenBoth: 'h'},
  layout: {forceDirected: 'n', treeDown: 'j', treeRight: 'l', grid: 'm', circular: 'o', radial: 'u', chargedSpringEdges: 'p', bezierRouteEdges: ';', bezierFitChargedSpringEdges: "'", flexibleWireEdges: '/', weightedChainEdges: '.'},
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
    styleSubmenu: 'w',
    layoutSubmenu: 'b',
  },
  insert: {
    node: 'd',
    invisibleNode: 'w',
    edge: 's',
    label: 'e',
  },
  nodeTypes: {
    box: 'j',
    circle: 'k',
    diamond: 'l',
    junction: ';',
    invisible: 'w',
  },
  style: {
    shapeSubmenu: 's',
    directednessSubmenu: 'd',
    lineStyleSubmenu: 'l',
    colorSubmenu: 'c',
    defaultsSubmenu: 'f',
  },
  directedness: {
    directed: 'd',
    undirected: 'u',
    bidirectional: 'b',
  },
  lineStyles: {
    solid: 's',
    dashed: 'd',
    dotted: 'o',
  },
  colors: {
    default: 'd',
    red: 'r',
    blue: 'b',
    green: 'g',
    orange: 'o',
    purple: 'p',
  },
  shared: {
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
  },
  moveByGraph: {
    submenu: 'g',
    outgoingNext: 'n',
    outgoingPrev: 'p',
    forwards: 'j',
    backwards: 'k',
    gather: 'h',
  },
  ctrl: {submenu: 'Control'},
  misc: {
    submenu: 'm',
    reload: 'r',
    saveGraph: 's',
    loadGraph: 'l',
    newGraph: 'n',
    openFile: 'o',
    saveFileAs: 'a',
  },
  edit: {overflowSubmenu: 'u', togglePin: 'p'},
  overflow: {clip: 'a', shrinkFont: 's', ellipsis: 'd', widenH: 'f', widenV: 'w', widenBoth: 'e'},
  layout: {forceDirected: 'n', treeDown: 'j', treeRight: 'l', grid: 'm', circular: 'o', radial: 'u', chargedSpringEdges: 'p', bezierRouteEdges: ';', bezierFitChargedSpringEdges: "'", flexibleWireEdges: '/', weightedChainEdges: '.'},
};
