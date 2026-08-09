/**
 * Recovery copy of the live working graph mirrored from the remote KiDraw
 * session on 2026-08-09 at 17:58:37 UTC. Keep the original IDs and geometry:
 * browser repros and development notes refer to the Next edges by ID.
 */
export const NEXT_WORKING_SAMPLE_YAML = `
kidraw: 1
type: todo-graph
styles:
  - name: default
    nodes:
      da-4:
        x: 2119.4680906414187
        'y': -686.727599126647
        shape: circle
      da-23:
        x: 307.3216062664187
        'y': -222.72759912664696
        shape: circle
      da-24:
        x: 1045.2705808757937
        'y': -686.727599126647
        shape: circle
      da-29:
        x: 955.1726804851687
        'y': -374.72759912664696
        shape: circle
      da-34:
        x: 503.7195554851687
        'y': -374.72759912664696
        shape: circle
      da-35:
        x: 618.8040281414187
        'y': -222.72759912664696
      da-37:
        x: 868.3001218914187
        'y': -222.72759912664696
      da-41:
        x: 1250.3001218914187
        'y': -374.72759912664696
      da-42:
        x: 1328.2176023601687
        'y': -530.727599126647
        shape: circle
      da-48:
        x: 2835.9719968914187
        'y': -686.727599126647
        w: 320
        h: 110
        shape: circle
      da-51:
        x: 236.8040281414187
        'y': -70.72759912664696
      da-99:
        x: 674.3997312664187
        'y': -530.727599126647
        shape: circle
      da-123:
        x: 225
        'y': -567.7586341751829
        shape: circle
      da-126:
        x: -210.716796875
        'y': -542.7586341751829
      da-127:
        x: -540
        'y': -542.7586341751829
      da-149:
        x: 2825
        'y': -861.727599126647
      da-151:
        x: 2525
        'y': -825
      da-154:
        x: 2880.6979828035655
        'y': -550
    edges:
      da-124:
        waypoints:
          - x: 787.9005249843403
            'y': -626.9333456052141
            id: da-125
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
      label: Side Pane Keymenu (Mini menu)
    da-127:
      label: Mostly hidden Keymenu (keymenu display with only a single line of text at the bottom of the screen)
    da-149:
      label: For adding a connected node to the node under the crosshairs, the ghost nodes seem to be too crowded.   Only have halfway point ghosts for the nodes that are currently visible and distinguish the "grid ghosts" from the halfway point ghosts visually.
    da-151:
      label: Make the  fine/normal/coarse movement sizes editable in the settings
    da-154:
      label: Dragging an edge label should work in a more intuititive way (drag-left should never move the label to the right, though depending on the angle of the edge, it might take the label and put it on the left side of the edge, rather than move it along the edge).
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
    da-150:
      from: da-149
      to: da-48
    da-152:
      from: da-151
      to: da-48
    da-155:
      from: da-154
      to: da-48
`;
