/**
 * The KiDraw map: site/index.org, as data.
 *
 * One source for three things — the diagram the film builds in the app, the
 * breadcrumb trail above the video, and the outline at the bottom of the page.
 * Every word here is the org file's; nothing is written for the page.
 *
 * Headings and bullets are both nodes now. A bullet is a leaf hanging off the
 * heading it sits under, marked `note` so the outline at the foot of the page
 * still renders it as the bullet it is in the org file.
 *
 * `example` names a break in the build — a small graph of its own, made to show
 * one thing — which takes over the video after that node has been made.
 */
const n = (id, t, extra = {}, c = []) => ({id, t, ...extra, c});

export const OUTLINE = n('kidraw', 'KiDraw', {kind: 'root'}, [

  n('what', 'What is it?', {kind: 'q'}, [
    n('diagram-editor', 'Diagram editor'),
    n('keyboard-oriented', 'Keyboard-oriented', {}, [
      n('vi-inspired', 'Inspired by the vi coding editor', {kind: 'note'}),
      n('explorable', 'Explorable keybindings', {kind: 'note'}),
    ]),
    n('wip', 'WIP experiment'),
  ]),

  n('point', "What's the point?", {kind: 'q'}, [
    n('efficiency', 'Efficiency', {}, [
      n('writing-connecting', 'Writing _and_ Connecting', {}, [
        n('before-they-slip', 'Get both text and connections down, before they slip away', {kind: 'note'}),
      ]),
      n('navigation', 'Navigation', {}, [
        n('skip-empty', 'Skip the empty space', {kind: 'note'}),
        n('follow-links', 'Follow the links', {kind: 'note'}),
      ]),
      n('learning', 'Learning', {}, [
        n('explore-keys', 'Explore the keybindings, without reading the manual', {kind: 'note'}),
      ]),
    ]),
  ]),

  n('how', 'How does it work?', {kind: 'q'}, [
    n('hold-submenu', 'Press and hold submenu keys', {example: 'hold'}),
    n('submenu-navigate', 'Some submenu keys allow you to change how you navigate',
      {example: 'navkeys'}),
    n('action-on-release', 'Some submenu keys have an action on release', {example: 'release'}),
    n('escape', 'Press ESC or Ctrl-[ once or twice to get back to the main menu'),
    // Typed as the heading it was, then edited into what it says now — which
    // is the demonstration of modal text editing, done on the box that claims
    // it.
    n('modal-text', 'Text editing with vi(m) modes and bindings',
      {editFrom: 'Vi-style modal text editing'}),
  ]),

  n('features', 'What are some important features?', {kind: 'q'}, [
    n('routing', 'Automatic edge routing', {example: 'routing'}, [
      n('waypoints', 'Waypoints for fine tuning', {example: 'waypoints'}),
    ]),
    n('layout', 'Node/edge layout on demand', {example: 'layouts'}),
    n('coarse-fine', 'Coarse and fine movement', {example: 'coarsefine'}),
    n('hop', 'Navigate by hopping from node to node', {example: 'hop'}),
    n('follow-edges', 'Navigate by following edges', {example: 'links'}),
    n('camera', 'Zoom, pan, and recenter'),
    n('styling', 'Node and Edge Styling', {example: 'styling'}),
    n('edge-labels', 'Edge labels', {example: 'edgelabels'}),
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

/** Org emphasis stripped: the app gets the words, not the markup. */
export const plain = text => text.replace(/[=_]([^=_]+)[=_]/g, '$1');

/** The trail from the root down to a node — what the breadcrumb shows. */
export function trailTo(node, entries = flatten(OUTLINE)) {
  const byNode = new Map(entries.map(entry => [entry.node, entry]));
  const trail = [];
  for (let at = byNode.get(node); at; at = at.parent ? byNode.get(at.parent) : null) {
    trail.unshift(plain(at.node.t));
  }
  return trail;
}
