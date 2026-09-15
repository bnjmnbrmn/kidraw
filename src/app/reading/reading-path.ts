import type {AgentEdgeInfo, AgentNodeInfo} from '../agent/agent-canvas';
import {EXPLANATION_STEP_TAG_PREFIX, EXPLANATION_SUPPORTS_TAG} from '../extensions/explanation.extension';
import {numberedTags} from '../extensions/tag-groups';

export interface ReadingPath {
  /** Node ids in reading order. A statement read more than once appears more than once. */
  nodeIds: string[];
  /** Problems with the numbering, worth telling the reader about. */
  warnings: string[];
}

/**
 * The reading order an explanation's step numbers give. A statement carries a
 * `step/N` tag for each step it is read at, so it can be visited again later.
 */
export function readingPath(nodes: readonly AgentNodeInfo[]): ReadingPath {
  const visits = nodes
    .flatMap(node => numberedTags(node.tags, EXPLANATION_STEP_TAG_PREFIX).map(step => ({step, id: node.id})))
    .sort((a, b) => a.step - b.step);

  const warnings: string[] = [];
  const repeated = visits.find((visit, i) => i > 0 && visits[i - 1].step === visit.step);
  if (repeated) warnings.push(`Step ${repeated.step} is on two statements`);
  if (visits.length > 0 && visits[0].step !== 1) warnings.push(`The steps start at ${visits[0].step}`);
  const gap = visits.find((visit, i) => i > 0 && visit.step > visits[i - 1].step + 1);
  if (gap) warnings.push(`The steps skip to ${gap.step}`);

  return {nodeIds: visits.map(visit => visit.id), warnings};
}

/** The supports links into a statement: one from each statement it follows from. */
export function premiseLinks(nodeId: string, edges: readonly AgentEdgeInfo[]): AgentEdgeInfo[] {
  return edges.filter(edge => edge.to === nodeId && edge.tags.includes(EXPLANATION_SUPPORTS_TAG));
}

/** The statements a statement follows from. */
export function premisesOf(nodeId: string, edges: readonly AgentEdgeInfo[]): string[] {
  return premiseLinks(nodeId, edges).map(edge => edge.from);
}
