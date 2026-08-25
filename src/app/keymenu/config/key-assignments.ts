import {KeyString} from '../../lib/keymenu/layouts/us-qwerty';

export interface DirectionalKeyAssignments {
  readonly up: KeyString;
  readonly left: KeyString;
  readonly down: KeyString;
  readonly right: KeyString;
}

export interface SpeedModifierKeys {
  readonly bigger: KeyString;
  readonly smaller: KeyString;
}

export interface KeymenuKeyAssignments {
  readonly movement: DirectionalKeyAssignments;
  readonly drag: DirectionalKeyAssignments;
  readonly root: {
    /** Held: the unified insert/connect hub (tap: context edit-or-insert). */
    readonly editSubmenu: KeyString;
    readonly selectDragSubmenu: KeyString;
    readonly styleSubmenu: KeyString;
    readonly layoutSubmenu: KeyString;
    readonly toggleVisibility: KeyString;
    /** Tap: smart traverse — auto-advance or the nav popup. */
    readonly go: KeyString;
    /** Tap: edit the text of whatever is under the crosshairs. */
    readonly editText: KeyString;
    /** Held: task-status submenu (todo graphs) — right-hand hold, the
     *  status choice keys all sit in the left hand. */
    readonly statusSubmenu: KeyString;
    readonly clipboardSubmenu: KeyString;
  };
  /** Children of the held add hub. The hub key is left-hand in both
   *  profiles, so the kind keys sit in the left hand next to it and the
   *  right hand stays free for movement. (Connecting to another node is the
   *  grow mode's job now — see notes/design-add-insert-model.md.) */
  readonly insert: {
    readonly box: KeyString;
    readonly circle: KeyString;
    readonly diamond: KeyString;
    readonly junction: KeyString;
    readonly invisible: KeyString;
    readonly edge: KeyString;
    readonly label: KeyString;
    readonly waypoint: KeyString;
  };
  /** Children of the Edge submenu under Add. */
  readonly edgeKinds: {
    readonly selfLoop: KeyString;
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
    readonly overflowSubmenu: KeyString;
    readonly togglePin: KeyString;
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
  readonly search: {
    readonly open: KeyString;
    readonly next: KeyString;
    readonly prev: KeyString;
  };
  readonly select: {
    readonly editItem: KeyString;
    /** Cycle directedness of the selected edge(s) inside the held select
     *  submenu (directed → undirected → bidirectional). */
    readonly cycleDirection: KeyString;
    /** Zoom keys inside the held select submenu (kept off the
     *  cycleDirection key). */
    readonly zoomIn: KeyString;
    readonly zoomOut: KeyString;
  };
  readonly moveSpeed: SpeedModifierKeys;
  readonly panZoom: {
    readonly submenu: KeyString;
    readonly speed: SpeedModifierKeys;
    readonly zoomIn: KeyString;
    readonly zoomOut: KeyString;
    readonly recenterView: KeyString;
    readonly recenterCrosshairs: KeyString;
    /** Vim-zz: pan so the point under the crosshairs is screen-centered. */
    readonly centerOnCrosshairs: KeyString;
  };
  readonly dragSpeed: SpeedModifierKeys;
  readonly moveByNode: {
    readonly submenu: KeyString;
    readonly nodeJump: DirectionalKeyAssignments;
    readonly strategy: {
      /** Editor-style sparse rows/columns with preferred-axis memory. */
      readonly adaptiveBandGrid: KeyString;
      /** Adaptive rows/columns divided into diagonal N/S/E/W regions. */
      readonly adaptiveQuadrantGrid: KeyString;
      /** Independently spaced, one-item radial bands in each N/S/E/W region. */
      readonly adaptiveQuadrantRings: KeyString;
    };
    readonly goalAngle: {
      readonly towardSouth: KeyString;
      readonly towardNorth: KeyString;
    };
  };
  readonly ctrl: {
    readonly submenu: KeyString;
  };
  readonly misc: {
    readonly submenu: KeyString;
    readonly reload: KeyString;
    readonly newGraph: KeyString;
    readonly openFile: KeyString;
    readonly saveFileAs: KeyString;
    readonly exportZip: KeyString;
    readonly cycleDisplay: KeyString;
    readonly connectVault: KeyString;
    readonly vaultOpen: KeyString;
    readonly vaultSaveAs: KeyString;
    readonly toggleKeyProfile: KeyString;
    readonly todoGraphType: KeyString;
  };
  readonly status: {
    readonly draft: KeyString;
    readonly todo: KeyString;
    readonly inProgress: KeyString;
    readonly blocked: KeyString;
    readonly done: KeyString;
    readonly clear: KeyString;
  };
  readonly clipboard: {
    readonly copy: KeyString;
    readonly cut: KeyString;
    readonly paste: KeyString;
  };
  readonly overflow: {
    readonly clip: KeyString;
    readonly shrinkFont: KeyString;
    readonly ellipsis: KeyString;
    readonly widenH: KeyString;
    readonly widenV: KeyString;
    readonly widenBoth: KeyString;
    readonly fit: KeyString;
  };
  readonly layout: {
    readonly forceDirected: KeyString;
    readonly forceClear: KeyString;
    readonly treeDown: KeyString;
    readonly treeDownClear: KeyString;
    readonly treeRight: KeyString;
    readonly treeRightClear: KeyString;
    readonly circular: KeyString;
    readonly radial: KeyString;
    readonly routeBezierFitWeightedChain: KeyString;
    readonly routeDesiderata: KeyString;
    readonly routeIncremental: KeyString;
    readonly routeIncrementalV3: KeyString;
    readonly gather: KeyString;
    readonly ungather: KeyString;
  };
}

// IJKL profile: movement on i/j/k/l (right hand, index-finger-centered),
// insert submenu on `a` (left hand). The original key layout, kept as a
// secondary profile after Vim became the default.
export const IJKL_KEYMENU_KEY_ASSIGNMENTS: KeymenuKeyAssignments = {
  movement: {up: 'i', left: 'j', down: 'k', right: 'l'},
  drag: {up: 'i', left: 'j', down: 'k', right: 'l'},
  root: {
    editSubmenu: 'e',
    selectDragSubmenu: 'v',
    styleSubmenu: 'w',
    layoutSubmenu: 'b',
    toggleVisibility: 'z',
    go: 'f',
    editText: ';',
    statusSubmenu: 't',
    clipboardSubmenu: 'y',
  },
  // diamond avoids the held hub key ('e' here); vim uses 'e'.
  insert: {
    box: 'd',
    circle: 'c',
    diamond: 'v',
    junction: 'g',
    invisible: 'x',
    edge: 's',
    label: 'f',
    waypoint: 'w',
  },
  edgeKinds: {
    selfLoop: 'l',
  },
  nodeTypes: {
    box: 'b',
    circle: 'i',
    diamond: 'o',
    junction: 'p',
    invisible: 'k',
  },
  style: {
    shapeSubmenu: 'n',
    directednessSubmenu: 'k',
    lineStyleSubmenu: 'l',
    colorSubmenu: 'h',
    defaultsSubmenu: 'y',
    overflowSubmenu: 'u',
    togglePin: 'p',
  },
  directedness: {
    directed: 'r',
    undirected: '-',
    bidirectional: 'b',
  },
  lineStyles: {
    solid: 'f',
    dashed: 'r',
    dotted: 'g',
  },
  colors: {
    default: 'f',
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
  search: {
    open: '/',
    next: 'n',
    prev: 'p',
  },
  select: {
    editItem: ';',
    cycleDirection: 'o',
    zoomIn: 'y',
    zoomOut: 'u',
  },
  moveSpeed: {
    bigger: 'd',
    smaller: 's',
  },
  panZoom: {
    submenu: 'r',
    speed: { bigger: 'e', smaller: 'a' },
    zoomIn: 'o',
    zoomOut: 'u',
    recenterView: 'h',
    recenterCrosshairs: 'q',
    centerOnCrosshairs: 'c',
  },
  dragSpeed: {
    bigger: 'c',
    smaller: 'z',
  },
  moveByNode: {
    submenu: 'g',
    nodeJump: {up: 'i', left: 'j', down: 'k', right: 'l'},
    strategy: {
      adaptiveBandGrid: 'e',
      adaptiveQuadrantGrid: 'o',
      adaptiveQuadrantRings: 'r',
    },
    goalAngle: {towardSouth: 'n', towardNorth: 'p'},
  },
  ctrl: {submenu: 'Control'},
  misc: {
    submenu: 'm',
    reload: 'r',
    newGraph: 'n',
    openFile: 'i',
    saveFileAs: 'e',
    exportZip: 'z',
    cycleDisplay: 'd',
    connectVault: 'v',
    vaultOpen: 'o',
    vaultSaveAs: 's',
    toggleKeyProfile: 'p',
    todoGraphType: 't',
  },
  // Status submenu is held on right-hand y; every choice is a left-hand key
  // so the chord is hold-right + tap-left. w = In Progress ("WIP").
  status: {draft: 'r', todo: 't', inProgress: 'w', blocked: 'b', done: 'd', clear: 'c'},
  clipboard: {copy: 'c', cut: 'x', paste: 'p'},
  overflow: {clip: 'r', shrinkFont: 't', ellipsis: 'y', widenH: 'f', widenV: 'g', widenBoth: 'h', fit: 'v'},
  layout: {forceDirected: 'n', forceClear: 'f', treeDown: 'j', treeDownClear: 'h', treeRight: 'l', treeRightClear: 'k', circular: 'o', radial: 'u', routeBezierFitWeightedChain: 'p', routeDesiderata: 'd', routeIncremental: 'i', routeIncrementalV3: 'v', gather: 'g', ungather: 'w'},
};

// Vim profile (the default): hjkl movement, a for insert ("add"), i for edit,
// f for move-by-graph traversal (best left-index hold + f/s/d tier chords).
export const VIM_KEYMENU_KEY_ASSIGNMENTS: KeymenuKeyAssignments = {
  movement: {up: 'k', left: 'h', down: 'j', right: 'l'},
  drag: {up: 'k', left: 'h', down: 'j', right: 'l'},
  root: {
    editSubmenu: 'a',
    selectDragSubmenu: 'v',
    styleSubmenu: 'w',
    layoutSubmenu: 'b',
    toggleVisibility: 'z',
    go: 'f',
    editText: 'i',
    statusSubmenu: 't',
    clipboardSubmenu: 'y',
  },
  insert: {
    box: 'd',
    circle: 'c',
    diamond: 'e',
    junction: 'g',
    invisible: 'x',
    edge: 's',
    label: 'f',
    waypoint: 'w',
  },
  edgeKinds: {
    selfLoop: 'l',
  },
  nodeTypes: {
    box: 'b',
    circle: 'k',
    diamond: 'l',
    junction: ';',
    invisible: 'i',
  },
  style: {
    shapeSubmenu: 'n',
    directednessSubmenu: 'k',
    lineStyleSubmenu: 'l',
    colorSubmenu: 'h',
    defaultsSubmenu: 'y',
    overflowSubmenu: 'u',
    togglePin: 'p',
  },
  directedness: {
    directed: 'r',
    undirected: '-',
    bidirectional: 'b',
  },
  lineStyles: {
    solid: 'f',
    dashed: 'r',
    dotted: 'g',
  },
  colors: {
    default: 'f',
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
  search: {
    open: '/',
    next: 'n',
    prev: 'p',
  },
  select: {
    editItem: ';',
    cycleDirection: 'o',
    zoomIn: 'i',
    zoomOut: 'u',
  },
  moveSpeed: {
    bigger: 's',
    smaller: 'd',
  },
  panZoom: {
    submenu: 'r',
    speed: { bigger: 'w', smaller: 'e' },
    zoomIn: 'i',
    zoomOut: 'o',
    recenterView: 'p',
    recenterCrosshairs: 'y',
    centerOnCrosshairs: 'u',
  },
  dragSpeed: {
    bigger: 'x',
    smaller: 'c',
  },
  moveByNode: {
    submenu: 'g',
    nodeJump: {up: 'k', left: 'h', down: 'j', right: 'l'},
    strategy: {
      adaptiveBandGrid: 'e',
      adaptiveQuadrantGrid: 'o',
      adaptiveQuadrantRings: 'r',
    },
    goalAngle: {towardSouth: 'n', towardNorth: 'p'},
  },
  ctrl: {submenu: 'Control'},
  misc: {
    submenu: 'm',
    reload: 'r',
    newGraph: 'n',
    openFile: 'i',
    saveFileAs: 'e',
    exportZip: 'z',
    cycleDisplay: 'd',
    connectVault: 'v',
    vaultOpen: 'o',
    vaultSaveAs: 's',
    toggleKeyProfile: 'p',
    todoGraphType: 't',
  },
  status: {draft: 'r', todo: 't', inProgress: 'w', blocked: 'b', done: 'd', clear: 'c'},
  clipboard: {copy: 'c', cut: 'x', paste: 'p'},
  overflow: {clip: 'a', shrinkFont: 's', ellipsis: 'd', widenH: 'f', widenV: 'w', widenBoth: 'e', fit: 'v'},
  layout: {forceDirected: 'n', forceClear: 'f', treeDown: 'j', treeDownClear: 'h', treeRight: 'l', treeRightClear: 'k', circular: 'o', radial: 'u', routeBezierFitWeightedChain: 'p', routeDesiderata: 'd', routeIncremental: 'i', routeIncrementalV3: 'v', gather: 'g', ungather: 'w'},
};
