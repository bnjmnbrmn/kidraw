/**
 * Recovery copy of the live working graph mirrored from the remote KiDraw
 * session on 2026-08-09 at 19:46:46 UTC. Keep the original IDs and geometry:
 * browser repros and development notes refer to the Next edges by ID.
 */
export const NEXT_WORKING_SAMPLE_YAML = `
kidraw: 1
type: todo-graph
styles:
  - name: default
    nodes:
      da-4:
        x: -568.1189555021515
        'y': -688.1340878187448
        shape: circle
      da-23:
        x: -121.6013773771515
        'y': -214.13408781874477
        shape: circle
      da-24:
        x: 774.5507222322235
        'y': -688.1340878187448
        shape: circle
      da-29:
        x: 526.2496968415985
        'y': -366.1340878187448
        shape: circle
      da-34:
        x: 74.7965718415985
        'y': -366.1340878187448
        shape: circle
      da-35:
        x: 189.8810444978485
        'y': -214.13408781874477
      da-37:
        x: 439.3771382478485
        'y': -214.13408781874477
      da-41:
        x: 1137.7833882478485
        'y': -366.1340878187448
      da-42:
        x: 1215.7008687165985
        'y': -518.1340878187448
        shape: circle
      da-48:
        x: 2940.2169819978485
        'y': -518.1340878187448
        w: 320
        h: 310
        shape: circle
      da-51:
        x: -192.1189555021515
        'y': -62.134087818744774
      da-99:
        x: 245.4767476228485
        'y': -518.1340878187448
        shape: circle
      da-123:
        x: 821.3771382478485
        'y': -518.1340878187448
        shape: circle
      da-126:
        x: 1719.7833882478485
        'y': -688.1340878187448
      da-127:
        x: 2243.2169819978485
        'y': -692.1340878187448
      da-151:
        x: 2825.2169819978485
        'y': -706.1340878187448
      da-157:
        x: 3407.2169819978485
        'y': -692.1340878187448
      da-159:
        x: 1396.4854576986756
        'y': -593.1340878187448
    edges:
      da-160:
        waypoints:
          - x: 904.3700887582092
            'y': -684.9226317160906
            id: da-161
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
    da-151:
      label: Make the configured fine/normal/coarse movement sizes be editable in terms of grid squares rather than numbers of pixels (so the logical movement sizes will vary based on zoom)
    da-157:
      label: Edge labels should not be draggable so far that they disappear behind one of the end nodes
    da-159:
      label: Compact menu mode
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
    da-152:
      from: da-151
      to: da-48
    da-158:
      from: da-157
      to: da-48
    da-160:
      from: da-24
      to: da-159
`;
