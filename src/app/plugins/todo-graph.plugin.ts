import { KidrawPlugin } from './plugin.model';

/** Styles a graph as a todo/planning board: wide rectangular cards that fit a
 *  sentence of text on one or two lines, growing downward when a label runs
 *  long instead of ballooning in both directions. */
export const TODO_GRAPH_PLUGIN: KidrawPlugin = {
  id: 'todo-graph',
  name: 'Todo Graph',
  nodeDefaults: {
    shape: 'box',
    width: 280,
    height: 70,
    fontSize: 14,
    textOverflow: 'widen-v',
  },
};
