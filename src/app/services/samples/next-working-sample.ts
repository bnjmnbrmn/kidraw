/**
 * Recovery copy of the live working graph mirrored from the remote KiDraw
 * session on 2026-08-08 at 13:03:06 UTC. Keep the original IDs and geometry:
 * browser repros and development notes refer to the Bugs/Next edges by ID.
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
        shape: circle
      da-51:
        x: 236.8040281414187
        'y': -70.72759912664696
      da-93:
        x: 2720.9719968914187
        'y': -530.727599126647
      da-99:
        x: 674.3997312664187
        'y': -530.727599126647
        shape: circle
      da-111:
        x: 1832.3001218914187
        'y': -534.727599126647
      da-115:
        x: 2214.3001218914187
        'y': -530.727599126647
      da-121:
        x: 2423.389705224752
        'y': -930.3300432456608
    edges:
      da-113:
        waypoints:
          - x: 2413.1780773661962
            'y': -603.4263899604326
            id: da-120
      da-122:
        waypoints:
          - x: 2298.285196184542
            'y': -633.7519001196608
            id: da-123
          - x: 2529.678249493632
            'y': -558.754978822012
            id: da-124
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
    da-93:
      label: Can't add waypoints to self-loop edges that will actually move the self loop
    da-99:
      label: Plugin/Diagram Type system
    da-111:
      label: When selecting the endpoint of an edge you are adding, make the navigtion work the same way as "Move by Node"
    da-115:
      label: Adding self loops doesn't work
    da-121:
      label: Ethan zxto
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
    da-97:
      from: da-48
      to: da-93
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
    da-112:
      from: da-4
      to: da-111
    da-113:
      from: da-48
      to: da-111
    da-116:
      from: da-4
      to: da-115
    da-117:
      from: da-48
      to: da-115
    da-122:
      from: da-4
      to: da-93
`;
