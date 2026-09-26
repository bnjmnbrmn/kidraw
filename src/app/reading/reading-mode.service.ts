import {Injectable, signal} from '@angular/core';
import type {CanvasPort, CanvasChange, CanvasEdge} from '../drawing-area/canvas-port';
import type {CanvasRef} from '../agent/agent-protocol';
import {
  EXPLANATION_ASSUMPTION_KIND_TAG, EXPLANATION_ASSUMPTION_TAG, EXPLANATION_DEFINITION_KIND_TAG,
  EXPLANATION_DEFINITION_TAG, EXPLANATION_DOESNT_FOLLOW_TAG, EXPLANATION_EXAMPLE_KIND_TAG,
  EXPLANATION_FEEDBACK_TAGS, EXPLANATION_TOO_DETAILED_TAG,
} from '../plugins/explanation.plugin';
import {plainText} from '../drawing-area/markdown-label';
import {backgroundLinks, examplesOf, premiseLinks, premisesOf, readingPath} from './reading-path';

/** A node kind's name, for step messages ("definition"); empty for a plain statement. */
function kindOf(tags: readonly string[]): string {
  const kind = [EXPLANATION_ASSUMPTION_KIND_TAG, EXPLANATION_DEFINITION_KIND_TAG, EXPLANATION_EXAMPLE_KIND_TAG]
    .find(tag => tags.includes(tag));
  return kind ? kind.split('/').pop()! : '';
}

export type FeedbackKind = 'doesnt-follow' | 'too-detailed';

const FEEDBACK_TAG: Record<FeedbackKind, string> = {
  'doesnt-follow': EXPLANATION_DOESNT_FOLLOW_TAG,
  'too-detailed': EXPLANATION_TOO_DETAILED_TAG,
};

/** What a mark key did: set or cleared a mark, on the statement or on a link into it. */
export interface MarkResult {
  marked: boolean;
  target: 'statement' | 'link';
}

/**
 * Reading mode: step through an explanation in the order of its step numbers.
 * Each step moves the view onto the statement and highlights it; "why"
 * highlights what it follows from, and "link" points at the links into it one
 * at a time, so a single link can be marked. The keys live in AppComponent
 * (the keymenu is suspended while reading, as it is for the nav popup).
 */
@Injectable({providedIn: 'root'})
export class ReadingModeService {
  readonly active = signal(false);
  /** Index into the reading path. */
  readonly step = signal(0);

  private canvas: CanvasPort | null = null;
  private say: (text: string) => void = () => {};
  private path: string[] = [];
  /** The link being pointed at, as an index into the current statement's
   *  premise links; null when pointing at the statement itself. */
  private linkIndex: number | null = null;

  attach(canvas: CanvasPort, say: (text: string) => void): void {
    this.canvas = canvas;
    this.say = say;
  }

  /** Start at the selected statement (or the one under the crosshairs) if it is
   *  in the reading order, else at the beginning. False when there is nothing to read. */
  enter(): boolean {
    const canvas = this.canvas;
    if (!canvas) return false;
    const {nodeIds, warnings} = readingPath(canvas.nodes(), canvas.edges());
    if (nodeIds.length === 0) {
      this.say('No reading order here: an explanation numbers its statements 1, 2, 3…');
      return false;
    }
    this.path = nodeIds;
    const selection = canvas.selection();
    const here = selection.nodeIds[0] ?? selection.underCrosshairsId;
    const start = here ? nodeIds.indexOf(here) : -1;
    this.active.set(true);
    this.goTo(start >= 0 ? start : 0, warnings[0]);
    return true;
  }

  /** The statement being read, or null when not reading. */
  currentNodeId(): string | null {
    return this.active() ? this.path[this.step()] ?? null : null;
  }

  exit(): void {
    if (!this.active()) return;
    this.active.set(false);
    this.linkIndex = null;
    this.canvas?.setHighlights([]);
    this.say('Left reading mode');
  }

