/**
 * Recovery copy of the live working graph mirrored from the remote KiDraw
 * session on 2026-08-11 at 11:36:07 UTC. Keep the original IDs and geometry:
 * browser repros and development notes refer to the Next edges by ID.
 */
export const NEXT_WORKING_SAMPLE_YAML = `
kidraw: 1
type: todo-graph
styles:
  - name: default
    nodes:
      da-4:
        x: -559.2051996078812
        'y': -595.3819826573482
        shape: circle
      da-23:
        x: -112.68762148288124
        'y': -135.3819826573482
        shape: circle
      da-24:
        x: 909.3848882827438
        'y': -595.3819826573482
        shape: circle
      da-29:
        x: 535.1634527358688
        'y': -287.3819826573482
        shape: circle
      da-34:
        x: 83.71032773586876
        'y': -287.3819826573482
        shape: circle
      da-35:
        x: 198.79480039211876
        'y': -135.3819826573482
      da-37:
        x: 448.29089414211876
        'y': -135.3819826573482
      da-41:
        x: 1398.5379644546188
        'y': -287.3819826573482
      da-42:
        x: 1476.4554449233688
        'y': -439.3819826573482
        shape: circle
      da-48:
        x: 3241.2625738296188
        'y': -439.3819826573482
        w: 320
        h: 310
        shape: circle
      da-51:
        x: -183.20519960788124
        'y': 16.618017342651797
      da-99:
        x: 254.39050351711876
        'y': -439.3819826573482
        shape: circle
      da-123:
        x: 1082.1317144546188
        'y': -439.3819826573482
        shape: circle
      da-126:
        x: 1980.5379644546188
        'y': -595.3819826573482
      da-127:
        x: 2544.2625738296188
        'y': -599.3819826573482
      da-159:
        x: 830.2908941421188
        'y': -439.3819826573482
      da-198:
        x: 3126.2625738296188
        'y': -595.3819826573482
      da-199:
        x: 3718.5316167983688
        'y': -595.3819826573482
        shape: circle
    edges:
      da-124:
        waypoints:
          - x: 1081.1658454904348
            'y': -415.9330468224084
            id: da-203
semantics:
  nodes:
    da-4:
      label: Bugs
    da-23:
      label: Todo Plugin/Graphs
    da-24:
      label: Features
    da-29:
      label: Diagram types
    da-34:
      label: Plugins
    da-35:
      label: Active plugin visibility
    da-37:
      label: Active file type visiblilty( some sort of indicator in UI)
    da-41:
      label: Save state visibilty (some sort of indicator in UI)
    da-42:
      label: File Management
    da-48:
      label: Next
    da-51:
      label: When using the todo plugin, instead of "circle and box, etc.have category and task
    da-99:
      label: Plugin/Diagram Type system
    da-123:
      label: Ex Mode (Command-line mode)
    da-126:
      label: Side Pane Keymenu ("Compact" menu)
    da-127:
      label: Mostly hidden Keymenu (keymenu display with only a single line of text at the bottom of the screen)
    da-159:
      label: Compact menu mode
    da-198:
      label: Remove snap-to item behavior during normal navigation
    da-199:
      label: Next Next
  edges:
    da-36:
      from: da-34
      to: da-35
    da-38:
      from: da-29
      to: da-37
    da-46:
      from: da-42
      to: da-41
    da-101:
      from: da-23
      to: da-51
    da-104:
      from: da-24
      to: da-42
    da-105:
      from: da-24
      to: da-99
    da-108:
      from: da-99
      to: da-34
    da-109:
      from: da-99
      to: da-29
    da-110:
      from: da-34
      to: da-23
    da-124:
      from: da-24
      to: da-123
    da-160:
      from: da-24
      to: da-159
    da-201:
      from: da-198
      to: da-48
`;
