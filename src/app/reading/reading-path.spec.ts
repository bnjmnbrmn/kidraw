import type {AgentEdgeInfo, AgentNodeInfo} from '../agent/agent-canvas';
import {EXPLANATION_SUPPORTS_TAG} from '../extensions/explanation.extension';
import {numberedTags} from '../extensions/tag-groups';
import {premiseLinks, premisesOf, readingPath} from './reading-path';

const node = (id: string, ...steps: number[]): AgentNodeInfo =>
  ({id, label: id.toUpperCase(), tags: ['other', ...steps.map(step => `step/${step}`)]});
const edge = (id: string, from: string, to: string, tags: string[]): AgentEdgeInfo => ({id, from, to, labels: [], tags});

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

  it('finds premises, and the links to them, from supports edges only', () => {
    const edges = [
      edge('s1', 'p1', 'c', [EXPLANATION_SUPPORTS_TAG]),
      edge('s2', 'p2', 'c', [EXPLANATION_SUPPORTS_TAG, 'feedback/doesnt-follow']),
      edge('e3', 'p3', 'c', []),
    ];
    expect(premiseLinks('c', edges).map(link => link.id)).toEqual(['s1', 's2']);
    expect(premisesOf('c', edges)).toEqual(['p1', 'p2']);
    expect(premisesOf('p1', edges)).toEqual([]);
  });
});
