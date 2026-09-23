import type {AgentEdgeInfo, AgentNodeInfo} from '../agent/agent-canvas';
import {
  EXPLANATION_ASSUMPTION_TAG, EXPLANATION_DEFINITION_TAG, EXPLANATION_EXAMPLE_TAG, EXPLANATION_STEP_TAG_PREFIX,
  EXPLANATION_SUPPORTS_TAG,
} from '../plugins/explanation.plugin';
import {numberedTags} from '../plugins/tag-groups';

export interface ReadingPath {
  /** Node ids in reading order. A statement read more than once appears more than once. */
  nodeIds: string[];
  /** Problems with the numbering, worth telling the reader about. */
  warnings: string[];
}

/** Links into a statement from what it depends on: premises, assumptions, definitions. */
const DEPENDENCY_TAGS = [EXPLANATION_SUPPORTS_TAG, EXPLANATION_ASSUMPTION_TAG, EXPLANATION_DEFINITION_TAG];
/** Every explanation link runs from what the reader needs first to what builds on it. */
const ORDERED_TAGS = [...DEPENDENCY_TAGS, EXPLANATION_EXAMPLE_TAG];

/**
 * The reading order an explanation's step numbers give. A statement carries a
 * `step/N` tag for each step it is read at, so it can be visited again later.
 * With the edges, it also checks that nothing is read before what it builds on.
 */
export function readingPath(nodes: readonly AgentNodeInfo[], edges: readonly AgentEdgeInfo[] = []): ReadingPath {
  const visits = nodes
    .flatMap(node => numberedTags(node.tags, EXPLANATION_STEP_TAG_PREFIX).map(step => ({step, id: node.id})))
    .sort((a, b) => a.step - b.step);

  const warnings: string[] = [];
  const repeated = visits.find((visit, i) => i > 0 && visits[i - 1].step === visit.step);
  if (repeated) warnings.push(`Step ${repeated.step} is on two statements`);
  if (visits.length > 0 && visits[0].step !== 1) warnings.push(`The steps start at ${visits[0].step}`);
  const gap = visits.find((visit, i) => i > 0 && visit.step > visits[i - 1].step + 1);
  if (gap) warnings.push(`The steps skip to ${gap.step}`);

  const firstStep = new Map<string, number>();
  for (const visit of visits) if (!firstStep.has(visit.id)) firstStep.set(visit.id, visit.step);
  const early = edges.find(edge => edge.tags.some(tag => ORDERED_TAGS.includes(tag))
    && (firstStep.get(edge.to) ?? Infinity) < (firstStep.get(edge.from) ?? -Infinity));
  if (early) {
    warnings.push(`Step ${firstStep.get(early.to)} comes before step ${firstStep.get(early.from)}, which it depends on`);
  }

  return {nodeIds: visits.map(visit => visit.id), warnings};
}

/** The links into a statement from what it depends on: premises, then assumptions and definitions. */
export function premiseLinks(nodeId: string, edges: readonly AgentEdgeInfo[]): AgentEdgeInfo[] {
  return DEPENDENCY_TAGS.flatMap(tag => edges.filter(edge => edge.to === nodeId && edge.tags.includes(tag)));
}

/** The nodes linked into a statement by one kind of link (by default, its premises). */
export function premisesOf(nodeId: string, edges: readonly AgentEdgeInfo[], tag = EXPLANATION_SUPPORTS_TAG): string[] {
  return edges.filter(edge => edge.to === nodeId && edge.tags.includes(tag)).map(edge => edge.from);
}

/** Background links, drawn faint unless emphasized: from definitions and assumptions. */
export function backgroundLinks(edges: readonly AgentEdgeInfo[]): AgentEdgeInfo[] {
  return edges.filter(edge => edge.tags.includes(EXPLANATION_ASSUMPTION_TAG) || edge.tags.includes(EXPLANATION_DEFINITION_TAG));
}

/** The example nodes a statement links to. */
export function examplesOf(nodeId: string, edges: readonly AgentEdgeInfo[]): string[] {
  return edges.filter(edge => edge.from === nodeId && edge.tags.includes(EXPLANATION_EXAMPLE_TAG)).map(edge => edge.to);
}
