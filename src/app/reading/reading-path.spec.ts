import type {CanvasEdge, CanvasNode} from '../drawing-area/canvas-port';
import {
  EXPLANATION_ASSUMPTION_TAG, EXPLANATION_DEFINITION_TAG, EXPLANATION_EXAMPLE_TAG, EXPLANATION_SUPPORTS_TAG,
} from '../plugins/explanation.plugin';
import {numberedTags} from '../plugins/tag-groups';
import {examplesOf, premiseLinks, premisesOf, readingPath} from './reading-path';

const node = (id: string, ...steps: number[]): CanvasNode =>
  ({id, label: id.toUpperCase(), tags: ['other', ...steps.map(step => `step/${step}`)]});
const edge = (id: string, from: string, to: string, tags: string[]): CanvasEdge => ({id, from, to, labels: [], tags});

describe('reading path', () => {
  it('reads step numbers from tags, ignoring anything else after the prefix', () => {
    expect(numberedTags(['step/10', 'step/2', 'step/x', 'step/0', 'steps/3', 'other'], 'step/')).toEqual([2, 10]);
  });

  it('orders statements by their step numbers, visiting one more than once', () => {
    const nodes = [node('c', 3), node('a', 1, 4), node('x'), node('b', 2)];
    expect(readingPath(nodes)).toEqual({nodeIds: ['a', 'b', 'c', 'a'], warnings: []});
  });

  it('warns about repeated, late-starting and skipped steps', () => {
    expect(readingPath([node('a', 2), node('b', 2), node('c', 5)]).warnings)
      .toEqual(['Step 2 is on two statements', 'The steps start at 2', 'The steps skip to 5']);
  });

  it('finds premises, assumptions and examples, and the links from what a statement depends on', () => {
    const edges = [
      edge('a1', 'as', 'c', [EXPLANATION_ASSUMPTION_TAG]),
      edge('s1', 'p1', 'c', [EXPLANATION_SUPPORTS_TAG]),
      edge('s2', 'p2', 'c', [EXPLANATION_SUPPORTS_TAG, 'feedback/doesnt-follow']),
      edge('e3', 'p3', 'c', []),
      edge('x1', 'c', 'ex', [EXPLANATION_EXAMPLE_TAG]),
    ];
    expect(premiseLinks('c', edges).map(link => link.id)).toEqual(['s1', 's2', 'a1']);
    expect(premisesOf('c', edges)).toEqual(['p1', 'p2']);
    expect(premisesOf('c', edges, EXPLANATION_ASSUMPTION_TAG)).toEqual(['as']);
    expect(premisesOf('p1', edges)).toEqual([]);
    expect(examplesOf('c', edges)).toEqual(['ex']);
  });

  it('warns when something is read before what it builds on', () => {
    const nodes = [node('def', 2), node('use', 1), node('ex', 3)];
    const edges = [
      edge('d1', 'def', 'use', [EXPLANATION_DEFINITION_TAG]),
      edge('x1', 'use', 'ex', [EXPLANATION_EXAMPLE_TAG]),
    ];
    expect(readingPath(nodes, edges).warnings).toEqual(['Step 1 comes before step 2, which it depends on']);
    expect(readingPath([node('def', 1), node('use', 2), node('ex', 3)], edges).warnings).toEqual([]);
  });
});