  next(): void {
    this.goTo(this.refreshedStep() + 1);
  }

  previous(): void {
    this.goTo(this.refreshedStep() - 1);
  }

  /** Re-read the order (the agent may have inserted or renumbered steps since
   *  the last one) and find where the reader is in it now. */
  private refreshedStep(): number {
    const current = this.path[this.step()];
    const step = this.step();
    this.path = readingPath(this.canvas?.nodes() ?? []).nodeIds;
    const occurrences = this.path.flatMap((id, i) => (id === current ? [i] : []));
    if (occurrences.length === 0) return Math.min(step, this.path.length - 1);
    return occurrences.reduce((best, i) => (Math.abs(i - step) < Math.abs(best - step) ? i : best));
  }

  /** Highlight what the current statement follows from (and its assumptions,
   *  definitions and examples), and name them. */
  why(): void {
    const canvas = this.canvas;
    const current = this.path[this.step()];
    if (!canvas || !current) return;
    this.linkIndex = null;
    const edges = canvas.edges();
    const groups: [string, string[]][] = [
      ['Follows from', premisesOf(current, edges)],
      ['Assumes', premisesOf(current, edges, EXPLANATION_ASSUMPTION_TAG)],
      ['Uses', premisesOf(current, edges, EXPLANATION_DEFINITION_TAG)],
      ['Example', examplesOf(current, edges)],
    ];
    const related = groups.flatMap(([, ids]) => ids);
    if (related.length === 0) {
      this.say('Nothing supports this statement: it is a starting point');
      return;
    }
    const background = backgroundLinks(edges).filter(link => link.to === current).map(link => link.id);
    canvas.setHighlights([current, ...related, ...background]);
    const labels = this.labels();
    this.say(groups
      .filter(([, ids]) => ids.length > 0)
      .map(([name, ids]) => `${name}: ${ids.map(id => labels.get(id) || 'an unlabeled statement').join(' · ')}`)
      .join('. '));
  }

  /** Point at the next link into the current statement; after the last one,
   *  back at the statement itself. Marks then apply to what is pointed at. */
  nextLink(): void {
    const canvas = this.canvas;
    const current = this.path[this.step()];
    if (!canvas || !current) return;
    const links = premiseLinks(current, canvas.edges());
    if (links.length === 0) {
      this.linkIndex = null;
      this.say('Nothing supports this statement: it has no links to point at');
      return;
    }
    const next = this.linkIndex === null ? 0 : this.linkIndex + 1;
    if (next >= links.length) {
      this.linkIndex = null;
      canvas.setHighlights([current]);
      this.say('Back to the statement');
      return;
    }
    this.linkIndex = next;
    const link = links[next];
    canvas.setHighlights([current, link.from, link.id]);
    this.say(`Link ${next + 1} of ${links.length}: from ${this.labels().get(link.from) || 'an unlabeled statement'}`);
  }

  /** Toggle a feedback mark, as an undoable edit, on the link being pointed at
   *  or else the current statement. Each carries at most one mark. Null when
   *  nothing changed. */
  async toggleMark(kind: FeedbackKind): Promise<MarkResult | null> {
    const canvas = this.canvas;
    const id = this.path[this.step()];
    if (!canvas || !this.active() || !id) return null;
    const tag = FEEDBACK_TAG[kind];
    const withMark = (tags: string[], marked: boolean) =>
      [...tags.filter(t => !EXPLANATION_FEEDBACK_TAGS.includes(t)), ...(marked ? [tag] : [])];

    const link = this.pointedLink();
    if (link) {
      if (kind !== 'doesnt-follow') {
        this.say('Too detailed is for statements; a link can be marked as not following');
        return null;
      }
      const marked = !link.tags.includes(tag);
      return this.applyMark({kind: 'update_edge', edge: link.id, tags: withMark(link.tags, marked)}, marked, 'link');
    }
    const node = canvas.nodes().find(n => n.id === id);
    if (!node) return null;
    const marked = !node.tags.includes(tag);
    return this.applyMark({kind: 'update_node', node: node.id, tags: withMark(node.tags, marked)}, marked, 'statement');
  }

