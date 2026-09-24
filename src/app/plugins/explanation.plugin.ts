import { KidrawPlugin } from './plugin.model';

/** The tag on structure edges: premise → the statement that follows from it. */
export const EXPLANATION_SUPPORTS_TAG = 'explanation/supports';
/** Reading order: a statement read at step 3 is tagged `step/3`, and also
 *  `step/7` if the reader comes back to it. */
export const EXPLANATION_STEP_TAG_PREFIX = 'step/';
/** Node kinds. A node without one is an ordinary statement. */
export const EXPLANATION_ASSUMPTION_KIND_TAG = 'kind/assumption';
export const EXPLANATION_DEFINITION_KIND_TAG = 'kind/definition';
export const EXPLANATION_EXAMPLE_KIND_TAG = 'kind/example';
/** Links to what an assumption, definition or example is for. Like supports,
 *  they run from what the reader needs first to what builds on it: from an
 *  assumption or definition to each statement relying on it, and from a
 *  statement to its example. */
export const EXPLANATION_ASSUMPTION_TAG = 'explanation/assumption';
export const EXPLANATION_DEFINITION_TAG = 'explanation/definition';
export const EXPLANATION_EXAMPLE_TAG = 'explanation/example';
/** Reader feedback on a statement: set while reading, cleared by the agent
 *  once it has addressed it. At most one per statement. */
export const EXPLANATION_DOESNT_FOLLOW_TAG = 'feedback/doesnt-follow';
export const EXPLANATION_TOO_DETAILED_TAG = 'feedback/too-detailed';
export const EXPLANATION_FEEDBACK_TAGS: readonly string[] = [EXPLANATION_DOESNT_FOLLOW_TAG, EXPLANATION_TOO_DETAILED_TAG];

/**
 * Identity plugin for explanations and tutorials an agent builds and the
 * reader questions: roughly one statement per node, with two kinds of edge.
 *
 * - Supports (structure): an edge from each premise to the statement that
 *   follows from it, so a reader can see what any step rests on, however far
 *   back.
 * - Reading order: the suggested order to read the statements in, as step
 *   numbers on the statements themselves. A statement the reader should come
 *   back to carries more than one number.
 * - Assumptions, definitions and examples are nodes of their own kinds, linked
 *   to the statements they serve, so a reader can see which statements share
 *   an assumption or use a term.
 * - Feedback: a reader marks a statement, or a supports link, that doesn't
 *   follow for them (or a statement that is too detailed).
 */
export const EXPLANATION_PLUGIN: KidrawPlugin = {
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
  requires: ['markdown'],
  uses: ['math', 'agent-chat'],
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
    {
      tag: EXPLANATION_ASSUMPTION_TAG,
      name: 'Assumption',
      color: '#f472b6',
      description: 'From an assumption node to a statement that relies on it (one edge per statement).',
      faint: true,
    },
    {
      tag: EXPLANATION_DEFINITION_TAG,
      name: 'Definition',
      color: '#22d3ee',
      description: 'From a definition node to a statement that uses the defined term (one edge per statement).',
      faint: true,
    },
    {
      tag: EXPLANATION_EXAMPLE_TAG,
      name: 'Example',
      color: '#facc15',
      description: 'From a statement to an example node that illustrates it.',
    },
  ],
  nodeKinds: [
    {
      tag: EXPLANATION_ASSUMPTION_KIND_TAG,
      name: 'Assumption',
      color: '#f472b6',
      description: 'Something taken as given, stated once and linked to every statement that relies on it.',
    },
    {
      tag: EXPLANATION_DEFINITION_KIND_TAG,
      name: 'Definition',
      color: '#22d3ee',
      description: 'The meaning of a term, linked to every statement that uses it and read before them.',
    },
    {
      tag: EXPLANATION_EXAMPLE_KIND_TAG,
      name: 'Example',
      color: '#facc15',
      description: 'A concrete instance of a statement, linked from it and read right after it.',
    },
  ],
  readingOrder: {tagPrefix: EXPLANATION_STEP_TAG_PREFIX, color: '#34d399'},
};
