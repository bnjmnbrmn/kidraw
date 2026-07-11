import { KidrawPlugin } from './plugin.model';

/** Styles a graph as a todo/planning board: rectangular cards sized to their
 *  text — short items get small cards, long items wrap at the base width and
 *  grow downward. The width/height here are the fit mode's maximum width and
 *  baseline, not a fixed card size. */
export const TODO_GRAPH_PLUGIN: KidrawPlugin = {
  id: 'todo-graph',
  name: 'Todo Graph',
  nodeDefaults: {
    shape: 'box',
    width: 280,
    height: 70,
    fontSize: 14,
    textOverflow: 'fit',
  },
};
