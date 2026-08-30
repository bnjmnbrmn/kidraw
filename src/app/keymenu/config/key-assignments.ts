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
  readonly shared: {
    readonly delete: KeyString;
    readonly select: KeyString;
    readonly undo: KeyString;
  };
  readonly search: {
    readonly open: KeyString;
    readonly next: KeyString;
    /** Vim's `N`. A shifted chord, not a bindable key, so it is matched
     *  against `event.key` in the component rather than bound in the
     *  keymenu — hence `string` and not `KeyString` (da-265). */
    readonly prev: string;
  };
  /** Style is a strict three-level shape: `w` (left hand) → a category on
   *  the left hand → the value on the RIGHT hand. Categories sit in a 2x2
   *  block under the middle and ring fingers (e/r over d/f); values run
   *  along the right-hand home row, spilling up to u/i/o when a category has
   *  more than the row holds. */
  readonly style: {
    readonly shapeSubmenu: KeyString;
    readonly colorSubmenu: KeyString;
    readonly lineStyleSubmenu: KeyString;
    readonly overflowSubmenu: KeyString;
  };
  readonly nodeTypes: {
    readonly box: KeyString;
    readonly circle: KeyString;
    readonly diamond: KeyString;
    readonly junction: KeyString;
    readonly invisible: KeyString;
  };
  readonly colors: {
    readonly default: KeyString;
    readonly red: KeyString;
    readonly blue: KeyString;
    readonly green: KeyString;
    readonly orange: KeyString;
    readonly purple: KeyString;
  };
  readonly lineStyles: {
    readonly solid: KeyString;
    readonly dashed: KeyString;
    readonly dotted: KeyString;
  };
  readonly overflow: {
    readonly fit: KeyString;
    readonly widenBoth: KeyString;
    readonly widenH: KeyString;
    readonly widenV: KeyString;
    readonly shrinkFont: KeyString;
    readonly ellipsis: KeyString;
    readonly clip: KeyString;
  };
  readonly select: {
    /** Cycle directedness of the selected edge(s) inside the held select
     *  submenu (directed → undirected → bidirectional). */
    readonly cycleDirection: KeyString;
    readonly togglePin: KeyString;
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
    readonly connectVault: KeyString;
    readonly vaultOpen: KeyString;
    readonly vaultSaveAs: KeyString;
  };
  /** Paste's root key. Copy is the yank key itself and Cut is the delete
   *  key, both bound at root; the submenu that held all three went with
   *  da-473. */
  readonly clipboard: {
    readonly paste: KeyString;
  };
  readonly layout: {
    readonly forceClear: KeyString;
    readonly treeDownClear: KeyString;
    readonly treeRightClear: KeyString;
    readonly radial: KeyString;
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
  shared: {
    delete: 'x',
    select: 'c',
    undo: 'u',
  },
  search: {
    open: '/',
    next: 'n',
    prev: 'N',
  },
  // Left hand picks the category (2x2 block: e/r over d/f), right hand picks
  // the value. See the KeymenuKeyAssignments.style comment.
  // Every category here is reached while `w` (ring finger) is held, so none of
  // them may sit under the middle finger — see notes/design-chord-ergonomics.md.
  // Shape moved off `e` for exactly that reason (da-537).
  style: {shapeSubmenu: 'g', colorSubmenu: 'r', lineStyleSubmenu: 'q', overflowSubmenu: 'f'},
  nodeTypes: {box: 'h', circle: 'j', diamond: 'k', junction: 'l', invisible: ';'},
  colors: {default: 'h', red: 'j', blue: 'k', green: 'l', orange: 'u', purple: 'i'},
  lineStyles: {solid: 'h', dashed: 'j', dotted: 'k'},
  overflow: {fit: 'h', widenBoth: 'j', widenH: 'k', widenV: 'l', shrinkFont: 'u', ellipsis: 'i', clip: 'o'},
  select: {
    cycleDirection: 'o',
    togglePin: 'p',
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
      // `r` is the same finger as the `g` hub it is chorded with — you cannot
      // hold one and press the other (found by the keymap invariant test,
      // 2026-08-30). See notes/design-chord-ergonomics.md.
      adaptiveQuadrantRings: 'u',
    },
    goalAngle: {towardSouth: 'n', towardNorth: 'p'},
  },
  ctrl: {submenu: 'Control'},
  // File lives on the left pinky, so everything under it is a right-hand key.
  misc: {
    submenu: 'q',
    reload: 'u',
    newGraph: 'n',
    connectVault: 'l',
    vaultOpen: 'o',
    vaultSaveAs: 'k',
  },
  // Status submenu is held on right-hand y; every choice is a left-hand key
  // so the chord is hold-right + tap-left. w = In Progress ("WIP").
  clipboard: {paste: 'p'},
  // The Layout hub is `b` (left index), so its children are right-hand keys:
  // see notes/design-chord-ergonomics.md.
  layout: {forceClear: 'k', treeDownClear: 'j', treeRightClear: 'l', radial: 'u'},
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
  shared: {
    delete: 'x',
    select: 'c',
    undo: 'u',
  },
  search: {
    open: '/',
    next: 'n',
    prev: 'N',
  },
  // Left hand picks the category (2x2 block: e/r over d/f), right hand picks
  // the value. See the KeymenuKeyAssignments.style comment.
  // Every category here is reached while `w` (ring finger) is held, so none of
  // them may sit under the middle finger — see notes/design-chord-ergonomics.md.
  // Shape moved off `e` for exactly that reason (da-537).
  style: {shapeSubmenu: 'g', colorSubmenu: 'r', lineStyleSubmenu: 'q', overflowSubmenu: 'f'},
  nodeTypes: {box: 'h', circle: 'j', diamond: 'k', junction: 'l', invisible: ';'},
  colors: {default: 'h', red: 'j', blue: 'k', green: 'l', orange: 'u', purple: 'i'},
  lineStyles: {solid: 'h', dashed: 'j', dotted: 'k'},
  overflow: {fit: 'h', widenBoth: 'j', widenH: 'k', widenV: 'l', shrinkFont: 'u', ellipsis: 'i', clip: 'o'},
  select: {
    cycleDirection: 'o',
    togglePin: 'p',
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
      // `r` is the same finger as the `g` hub it is chorded with — you cannot
      // hold one and press the other (found by the keymap invariant test,
      // 2026-08-30). See notes/design-chord-ergonomics.md.
      adaptiveQuadrantRings: 'u',
    },
    goalAngle: {towardSouth: 'n', towardNorth: 'p'},
  },
  ctrl: {submenu: 'Control'},
  // File lives on the left pinky, so everything under it is a right-hand key.
  misc: {
    submenu: 'q',
    reload: 'u',
    newGraph: 'n',
    connectVault: 'l',
    vaultOpen: 'o',
    vaultSaveAs: 'k',
  },
  clipboard: {paste: 'p'},
  // The Layout hub is `b` (left index), so its children are right-hand keys:
  // see notes/design-chord-ergonomics.md.
  layout: {forceClear: 'k', treeDownClear: 'j', treeRightClear: 'l', radial: 'u'},
};
