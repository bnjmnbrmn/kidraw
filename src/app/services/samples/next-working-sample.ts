/**
 * Recovery copy of the live working graph mirrored from the remote KiDraw
 * session on 2026-08-09 at 17:40:38 UTC. Keep the original IDs and geometry:
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
      da-143:
        x: 3060
        'y': -425
      da-147:
        x: 3125
        'y': -675
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
    da-143:
      label: With the crosshairs over an edge, a tapped "Add..." should add a label
    da-147:
      label: Make the [Edit] Repeat delay/interval actually work
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
    da-144:
      from: da-143
      to: da-48
    da-148:
      from: da-147
      to: da-48
`;
