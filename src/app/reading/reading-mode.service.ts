import {Injectable, signal} from '@angular/core';
import type {AgentCanvasTarget} from '../agent/agent-canvas';
import type {CanvasRef} from '../agent/agent-protocol';
import {
  EXPLANATION_DOESNT_FOLLOW_TAG, EXPLANATION_FEEDBACK_TAGS, EXPLANATION_TOO_DETAILED_TAG,
} from '../extensions/explanation.extension';
import {plainText} from '../drawing-area/markdown-label';
import {premisesOf, readingPath} from './reading-path';

export type FeedbackKind = 'doesnt-follow' | 'too-detailed';

const FEEDBACK_TAG: Record<FeedbackKind, string> = {
  'doesnt-follow': EXPLANATION_DOESNT_FOLLOW_TAG,
  'too-detailed': EXPLANATION_TOO_DETAILED_TAG,
};

/**
 * Reading mode: step through an explanation along its numbered reading path.
 * Each step moves the view onto the statement and marks it; "why" marks what
 * it follows from. The keys live in AppComponent (the keymenu is suspended
 * while reading, the way it is for the nav popup).
 */
@Injectable({providedIn: 'root'})
export class ReadingModeService {
  readonly active = signal(false);
  /** Index into the reading path. */
  readonly step = signal(0);

  private canvas: AgentCanvasTarget | null = null;
  private say: (text: string) => void = () => {};
  private path: string[] = [];

  attach(canvas: AgentCanvasTarget, say: (text: string) => void): void {
    this.canvas = canvas;
    this.say = say;
  }

  /** Start at the selected statement (or the one under the crosshairs) if it is
   *  on the path, else at the beginning. False when there is no path to read. */
  enter(): boolean {
    const canvas = this.canvas;
    if (!canvas) return false;
    const {nodeIds, warnings} = readingPath(canvas.agentEdges());
    if (nodeIds.length === 0) {
      this.say('No reading path here: mark one with path edges numbered 1, 2, 3…');
      return false;
    }
    this.path = nodeIds;
    const selection = canvas.agentSelection();
    const here = selection.nodeIds[0] ?? selection.underCrosshairsId;
    const start = here ? nodeIds.indexOf(here) : -1;
    this.active.set(true);
    this.goTo(start >= 0 ? start : 0, warnings[0]);
    return true;
  }

  exit(): void {
    if (!this.active()) return;
    this.active.set(false);
    this.canvas?.agentSetHighlights([]);
    this.say('Left reading mode');
  }

  next(): void {
    this.goTo(this.refreshedStep() + 1);
  }

  previous(): void {
    this.goTo(this.refreshedStep() - 1);
  }

  /** Re-read the path (the agent may have inserted or renumbered steps since
   *  the last one) and find where the reader is on it now. */
  private refreshedStep(): number {
    const current = this.path[this.step()];
    const step = this.step();
    this.path = readingPath(this.canvas?.agentEdges() ?? []).nodeIds;
    const occurrences = this.path.flatMap((id, i) => (id === current ? [i] : []));
    if (occurrences.length === 0) return Math.min(step, this.path.length - 1);
    return occurrences.reduce((best, i) => (Math.abs(i - step) < Math.abs(best - step) ? i : best));
  }

  /** Mark the statements the current one follows from, and name them. */
  why(): void {
    const canvas = this.canvas;
    const current = this.path[this.step()];
    if (!canvas || !current) return;
    const premises = premisesOf(current, canvas.agentEdges());
    if (premises.length === 0) {
      this.say('Nothing supports this statement: it is a starting point');
      return;
    }
    canvas.agentSetHighlights([current, ...premises]);
    const labels = this.labels();
    this.say(`Follows from: ${premises.map(id => labels.get(id) || 'an unlabeled statement').join(' · ')}`);
  }

  /** Toggle a feedback mark on the current statement, as an undoable edit
   *  (a statement carries at most one). Resolves to true when the mark is now
   *  set, false when it was cleared, and null when nothing changed. */
  async toggleMark(kind: FeedbackKind): Promise<boolean | null> {
    const canvas = this.canvas;
    const id = this.path[this.step()];
    const node = canvas?.agentNodes().find(n => n.id === id);
    if (!canvas || !this.active() || !node) return null;
    const tag = FEEDBACK_TAG[kind];
    const marked = !node.tags.includes(tag);
    const tags = [...node.tags.filter(t => !EXPLANATION_FEEDBACK_TAGS.includes(t)), ...(marked ? [tag] : [])];
    const result = await canvas.agentApplyChanges([{kind: 'update_node', node: node.id, tags}], {
      author: 'user',
      label: marked ? 'Mark a step' : 'Clear a mark',
      changeSetId: `reading-mark-${Date.now().toString(36)}`,
    });
    if (!result.ok) {
      this.say(result.error ?? 'The mark could not be changed');
      return null;
    }
    return marked;
  }

  /** Every statement with a feedback mark, in reading order (any off the path last). */
  markedRefs(): CanvasRef[] {
    const position = (id: string) => {
      const index = this.path.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return (this.canvas?.agentNodes() ?? [])
      .filter(node => node.tags.some(tag => EXPLANATION_FEEDBACK_TAGS.includes(tag)))
      .sort((a, b) => position(a.id) - position(b.id))
      .map(node => ({kind: 'node', id: node.id, label: plainText(node.label) || 'unlabeled statement'}));
  }

  private goTo(index: number, note?: string): void {
    const canvas = this.canvas;
    if (!canvas) return;
    if (this.path.length === 0) {
      this.say('The reading path is gone (Esc to stop reading)');
      return;
    }
    if (index < 0) {
      this.say('This is the first step');
      return;
    }
    if (index >= this.path.length) {
      this.say('That was the last step');
      return;
    }
    this.step.set(index);
    const id = this.path[index];
    canvas.agentFocusNode(id);
    canvas.agentSetHighlights([id]);
    const label = this.labels().get(id) || 'an unlabeled statement';
    this.say(`Step ${index + 1} of ${this.path.length}: ${label}${note ? ` (${note})` : ''}`);
  }

  private labels(): Map<string, string> {
    return new Map((this.canvas?.agentNodes() ?? []).map(node => [node.id, plainText(node.label)]));
  }
}
