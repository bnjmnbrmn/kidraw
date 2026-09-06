/**
 * The KiDraw map: site/index.org, as data.
 *
 * One source for three things — the diagram the capture run builds in the app,
 * the outline at the bottom of the homepage, and whatever text sits beside each
 * frame. Following the org file: **headings are nodes, bullets are not**. A
 * node's `bullets` are the author's own lines and are used verbatim; `note` is
 * only for the few boxes the outline leaves unexplained. Where the label says
 * it already, both are empty and the frame speaks for itself.
 */
const n = (id, t, note, extra = {}, c = []) => ({id, t, note, ...extra, c});

export const OUTLINE = n('kidraw', 'KiDraw', '', {kind: 'root'}, [

  n('what', 'What is it?', '', {kind: 'q'}, [
    n('diagram-editor', 'Diagram editor', 'Boxes, and arrows between them.'),
    n('keyboard-oriented', 'Keyboard-oriented', '',
      {bullets: ['Inspired by the vi coding editor', 'Discoverable shortcuts']}),
    n('wip', 'A WIP experiment',
      "It works, but it isn't finished and has some rough edges. I'd love to hear your ideas about how to improve it."),
  ]),

  n('point', "What's the point?", '', {kind: 'q'}, [
    n('efficiency', 'Efficiency', '', {}, [
      n('writing-connecting', 'Writing _and_ Connecting', '',
        {bullets: ['Get both text and connections down, before they slip away']}),
      n('navigation', 'Navigation', '',
        {bullets: ['Skip the empty space', 'Follow the links']}),
      n('learning', 'Learning', '',
        {bullets: ['Explore the keybindings, without reading the manual']}),
    ]),
  ]),

  n('how', 'How does it work?', '', {kind: 'q'}, [
    n('hold-submenu', 'Press and hold submenu keys',
      'Tapping a key and holding it are different commands.',
      {digression: 'menu-f', digressionCaption: 'Holding Move by Link. The keymenu redraws to that key\u2019s choices.'}),
    n('submenu-navigate', 'Some submenu keys allow you to change how you navigate',
      'Inside a submenu, h j k l can mean something else.',
      {digression: 'window-f', digressionCaption: 'The same key held, with the whole window in shot: the arrows it can follow are lit on the canvas.'}),
    n('action-on-release', 'Some submenu keys have an action on release',
      'The lift mark in the corner of a key card means it fires when the key comes back up.',
      {digression: 'menu-a', digressionCaption: 'Holding Add. The mark under the a card is the release cue.'}),
    n('escape', 'Press ESC or Ctrl-[ once or twice to get back to the main menu', ''),
    n('modal-text', 'Vi-style modal text editing', 'Insert and normal, w and b, x and dd.'),
  ]),

  n('features', 'Important features?', '', {kind: 'q'}, [
    n('routing', 'Automatic edge routing',
      'Computed, not drawn, and computed again whenever anything moves.', {}, [
      n('waypoints', 'Waypoints for fine tuning',
        'A point the route has to pass through, for when the automatic one is wrong.'),
    ]),
    n('layout', 'Node/edge layout on demand', 'On a keypress, not on every edit.'),
    n('coarse-fine', 'Coarse and fine movement',
      'Two modifiers change how far one press moves the crosshairs.'),
    n('hop', 'Navigate by hopping from node to node', ''),
    n('follow-edges', 'Navigate by following edges', ''),
    n('camera', 'Zoom, pan, and recenter', ''),
    n('styling', 'Node and Edge Styling', 'Shape, colour, and solid, dotted or dashed.'),
    n('edge-labels', 'Edge labels', 'Text on an arrow rather than in a box.'),
    n('saving', 'Saving diagrams locally', 'To your own disk. No account, no server.', {}, [
      n('chrome-only', 'currently Chrome only',
        'It uses the file system access API. A fallback for other browsers is not written yet.'),
    ]),
  ]),
]);

/** Depth-first order, with each node's parent and depth. */
export function flatten(root, parent = null, depth = 0, out = []) {
  out.push({node: root, parent, depth});
  for (const child of root.c) flatten(child, root, depth + 1, out);
  return out;
}
