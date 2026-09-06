/**
 * The KiDraw map: site/index.org, as data.
 *
 * One source for three things — the diagram the capture run builds in the app,
 * the outline at the bottom of the homepage, and the captions on the page.
 * Following the org file: **headings are nodes, bullets are not**. A node's
 * `bullets` are the author's own lines and are used verbatim. Nothing else is
 * written here: the page carries the org file's words and the screenshots, and
 * no prose of its own.
 *
 * `example` names a break in the sequence of diagram screenshots — the org file
 * asks for these — which takes over the stage after that node's frames.
 */
const n = (id, t, extra = {}, c = []) => ({id, t, ...extra, c});

export const OUTLINE = n('kidraw', 'KiDraw', {kind: 'root'}, [

  n('what', 'What is it?', {kind: 'q'}, [
    n('diagram-editor', 'Diagram editor'),
    n('keyboard-oriented', 'Keyboard-oriented',
      {bullets: ['Inspired by the vi coding editor', 'Explorable keybindings']}),
    n('wip', 'A WIP experiment'),
  ]),

  n('point', "What's the point?", {kind: 'q'}, [
    n('efficiency', 'Efficiency', {}, [
      n('writing-connecting', 'Writing _and_ Connecting',
        {bullets: ['Get both text and connections down, before they slip away']}),
      n('navigation', 'Navigation',
        {bullets: ['Skip the empty space', 'Follow the links']}),
      n('learning', 'Learning',
        {bullets: ['Explore the keybindings, without reading the manual']}),
    ]),
  ]),

  n('how', 'How does it work?', {kind: 'q'}, [
    n('hold-submenu', 'Press and hold submenu keys', {example: 'menu-f'}),
    n('submenu-navigate', 'Some submenu keys allow you to change how you navigate',
      {example: 'window-f'}),
    n('action-on-release', 'Some submenu keys have an action on release', {example: 'menu-a'}),
    n('escape', 'Press ESC or Ctrl-[ once or twice to get back to the main menu'),
    n('modal-text', 'Vi-style modal text editing'),
  ]),

  n('features', 'What are some important features?', {kind: 'q'}, [
    n('routing', 'Automatic edge routing', {example: 'avoid'}, [
      n('waypoints', 'Waypoints for fine tuning'),
    ]),
    n('layout', 'Node/edge layout on demand'),
    n('coarse-fine', 'Coarse and fine movement'),
    n('hop', 'Navigate by hopping from node to node'),
    n('follow-edges', 'Navigate by following edges'),
    n('camera', 'Zoom, pan, and recenter'),
    n('styling', 'Node and Edge Styling'),
    n('edge-labels', 'Edge labels'),
    n('saving', 'Saving diagrams locally', {}, [
      n('chrome-only', 'currently Chrome only'),
    ]),
  ]),
]);

/** Depth-first order, with each node's parent and depth. */
export function flatten(root, parent = null, depth = 0, out = []) {
  out.push({node: root, parent, depth});
  for (const child of root.c) flatten(child, root, depth + 1, out);
  return out;
}
