/**
 * In-graph search, vim-style: `/` asks for a query and goes to the first
 * match; `n` and `N` step forward and back, wrapping. The query persists, and
 * the matches are recomputed on every step, so stepping keeps working across
 * graph edits.
 *
 * The first core feature to bring its own commands (`commands()`), the way
 * plugins will (notes/design-plugins.md).
 */
import { DACommandType } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DrawingLayer } from './drawing.layer';
import type { Point } from './utils';

/** What search needs from the drawing area. */
export interface GraphSearchHost {
  readonly drawingLayer: DrawingLayer;
  /** Ask for a query; null when canceled. (`window.prompt` stands in until
   *  the large-menu overlay lands.) */
  prompt(message: string, initial: string): string | null;
  finishTweens(): void;
  unselectAllLabels(): void;
  nodeCenter(node: DANode): Point;
  centerViewOnLayerPoint(point: Point): void;
  checkAndEmitEditState(): void;
  emitStatus(message: string): void;
}

/** A hit: a node (matched by its label text) or an edge label. */
type SearchMatch =
  | {kind: 'node'; node: DANode}
  | {kind: 'edge-label'; label: DALabel};

/** How much of a long match the status line quotes. */
const QUOTED_LENGTH = 40;

export class GraphSearch {
  private query: string | null = null;
  private last: SearchMatch | null = null;

  constructor(private readonly host: GraphSearchHost) {}

  commands() {
    return {
      [DACommandType.SEARCH_GRAPH]: () => this.open(),
      [DACommandType.SEARCH_NEXT_MATCH]: () => this.step(1),
      [DACommandType.SEARCH_PREV_MATCH]: () => this.step(-1),
    } satisfies CommandSlice;
  }

  /** `/`: ask for a query, and go to its first match. */
  open(): void {
    const entered = this.host.prompt('Search graph:', this.query ?? '')?.trim();
    if (!entered) return;
    this.query = entered;
    this.last = null;
    const matches = this.matchesOrSayNone();
    if (matches) this.focus(matches, 0);
  }

  /** `n` / `N`: the next or previous match. */
  step(direction: 1 | -1): void {
    if (!this.query) return this.host.emitStatus('No search yet — press / to search.');
    const matches = this.matchesOrSayNone();
    if (matches) this.focus(matches, nextIndex(matches, this.last, direction));
  }

  /** The current matches, or null having said there are none. */
  private matchesOrSayNone(): SearchMatch[] | null {
    const matches = searchMatches(this.host.drawingLayer, this.query ?? '');
    if (matches.length > 0) return matches;
    this.host.emitStatus(`No matches for "${this.query}"`);
    return null;
  }

  /** Select the match, recenter the view on it (pan only, no rescale — it
   *  lands at screen center under the crosshairs), and say where it is. */
  private focus(matches: SearchMatch[], index: number): void {
    // Land any in-flight tween BEFORE reading positions — a rapid n/N
    // sequence would otherwise pan from a mid-tween layer offset.
    this.host.finishTweens();
    const match = matches[index];
    this.last = match;
    this.host.drawingLayer.unselectAll();
    this.host.unselectAllLabels();
    this.select(match);
    this.host.checkAndEmitEditState();
    this.host.drawingLayer.batchDraw();
    this.host.emitStatus(`Match ${index + 1}/${matches.length}: "${quoted(textOf(match))}"`);
  }

  private select(match: SearchMatch): void {
    if (match.kind === 'node') {
      match.node.isSelected = true;
      this.host.centerViewOnLayerPoint(this.host.nodeCenter(match.node));
    } else {
      match.label.isSelected = true;
      // Label x/y are already drawing-layer coordinates (the label's center).
      this.host.centerViewOnLayerPoint({x: match.label.x, y: match.label.y});
    }
  }
}

/** Everything whose text contains the query, ignoring case: nodes in layer
 *  order, then edge labels. */
function searchMatches(layer: DrawingLayer, query: string): SearchMatch[] {
  const wanted = query.toLowerCase();
  if (wanted === '') return [];
  const has = (text: string) => text.toLowerCase().includes(wanted);
  return [
    ...layer.getDANodes().filter(node => has(node.label.text())).map(node => ({kind: 'node', node}) as const),
    ...layer.getDAEdges().flatMap(edge => edge.labels).filter(label => has(label.label))
      .map(label => ({kind: 'edge-label', label}) as const),
  ];
}

/** From the last match, one step on, wrapping; from none (or one that has
 *  gone), the first going forward and the last going back. */
function nextIndex(matches: SearchMatch[], last: SearchMatch | null, direction: 1 | -1): number {
  const current = last === null ? -1 : matches.findIndex(match => sameMatch(match, last));
  if (current === -1) return direction === 1 ? 0 : matches.length - 1;
  return (current + direction + matches.length) % matches.length;
}

function sameMatch(a: SearchMatch, b: SearchMatch): boolean {
  if (a.kind === 'node' && b.kind === 'node') return a.node === b.node;
  if (a.kind === 'edge-label' && b.kind === 'edge-label') return a.label === b.label;
  return false;
}

function textOf(match: SearchMatch): string {
  return match.kind === 'node' ? match.node.label.text() : match.label.label;
}

function quoted(text: string): string {
  return text.length > QUOTED_LENGTH ? `${text.slice(0, QUOTED_LENGTH)}…` : text;
}
