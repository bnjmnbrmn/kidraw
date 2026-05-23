---
title: Held-key modes + waypoints vs labels
type: decision
---

# Held-key modes + waypoints vs labels

The core interaction model, finalized and shipped.

## Held-key modes

Several base-level keys in the normal mode act as *held* triggers: while the key is held, a submenu (or movement mode) is active; releasing the key exits the mode. The opposite hand stays free to drive movement and zoom throughout.

The four base-level held keys are:

- **Add+Drag** (`f` in both profiles) — opens a submenu to add a node / waypoint / edge / label. The new item is auto-selected and draggable while the key is held. Releasing exits.
- **Select+Drag** (`v`) — selects the item under the crosshairs and drags it while held. Releasing exits. A second tap of `v` while the same item is selected toggles it off, via `toggleTopItemSelection`.
- **Move** (the movement keys themselves) — every press moves the crosshairs; auto-repeats while held.
- **Delete** (`x`) — deletes the selected item or the item under the crosshairs.

While any held key is active, the opposite hand drives movement and zoom. Handedness is togglable from the header.

## Waypoints vs labels

Two distinct concepts on an edge:

- **Waypoint** — a geometry-only bend point. No text. Changes the edge's polyline shape. Implemented as `DAWaypoint`; mirrors one entry in the parent edge's `_controlPoints`. See AGENTS.md → Drawing area for the runtime model.
- **Label** — a text annotation positioned along an edge. Has text and a visible box. Implemented as `DALabel`.

They share an edge as their parent but have separate insert keys and separate selection/delete handling.

## Open questions

- How to visualize greyed-out submenu options when an action isn't applicable (e.g. "edge" requires two selected nodes). [idea-greyed-submenu-options](idea-greyed-submenu-options.md).
- Should multi-select persist across Select+Drag holds? Probably not initially — kept single-select for now.
- Edge label positioning algorithm (currently simple; can be richer).