  /** Every marked statement and link, in reading order (a link just before the
   *  statement it leads to; anything not in the order last). */
  markedRefs(): CanvasRef[] {
    const canvas = this.canvas;
    if (!canvas) return [];
    const labels = this.labels();
    const position = (id: string) => {
      const index = this.path.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER / 2 : index;
    };
    const isMarked = (tags: string[]) => tags.some(tag => EXPLANATION_FEEDBACK_TAGS.includes(tag));
    const statements = canvas.nodes().filter(node => isMarked(node.tags)).map(node => ({
      at: position(node.id),
      ref: {kind: 'node' as const, id: node.id, label: labels.get(node.id) || 'unlabeled statement'},
    }));
    const links = canvas.edges().filter(edge => isMarked(edge.tags)).map(edge => ({
      at: position(edge.to) - 0.5,
      ref: {kind: 'edge' as const, id: edge.id, label: `${short(labels.get(edge.from))} → ${short(labels.get(edge.to))}`},
    }));
    return [...statements, ...links].sort((a, b) => a.at - b.at).map(entry => entry.ref);
  }

  private pointedLink(): CanvasEdge | null {
    const current = this.path[this.step()];
    if (this.linkIndex === null || !this.canvas || !current) return null;
    return premiseLinks(current, this.canvas.edges())[this.linkIndex] ?? null;
  }

  private async applyMark(change: CanvasChange, marked: boolean, target: MarkResult['target']): Promise<MarkResult | null> {
    const result = await this.canvas!.applyChanges([change], {
      author: 'user',
      label: marked ? `Mark a ${target}` : 'Clear a mark',
      changeSetId: `reading-mark-${Date.now().toString(36)}`,
    });
    if (!result.ok) {
      this.say(result.error ?? 'The mark could not be changed');
      return null;
    }
    return {marked, target};
  }

  private goTo(index: number, note?: string): void {
    const canvas = this.canvas;
    if (!canvas) return;
    if (this.path.length === 0) {
      this.say('The reading order is gone (Esc to stop reading)');
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
    this.linkIndex = null;
    const id = this.path[index];
    canvas.focusNode(id);
    canvas.setHighlights([id, ...this.firstUseLinks(index)]);
    const label = this.labels().get(id) || 'an unlabeled statement';
    const kind = kindOf(canvas.nodes().find(node => node.id === id)?.tags ?? []);
    this.say(`Step ${index + 1} of ${this.path.length}${kind ? ` (${kind})` : ''}: ${label}${note ? ` (${note})` : ''}`);
  }

  /** The definition and assumption links into the statement at `index`, when
   *  this is where the reader first meets them: its first visit comes before
   *  every other use of that definition or assumption. Those are drawn at full
   *  strength; the rest stay faint. */
  private firstUseLinks(index: number): string[] {
    const canvas = this.canvas;
    const id = this.path[index];
    if (!canvas || !id) return [];
    const firstVisit = new Map<string, number>();
    this.path.forEach((node, i) => {
      if (!firstVisit.has(node)) firstVisit.set(node, i);
    });
    if (firstVisit.get(id) !== index) return [];
    const background = backgroundLinks(canvas.edges());
    return background
      .filter(link => link.to === id)
      .filter(link => Math.min(...background
        .filter(use => use.from === link.from)
        .map(use => firstVisit.get(use.to) ?? Number.MAX_SAFE_INTEGER)) === index)
      .map(link => link.id);
  }

  private labels(): Map<string, string> {
    return new Map((this.canvas?.nodes() ?? []).map(node => [node.id, plainText(node.label)]));
  }
}

function short(label: string | undefined): string {
  const text = label || 'unlabeled statement';
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}
