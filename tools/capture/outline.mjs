/**
 * The KiDraw map: site/index.org, as data.
 *
 * One source for three things — the graph the capture run builds in the app,
 * the outline at the bottom of the homepage, and the sentence or two beside
 * each frame. Following the org file: **headings are nodes, bullets are not**.
 * A node's `bullets` are the author's own supporting lines; they appear in the
 * outline appendix but never become boxes.
 */
const n = (id, t, note, extra = {}, c = []) => ({id, t, note, ...extra, c});

export const OUTLINE = n('kidraw', 'KiDraw',
  'The first box. Everything else on this page hangs off it, and the whole graph gets built inside KiDraw as you scroll.', {kind: 'root'}, [

  n('what', 'What is it?', 'Three answers, none of them longer than a sentence.', {kind: 'q'}, [
    n('diagram-editor', 'Diagram editor',
      'Boxes, and arrows between them. That is the whole data model: nodes and edges.'),
    n('keyboard-oriented', 'Keyboard-oriented',
      'The bindings started from vi, because that is the keyboard language I already think in — and they are meant to be found on screen rather than memorised from a manual.',
      {bullets: ['Inspired by the vi coding editor', 'Discoverable shortcuts']}),
    n('wip', 'A WIP experiment',
      'It works, and it is not finished. Whether a keyboard-first diagram editor is actually nicer to use is the open question.'),
  ]),

  n('point', "What's the point?", 'One answer, in three parts.', {kind: 'q'}, [
    n('efficiency', 'Efficiency',
      'Not speed for its own sake. Fewer interruptions between having a thought and having it on screen.', {}, [
      n('writing-connecting', 'Writing _and_ Connecting',
        'Typing a label and joining it to something else are the same handful of keys, so both land before either slips away.',
        {bullets: ['Get both text and connections down, before they slip away']}),
      n('navigation', 'Navigation',
        'Move between boxes rather than across pixels: skip the empty space, or follow a link to whatever is on the other end.',
        {bullets: ['Skip the empty space', 'Follow the links']}),
      n('learning', 'Learning',
        'The keyboard drawn on screen shows what each key does right now, so the bindings can be explored rather than looked up.',
        {bullets: ['Explore the keybindings, without reading the manual']}),
    ]),
  ]),

  n('how', 'How does it work?', 'Five things to know. After those you are guessing correctly.', {kind: 'q'}, [
    n('hold-submenu', 'Press and hold submenu keys',
      'Tapping a key and holding it are two different commands. Holding one opens its submenu, and the keyboard on screen redraws to show what is now available.'),
    n('submenu-navigate', 'Some submenu keys allow you to change how you navigate',
      'Inside a submenu, h j k l can mean something else: stepping between boxes, or between the dashed places a new box could land.'),
    n('action-on-release', 'Some submenu keys have an action on release',
      'The lift mark in the corner of a key card means it fires when you let go. That is how holding Add and choosing a direction becomes one gesture.'),
    n('escape', 'Press ESC or Ctrl-[ once or twice to get back to the main menu',
      'The same escape hatch as vi. One press leaves the text; a second leaves the box.'),
    n('modal-text', 'Vi-style modal text editing',
      'Inside a box the text behaves like vi — insert and normal, w and b, x and dd.'),
  ]),

  n('features', 'Important features?', 'The parts that are built, and worth knowing about.', {kind: 'q'}, [
    n('routing', 'Automatic edge routing',
      'Where an arrow goes is computed rather than drawn, and computed again whenever anything moves. The two breaks after this branch show it working.', {}, [
      n('waypoints', 'Waypoints for fine tuning',
        'When the router picks a route you disagree with, drop a point the line has to pass through. Everything else keeps routing itself.'),
    ]),
    n('layout', 'Node/edge layout on demand',
      'One press re-arranges the whole graph. Every frame on this page had it applied straight after the box was typed.'),
    n('coarse-fine', 'Coarse and fine movement',
      'Two modifier keys change how far a single press moves the crosshairs.'),
    n('hop', 'Navigate by hopping from node to node',
      'Jump to the next box in a direction instead of travelling the distance between them.'),
    n('follow-edges', 'Navigate by following edges',
      'Move along an arrow to whatever is on the other end. It is also how the capture script walks back to a parent box.'),
    n('camera', 'Zoom, pan, and recenter',
      'Camera commands. Recenter fits the whole graph on screen, which is how the wider frames here were framed.'),
    n('styling', 'Node and Edge Styling',
      'Shape, colour, and solid versus dotted versus dashed. Enough to carry meaning, not enough to turn into a design task.'),
    n('edge-labels', 'Edge labels',
      'Text attached to an arrow rather than to a box, for when the relationship is the thing that needs naming.'),
    n('saving', 'Saving diagrams locally',
      'Files go to your own disk. There is no account and no server.', {}, [
      n('chrome-only', 'currently Chrome only',
        'Saving uses the file system access API, which today means Chrome. A download-and-upload fallback would cover the rest; it is not written yet.'),
    ]),
  ]),
]);

/** Depth-first order, with each node's parent and depth. */
export function flatten(root, parent = null, depth = 0, out = []) {
  out.push({node: root, parent, depth});
  for (const child of root.c) flatten(child, root, depth + 1, out);
  return out;
}
