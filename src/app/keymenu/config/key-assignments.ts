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
    readonly connect: KeyString;
    readonly toggleWaypointVisibility: KeyString;
    readonly delete: KeyString;
    readonly recenterSubmenu: KeyString;
    readonly select: KeyString;
  };
  readonly recenter: {
    readonly view: KeyString;
    readonly crosshairs: KeyString;
  };
}

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
    connect: 'd',
    toggleWaypointVisibility: 'w',
    delete: 'x',
    recenterSubmenu: 'z',
    select: 'c',
  },
  recenter: {
    view: 'i',
    crosshairs: 'k',
  },
};
