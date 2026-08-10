/**
 * Recovery copy of the live working graph mirrored from the remote KiDraw
 * session on 2026-08-10 at 11:43:35 UTC. Keep the original IDs and geometry:
 * browser repros and development notes refer to the Next edges by ID.
 */
export const NEXT_WORKING_SAMPLE_YAML = `
kidraw: 1
type: todo-graph
styles:
  - name: default
    nodes:
      da-4:
        x: 1975
        'y': -25
        shape: circle
      da-23:
        x: -629.1779536259864
        'y': -174.52489402527897
        shape: circle
      da-24:
        x: 392.89455613963855
        'y': -634.524894025279
        shape: circle
      da-29:
        x: 18.673120592763553
        'y': -326.52489402527897
        shape: circle
      da-34:
        x: -432.78000440723645
        'y': -326.52489402527897
        shape: circle
      da-35:
        x: -317.69553175098645
        'y': -174.52489402527897
      da-37:
        x: -68.19943800098645
        'y': -174.52489402527897
      da-41:
        x: 882.0476323115136
        'y': -326.52489402527897
      da-42:
        x: 959.9651127802636
        'y': -478.52489402527897
        shape: circle
      da-48:
        x: 3306.7722416865136
        'y': -478.52489402527897
        w: 320
        h: 310
        shape: circle
      da-51:
        x: -699.6955317509864
        'y': -22.524894025278968
      da-99:
        x: -262.09982862598645
        'y': -478.52489402527897
        shape: circle
      da-123:
        x: 565.6413823115136
        'y': -478.52489402527897
        shape: circle
      da-126:
        x: 1464.0476323115136
        'y': -634.524894025279
      da-127:
        x: 2027.7722416865136
        'y': -638.524894025279
      da-159:
        x: 313.80056199901355
        'y': -478.52489402527897
      da-161:
        x: 2609.7722416865136
        'y': -638.524894025279
      da-191:
        x: 3191.7722416865136
        'y': -634.524894025279
      da-194:
        x: 3773.7722416865136
        'y': -638.524894025279
      da-196:
        x: 4355.772241686514
        'y': -634.524894025279
      da-198:
        x: 4937.772241686514
        'y': -634.524894025279
      da-199:
        x: 5039.041284655264
        'y': -478.52489402527897
        shape: circle
    edges:
      da-197:
        waypoints:
          - x: 3492.145550718036
            'y': -436.14520355930534
            id: da-206
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
    da-161:
      label: Should still be able to get edge labels back onto the edge (as opposed to just being above or below/to the left or right)
    da-191:
      label: Coarse movement horizontally should not result in vertical movement (and vice versa).
    da-194:
      label: Halfway point ghost nodes should only be between the crosshair's node and other nodes, not between other nodes.
    da-196:
      label: Releasing the Move by Edge key should not cause movement
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
    da-162:
      from: da-161
      to: da-48
    da-192:
      from: da-191
      to: da-48
    da-195:
      from: da-194
      to: da-48
    da-197:
      from: da-196
      to: da-48
    da-200:
      from: da-198
      to: da-199
`;
