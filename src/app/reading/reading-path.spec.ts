import type {AgentEdgeInfo} from '../agent/agent-canvas';
import {EXPLANATION_PATH_TAG, EXPLANATION_SUPPORTS_TAG} from '../extensions/explanation.extension';
import {premisesOf, readingPath, stepNumber} from './reading-path';

const path = (id: string, from: string, to: string, label: string): AgentEdgeInfo =>
  ({id, from, to, labels: label ? [label] : [], tags: [EXPLANATION_PATH_TAG]});
const supports = (id: string, from: string, to: string): AgentEdgeInfo =>
  ({id, from, to, labels: [], tags: [EXPLANATION_SUPPORTS_TAG]});

describe('reading path', () => {
  it('reads step numbers from the start of a label', () => {
    expect(stepNumber(['3'])).toBe(3);
    expect(stepNumber([' 12: because'])).toBe(12);
    expect(stepNumber(['because'])).toBeNull();
    expect(stepNumber([])).toBeNull();
  });

  it('orders statements by step number, whatever order the edges come in, and allows revisits', () => {
    const edges = [
      path('e3', 'b', 'a', '3'),
      path('e1', 'a', 'c', '1'),
      supports('s1', 'a', 'b'),
      path('e2', 'c', 'b', '2'),
    ];
    expect(readingPath(edges)).toEqual({nodeIds: ['a', 'c', 'b', 'a'], warnings: []});
  });

  it('warns about unnumbered, duplicate and skipped steps', () => {
    const {warnings} = readingPath([
      path('e1', 'a', 'b', '1'), path('e2', 'b', 'c', '1'), path('e3', 'c', 'd', '4'), path('e4', 'd', 'e', ''),
    ]);
    expect(warnings).toEqual(['1 path edge has no step number', 'Step 1 is numbered twice', 'The steps skip to 4']);
  });

  it('finds the premises of a statement from supports edges only', () => {
    const edges = [supports('s1', 'p1', 'c'), supports('s2', 'p2', 'c'), path('e1', 'p1', 'c', '1')];
    expect(premisesOf('c', edges)).toEqual(['p1', 'p2']);
    expect(premisesOf('p1', edges)).toEqual([]);
  });
});
