import type {AgentEdgeInfo} from '../agent/agent-canvas';
import {EXPLANATION_PATH_TAG, EXPLANATION_SUPPORTS_TAG} from '../extensions/explanation.extension';

export interface ReadingPath {
  /** Node ids in reading order: where step 1 starts, then where each step ends.
   *  A statement can appear more than once. */
  nodeIds: string[];
  /** Problems with the numbering, worth telling the reader about. */
  warnings: string[];
}

/** The step number at the start of a path edge's first label ("3", "3: because…"), or null. */
export function stepNumber(labels: readonly string[]): number | null {
  const match = /^\s*(\d+)/.exec(labels[0] ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * The reading order an explanation's path edges describe. Edges are taken in
 * step-number order; step 1's source is the first statement and each step's
 * target is the next.
 */
export function readingPath(edges: readonly AgentEdgeInfo[]): ReadingPath {
  const pathEdges = edges.filter(edge => edge.tags.includes(EXPLANATION_PATH_TAG));
  const numbered = pathEdges
    .map(edge => ({edge, step: stepNumber(edge.labels)}))
    .filter((entry): entry is {edge: AgentEdgeInfo; step: number} => entry.step !== null)
    .sort((a, b) => a.step - b.step);

  const warnings: string[] = [];
  const unnumbered = pathEdges.length - numbered.length;
  if (unnumbered > 0) warnings.push(`${unnumbered} path edge${unnumbered === 1 ? ' has' : 's have'} no step number`);
  const duplicates = numbered.filter((entry, i) => i > 0 && numbered[i - 1].step === entry.step).map(e => e.step);
  if (duplicates.length > 0) warnings.push(`Step ${duplicates[0]} is numbered twice`);
  const gap = numbered.find((entry, i) => i > 0 && entry.step > numbered[i - 1].step + 1);
  if (gap) warnings.push(`The steps skip to ${gap.step}`);

  const nodeIds = numbered.length > 0 ? [numbered[0].edge.from, ...numbered.map(entry => entry.edge.to)] : [];
  return {nodeIds, warnings};
}

/** The statements a statement follows from: sources of its incoming supports edges. */
export function premisesOf(nodeId: string, edges: readonly AgentEdgeInfo[]): string[] {
  return edges
    .filter(edge => edge.to === nodeId && edge.tags.includes(EXPLANATION_SUPPORTS_TAG))
    .map(edge => edge.from);
}
