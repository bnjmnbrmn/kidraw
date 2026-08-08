/**
 * Recovery copy of the live working graph mirrored from the remote KiDraw
 * session on 2026-08-08. Keep the original IDs and geometry: some interaction
 * repros and development notes refer to the Bugs/Next edges by ID.
 */
export const NEXT_WORKING_SAMPLE_YAML = `
kidraw: 1
type: todo-graph
styles:
  - name: default
    nodes:
      da-4:
        x: -397.04086303710756
        'y': -361.0937500000009
        shape: circle
      da-22:
        x: 1024.9591369628924
        'y': -109.09375000000091
      da-23:
        x: 1116.8800354003924
        'y': -361.0937500000009
        shape: circle
      da-24:
        x: 1620.3351135253924
        'y': -361.0937500000009
        shape: circle
      da-29:
        x: 2109.0040588378924
        'y': -361.0937500000009
        shape: circle
      da-34:
        x: 2631.7486877441424
        'y': -361.0937500000009
        shape: circle
      da-35:
        x: 2588.9591369628924
        'y': -105.09375000000091
      da-37:
        x: 2006.9591369628924
        'y': -105.09375000000091
      da-41:
        x: 3038.4552307128924
        'y': -105.09375000000091
      da-42:
        x: 3116.3727111816424
        'y': -361.0937500000009
        shape: circle
      da-47:
        x: 675
        'y': -235
      da-48:
        x: -925
        'y': -725
        w: 320
        h: 290
        shape: circle
      da-51:
        x: 224.9999999999999
        'y': -345
      da-73:
        x: 875
        'y': -525
      da-127:
        x: -740
        'y': -194.61755877992323
      da-139:
        x: -640
        'y': -786.0937500000009
      da-141:
        x: -840.0000000000002
        'y': -911.0937500000009
    edges: {}
semantics:
  nodes:
    da-4:
      label: Bugs
    da-22:
      label: >-
        When for todo graphs, I want task nodes to be markable as DONE, IN PROGRESS, BLOCKED, or TO
        DO
      tags:
        - status/todo
    da-23:
      label: Todo Graphs
    da-24:
      label: Features
    da-29:
      label: File types
    da-34:
      label: Plugins
    da-35:
      label: Active plugin visibility
    da-37:
      label: Active file type visiblilty( some sort of indicator in UI)
    da-41:
      label: Save state vsibilty (some sort of indicator in UI)
    da-42:
      label: File Management
    da-47:
      label: >-
        Need a way to indicate on a task that it is the one, or one of the ones, I want to be
        addressed next.  I suppose I could just create a "next" category and link from that
    da-48:
      label: Next
    da-51:
      label: When using the todo plugin, instead of "circle and box, etc.have category and task
    da-73:
      label: a-s-d-l to insert a box c
    da-127:
      label: >-
        When I go up and down over the Bugs node, I seem to be hitting more things than necessary
        (repeatedly hitting the Bugs node, and also some of the edges, the latter being fine) and
        also not highlighting the edges that I hit
    da-139:
      label: >-
        [Edit] Repeat delay and [Edit] Repeat interval in the Settings don't seem to be having any
        effect
    da-141:
      label: >-
        Add...-Edge-Self-loop doesn't seem to be working
  edges:
    da-26:
      from: da-24
      to: da-22
    da-28:
      from: da-23
      to: da-22
    da-36:
      from: da-34
      to: da-35
    da-38:
      from: da-29
      to: da-37
    da-46:
      from: da-42
      to: da-41
    da-128:
      from: da-127
      to: da-4
    da-140:
      from: da-139
      to: da-48
    da-142:
      from: da-141
      to: da-48
    da-143:
      from: da-127
      to: da-48
`;
