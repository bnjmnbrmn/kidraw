import { KidrawExtension } from './extension.model';

/** The tag on structure edges: premise → the statement that follows from it. */
export const EXPLANATION_SUPPORTS_TAG = 'explanation/supports';
/** Reading order: a statement read at step 3 is tagged `step/3`, and also
 *  `step/7` if the reader comes back to it. */
export const EXPLANATION_STEP_TAG_PREFIX = 'step/';
/** Reader feedback on a statement: set while reading, cleared by the agent
 *  once it has addressed it. At most one per statement. */
export const EXPLANATION_DOESNT_FOLLOW_TAG = 'feedback/doesnt-follow';
export const EXPLANATION_TOO_DETAILED_TAG = 'feedback/too-detailed';
export const EXPLANATION_FEEDBACK_TAGS: readonly string[] = [EXPLANATION_DOESNT_FOLLOW_TAG, EXPLANATION_TOO_DETAILED_TAG];

/**
 * Identity extension for explanations and tutorials an agent builds and the
 * reader questions: roughly one statement per node, with two kinds of edge.
 *
 * - Supports (structure): an edge from each premise to the statement that
 *   follows from it, so a reader can see what any step rests on, however far
 *   back.
 * - Reading order: the suggested order to read the statements in, as step
 *   numbers on the statements themselves. A statement the reader should come
 *   back to carries more than one number.
 * - Feedback: a reader marks a statement, or a supports link, that doesn't
 *   follow for them (or a statement that is too detailed).
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
  tagGroups: [
    {
      id: 'feedback',
      name: 'Feedback',
      choices: [
        { tag: EXPLANATION_DOESNT_FOLLOW_TAG, label: "DOESN'T FOLLOW", color: '#d97706' },
        { tag: EXPLANATION_TOO_DETAILED_TAG, label: 'TOO DETAILED', color: '#7c3aed' },
      ],
    },
  ],
  edgeKinds: [
    {
      tag: EXPLANATION_SUPPORTS_TAG,
      name: 'Supports',
      color: '#60a5fa',
      description: 'Structure: the source statement is a premise of the target statement (one edge per premise).',
    },
  ],
  readingOrder: {tagPrefix: EXPLANATION_STEP_TAG_PREFIX, color: '#34d399'},
};
