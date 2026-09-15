import { KidrawExtension } from './extension.model';

/** The tag on structure edges: premise → the statement that follows from it. */
export const EXPLANATION_SUPPORTS_TAG = 'explanation/supports';
/** The tag on reading-path edges, whose first label is the step number. */
export const EXPLANATION_PATH_TAG = 'explanation/path';

/**
 * Identity extension for explanations and tutorials an agent builds and the
 * reader questions: roughly one statement per node, with two kinds of edge.
 *
 * - Supports (structure): an edge from each premise to the statement that
 *   follows from it, so a reader can see what any step rests on, however far
 *   back.
 * - Reading path (traversal): the suggested order to read the statements in.
 *   Each path edge's label starts with its step number; "next" follows the
 *   edge numbered one higher. A statement can be visited more than once.
 */
export const EXPLANATION_EXTENSION: KidrawExtension = {
  id: 'explanation',
  name: 'Explanation',
  description: 'Statements linked by what follows from what, with a numbered reading path',
  nodeDefaults: {
    shape: 'box',
    width: 260,
    height: 60,
    fontSize: 14,
    textOverflow: 'fit',
  },
  labelFormat: 'markdown',
  edgeKinds: [
    {
      tag: EXPLANATION_SUPPORTS_TAG,
      name: 'Supports',
      color: '#60a5fa',
      description: 'Structure: the source statement is a premise of the target statement (one edge per premise).',
    },
    {
      tag: EXPLANATION_PATH_TAG,
      name: 'Reading path',
      color: '#34d399',
      description: 'Traversal: the suggested reading order. Each path edge is labelled with its step number (1, 2, 3, …).',
    },
  ],
};
