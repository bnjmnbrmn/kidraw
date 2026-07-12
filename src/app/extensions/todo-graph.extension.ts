import { KidrawExtension } from './extension.model';

/** Identity extension for todo/planning graphs: cards sized to their text —
 *  short items get small cards, long items wrap at the max width and grow
 *  downward. width/height here are the fit mode's max width and baseline,
 *  not a fixed card size; they are cascade defaults, so per-node values only
 *  reach the file when a card deviates (e.g. manually resized). */
export const TODO_GRAPH_EXTENSION: KidrawExtension = {
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
