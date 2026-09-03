/**
 * The KiDraw map: site/index.org, as data.
 *
 * One source for three things — the graph the capture run builds in the app,
 * the outline markup at the bottom of the homepage, and the sentence or two
 * that sits beside each frame. `t` is the label typed into the node, `note` is
 * the prose, `num` numbers the edge from the parent, `link` is a cross-branch
 * arrow drawn after the tree is finished.
 */
const n = (id, t, note, extra = {}, c = []) => ({id, t, note, ...extra, c});

export const OUTLINE = n('kidraw', 'KiDraw',
  'The first box. Everything else on this page hangs off it, and the whole graph gets built in KiDraw itself as you scroll.', {kind: 'root'}, [

  n('tagline', 'Connect your thoughts, at the speed you have them',
    'That is the goal, and the reason the keyboard comes first. It is a goal, not a measured claim.', {kind: 'quote'}),

  n('what', 'What is it?', 'Five answers. None of them takes longer than a sentence.', {kind: 'q'}, [
    n('diagram-editor', 'Diagram editor',
      'You make boxes and connect them with arrows. That is the whole job.', {}, [
      n('graph-editor', 'Technically, a Graph Editor',
        'Diagram is the everyday word; graph is the accurate one.', {}, [
        n('graph-def', 'A "Graph" is basically just a bunch of nodes (boxes, circles, etc) and edges (lines, possibly with arrowheads)',
          'That is the entire data model. Everything KiDraw does is adding, removing, or arranging those two things.'),
      ]),
      n('comparable', 'Comparable to',
        'Tools you may already use that draw the same shapes.', {}, [
        n('miro', 'Miro', 'Shared whiteboard, mouse-first.'),
        n('visio', 'Microsoft Visio', 'The corporate standard for diagrams.'),
        n('drawio', 'Draw.io', 'Free, browser-based, very widely used.'),
        n('excalidraw', 'Excalidraw', 'Sketchy-looking diagrams, quick to start.'),
        n('graphviz', 'Graphviz (dot)', 'You write the graph as text and it lays it out. KiDraw borrows that idea of automatic layout, but you build the graph by hand.'),
      ]),
    ]),
    n('keyboard-first', 'Keyboard-first',
      'The mouse is optional. Creating, connecting, moving and arranging are all key presses.', {}, [
      n('vi-inspired', 'Initial key bindings inspired by the vi coding editor',
        'The first bindings copy vi because that is the layout I already know.', {}, [
        n('not-coders', 'Not just for coders',
          'The bindings come from a code editor. The tool does not assume you use one.'),
        n('other-options', 'Support other options in the future',
          'Other binding styles are planned. This branch links to that plan further down.'),
      ]),
    ]),
    n('discoverable', 'Discover-able shortcuts',
      'A keyboard is drawn on screen showing what each key does right now, so you can find commands instead of memorising them.'),
    n('experiment', 'An experiment',
      'Whether a keyboard-first diagram editor is actually nicer to use is the open question. I am not claiming it is settled.'),
    n('wip', 'Work in progress',
      'The alpha works, and parts of it will change. The list at the end of this page is what is still missing.'),
  ]),

  n('point', "What's the point?", 'Three reasons to build it rather than use one of the tools above.', {kind: 'q'}, [
    n('graphs-everywhere', 'Graphs are everywhere',
      'Once you notice the shape, it turns up in most of the things you already draw.', {}, [
      n('road-maps', 'Road maps', 'Places, and the roads between them.'),
      n('mind-maps', 'Mind maps', 'One idea in the middle, related ideas hanging off it.'),
      n('logical-arguments', 'Logical arguments',
        'Claims, and what supports them.', {}, [
        n('outlines-graph', 'Outlines are a special type of graph',
          'An outline is a graph where every item has exactly one parent. That covers a lot, but not everything.'),
      ]),
      n('internet', 'The Internet', 'Pages and links.'),
    ]),
    n('thoughts-slip', 'Get our thoughts down before they slip away',
      'The point of going fast is not speed for its own sake. It is capturing an idea while you still have it.', {}, [
      n('bottleneck', 'Avoid the mouse-keyboard switching bottleneck',
        'Moving a hand to the mouse and back is a small interruption that happens constantly while sketching. This box points back at Keyboard-first, in the branch above.', {link: 'keyboard-first'}),
    ]),
    n('learnable', 'Make it easier to learn keyboard-based tools',
      'A secondary hope: the on-screen keyboard might make modal editing approachable to people who would not install vim.', {}, [
      n('vim-curve', 'Vi and Vim have a learning curve',
        'Mostly because you cannot see what is available. KiDraw shows it.'),
    ]),
  ]),

  n('how', 'How does it work?', 'The basics first, then everything you can ignore on day one.', {kind: 'q'}, [
    n('basics', 'Basics',
      'Five steps. The numbers on these arrows are the order to learn them in.', {}, [
      n('move-crosshairs', 'Move the crosshairs',
        'A crosshair takes the place of the mouse pointer. Moving it is the first thing to learn.', {num: 1}, [
        n('key-h', 'h for left', 'Same key vi uses.', {num: 1}),
        n('key-j', 'j for down', 'Down.', {num: 2}),
        n('key-k', 'k for up', 'Up.', {num: 3}),
        n('key-l', 'l for right', 'Right.', {num: 4}),
        n('hjkl', 'using hjkl', 'Four keys under the right hand, no arrow-key reach.'),
      ]),
      n('add-node', 'Add a node',
        'A box appears under the crosshairs and you are typing into it immediately.', {num: 2}, [
        n('press-a', 'Press and release =a=',
          'Tap it. Holding the same key does something else, which is where the next step comes from.'),
      ]),
      n('edit-text', "Edit the node's text",
        'Text editing inside a node behaves like vi, including the modes.', {num: 3}, [
        n('vi-style', 'Vi style', 'Insert and normal, w and b, x and dd. Same habits as the editor.'),
      ]),
      n('exit-edit', 'Exit node edit mode',
        'Leaving the text takes you back to the graph.', {num: 4}, [
        n('press-esc', 'Press ESC or Ctrl-[',
          'Both work. The first press leaves insert, the second leaves the node.'),
      ]),
      n('connect', 'Connect two nodes',
        'Holding Add instead of tapping it turns the same key into connect-and-place.', {num: 5}, [
        n('crosshairs-over', 'Have crosshairs over node',
          'The node you are standing on is where the new arrow starts.', {num: 1}),
        n('hold-a', 'Press _and hold_ =a=',
          'The keyboard on screen changes to the choices available while the key is down.', {num: 2}),
        n('pick-dir', 'Use h for left, j for down, k for up, l for right',
          'Dashed outlines show where the new box could land. Pick one and let go.', {num: 3}),
      ]),
    ]),
    n('advanced', 'Advanced',
      'The rest. None of it is needed to draw your first graph.', {}, [
      n('coarse-fine', 'Coarse and fine movement',
        'Two modifier keys change how far one press moves the crosshairs.'),
      n('nav-by-node', 'Navigate by hopping from node to node',
        'Jump to the next box in a direction instead of travelling the distance.'),
      n('nav-by-link', 'Navigate by following edges',
        'Move along an arrow to whatever is on the other end. This is how the capture run walks back to a parent.'),
      n('zoom-pan', 'Zoom, Pan, and Recenter',
        'Camera commands. Recenter fits the whole graph, which is how the overview frames on this page were taken.'),
      n('styling', 'Node and Edge Styling',
        'Enough styling to carry meaning, deliberately not enough to become a design task.', {}, [
        n('shape', 'Shape', 'Box, circle, diamond, junction, invisible.'),
        n('color', 'Color', 'A small fixed palette.'),
        n('line-style', 'Solid vs Dotted vs Dashed', 'Three line styles, usually enough to separate certain from speculative.'),
      ]),
      n('routing', 'Automatic edge routing',
        'Where an arrow actually goes is computed, not drawn by hand. It runs again whenever anything moves.', {}, [
        n('avoid-under', 'Avoid edges crossing under nodes', 'A line disappearing behind a box is hard to follow.'),
        n('minimize-crossings', 'Minimize edges crossing each other', 'Fewer crossings, fewer misreadings.'),
        n('small-angle', 'Avoid small-angle crossings',
          'When two lines must cross, a shallow crossing is the one your eye follows into the wrong branch.'),
        n('short-edges', 'Minimize edge length', 'Shorter lines, all else equal.'),
      ]),
      n('waypoints', '"Waypoints" for fine tuning edge routing',
        'When the router picks a route you disagree with, drop a point the line has to pass through. It links back to the routing box above.', {link: 'routing'}),
      n('auto-layout', 'Automatic node layout',
        'One command re-arranges the whole graph. Every frame on this page had it applied after the new box was typed.'),
      n('save', 'Save locally',
        'Files go to your own disk. There is no account and no server.', {}, [
        n('two-files', 'Separate semantic and style files',
          'What the graph means and how it looks are stored apart.', {}, [
          n('like-css', 'Like HTML and CSS',
            'Restyle without touching the content, or read a diff of the thinking without the colour changes.'),
        ]),
        n('chrome-only', 'Chrome only',
          'Saving uses the file system access API, which today means Chrome.', {}, [
          n('for-now', 'for now', 'A download-and-upload fallback would cover other browsers. Not written yet.'),
        ]),
      ]),
    ]),
  ]),

  n('going', 'Where is this going?', 'Planned, not built. Read this branch as a list of intentions.', {kind: 'q'}, [
    n('other-bindings', 'Other styles of keybindings',
      'vi bindings were the fastest for me to design, not the ones everyone should have to use. This links back to the promise made in the first branch.', {link: 'other-options'}, [
      n('bind-ijkl', 'i, j, k, and l', 'Same shape as hjkl, shifted one key over.', {num: 1}),
      n('bind-wasd', 'w, a, s, and d', 'The arrangement games use.', {num: 2}),
      n('bind-arrows', 'arrow keys', 'The obvious default for anyone who wants one.', {num: 3}),
      n('bind-emacs', 'Emacs style', 'Ctrl and Meta chords instead of modes.', {num: 4}),
      n('bind-etc', 'etc.', 'Bindings are already data in the code, so adding a profile is not a rewrite.', {num: 5}),
    ]),
    n('collab', 'Collaborate on graphs',
      'More than one editor on the same graph.', {}, [
      n('with-people', 'with other people', 'The ordinary version: two people, one diagram.'),
      n('with-agents', 'with AI agents',
        'The version I want: an agent editing the same graph I am editing. Right now the handover between me and the agents on this project happens through files.'),
    ]),
    n('better-layout', 'Improvements to graph layout/edge routing',
      'Routing is the part I change most often. Some graphs still come out with routes I would not have drawn.', {}, [
      n('alt-algorithms', 'Including alternative algorithms',
        'Different graphs want different layouts, so this should be a choice rather than one built-in answer.'),
    ]),
    n('alt-nav', 'Alternative navigation',
      'Hopping by node and following links are both still being judged by feel. They are the parts I am least sure about.'),
    n('temp-views', 'Temporary views',
      'Change what you are shown without changing what the graph says.', {}, [
      n('pull-neighbors', 'Pull in neighboring nodes',
        'Bring whatever touches the current box next to it, temporarily.'),
      n('collapse-expand', 'Collapse/expand subgraphs',
        'Fold a branch into one box until you need it again.'),
    ]),
    n('plugins', 'Plugins',
      'Things that make sense once the core is stable.', {}, [
      n('presentations', 'Presentations', 'Walk an audience through a graph.', {}, [
        n('saved-views', 'Saved series of views', 'A slide is a camera position, so a deck is a saved list of them.'),
      ]),
      n('diff-viz', 'Diff visualization', 'What changed between two versions of a graph.'),
      n('git', 'Git integration', 'Graphs are files, so they can have history like anything else.'),
      n('diagram-types', 'Diagram types',
        'A graph that knows what kind of thing it is can be more helpful about it.', {}, [
        n('todo-graphs', 'Todo graphs', 'This project keeps its own task list this way.', {num: 1}),
        n('architecture', 'Software architecture', 'Components and their dependencies.', {num: 2}),
        n('genealogy', 'Genealogy', 'Family trees, which are famously not trees.', {num: 3}),
        n('types-etc', 'etc.', 'The list is open.', {num: 4}),
      ]),
    ]),
    n('polish', 'Visual polish',
      'Last on purpose. It is the easiest thing to spend time on and the least likely to change whether the tool is any good.'),
  ]),
]);

/** Depth-first order, with each node's parent and depth. */
export function flatten(root, parent = null, depth = 0, out = []) {
  const entry = {node: root, parent, depth};
  out.push(entry);
  for (const child of root.c) flatten(child, root, depth + 1, out);
  return out;
}

export const LINKS = flatten(OUTLINE)
  .filter(({node}) => node.link)
  .map(({node}) => ({from: node.id, to: node.link}));
