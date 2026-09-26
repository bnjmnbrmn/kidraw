import {Component, effect, inject, Input, NgZone, OnDestroy} from '@angular/core';
import {AgentService} from './agent.service';
import {AgentCaption, AgentStore} from './agent-store';
import {ClientRect} from '../drawing-area/canvas-port';

interface PlacedCaption {
  caption: AgentCaption;
  left: number;
  top: number;
  height: number;
}

interface Layout {
  placed: PlacedCaption[];
  docked: AgentCaption[];
  /** Changes only when something on screen would move. */
  signature: string;
}

const CAPTION_WIDTH = 240;
const CAPTION_GAP = 14;
/** 12.5px text in a 240px box wraps at about this many characters per line. */
const CHARS_PER_LINE = 28;
const LINE_HEIGHT = 17.5;
/** Vertical padding and borders. */
const CAPTION_CHROME_HEIGHT = 16;
/** A caption may cover up to this share of its own area in other nodes; past that it docks. */
const MAX_COVERED_FRACTION = 0.1;
/** Docked captions shown at once; the rest are summarized. */
const MAX_DOCKED = 3;
/** Docked captions are wider (up to 560px), so more text fits per line. */
const DOCKED_CHARS_PER_LINE = 75;
const DOCK_GAP = 6;
const DOCK_MARGIN = 12;
/** The look-here hint is one line. */
const LOOK_HERE_HEIGHT = 34;

/** Captions are placed before they render, so their height is estimated from the text. */
export function estimateCaptionHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  return lines * LINE_HEIGHT + CAPTION_CHROME_HEIGHT;
}

function intersects(a: ClientRect, b: ClientRect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
}

function contains(outer: ClientRect, inner: ClientRect): boolean {
  return inner.left >= outer.left && inner.left + inner.width <= outer.left + outer.width
    && inner.top >= outer.top && inner.top + inner.height <= outer.top + outer.height;
}

function overlapArea(a: ClientRect, b: ClientRect): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Agent annotations drawn over the canvas: captions beside the nodes they
 * describe, docked at the bottom when every nearby spot would hide other nodes
 * (or the node is off screen), plus the "look here" hint while the user leads
 * the view. Placement is recomputed every animation frame outside Angular, and
 * only re-renders when a caption actually moves.
 */
@Component({
  selector: 'app-agent-overlay',
  templateUrl: './agent-overlay.component.html',
  styleUrl: './agent-overlay.component.css',
})
export class AgentOverlayComponent implements OnDestroy {
  readonly agent = inject(AgentService);
  readonly store = inject(AgentStore);
  private readonly zone = inject(NgZone);
  @Input() dark = false;
  /** Space the keymenu occupies at the bottom, so the dock sits above it. */
  @Input() bottomInset = 0;
  /** Right-hand space taken by the agent panel (and a compact menu docked beside it). */
  @Input() rightInset = 0;
  /** Left-hand space taken by a compact menu docked on the left. */
  @Input() leftInset = 0;

  placed: PlacedCaption[] = [];
  /** Docked captions on screen (at most MAX_DOCKED). */
  docked: AgentCaption[] = [];
  /** Docked captions left out for space. */
  moreDocked = 0;
  private signature = '';
  private frame: number | null = null;

  constructor() {
    effect(() => {
      const active = this.store.captions().length > 0;
      if (active) this.startLoop();
      else this.stopLoop();
    });
  }

  ngOnDestroy(): void {
    this.stopLoop();
  }

  private startLoop(): void {
    if (this.frame !== null) return;
    this.zone.runOutsideAngular(() => {
      const tick = () => {
        const layout = this.computeLayout();
        if (layout.signature !== this.signature) {
          this.signature = layout.signature;
          this.zone.run(() => {
            this.placed = layout.placed;
            this.docked = layout.docked.slice(0, MAX_DOCKED);
            this.moreDocked = Math.max(0, layout.docked.length - MAX_DOCKED);
          });
        }
        this.frame = this.store.captions().length > 0 ? requestAnimationFrame(tick) : null;
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  private stopLoop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.signature = '';
    this.placed = [];
    this.docked = [];
    this.moreDocked = 0;
  }

  private computeLayout(): Layout {
    const captions = this.store.captions();
    const view = this.agent.viewClientRect();
    if (!view) {
      return {placed: [], docked: captions, signature: `docked:${captions.map(c => c.id).join(',')}`};
    }
    const nodes = this.agent.visibleNodeRects();
    let layout = this.placeAll(captions, view, nodes);
    // The dock sits at the bottom of the view; place floating captions above it.
    const dockHeight = this.estimateDockHeight(layout.docked);
    if (dockHeight > 0) {
      layout = this.placeAll(captions, {...view, height: Math.max(0, view.height - dockHeight)}, nodes);
    }
    const signature = layout.placed.map(p => `${p.caption.id}@${Math.round(p.left)},${Math.round(p.top)}`).join(';')
      + '|' + layout.docked.map(c => c.id).join(',');
    return {...layout, signature};
  }

  private placeAll(
    captions: AgentCaption[], view: ClientRect, nodes: {id: string; rect: ClientRect}[],
  ): {placed: PlacedCaption[]; docked: AgentCaption[]} {
    const placed: PlacedCaption[] = [];
    const docked: AgentCaption[] = [];
    for (const caption of captions) {
      // Not among the visible nodes means off screen: dock it.
      const rect = nodes.find(n => n.id === caption.nodeId)?.rect;
      const height = estimateCaptionHeight(caption.text);
      const spot = rect ? this.placeBeside(caption.nodeId, rect, height, view, placed, nodes) : null;
      if (spot) placed.push({caption, height, ...spot});
      else docked.push(caption);
    }
    return {placed, docked};
  }

  private estimateDockHeight(docked: AgentCaption[]): number {
    const shown = docked.slice(0, MAX_DOCKED);
    const rows = shown.map(c => {
      const lines = Math.max(1, Math.ceil((c.label.length + c.text.length + 2) / DOCKED_CHARS_PER_LINE));
      return lines * LINE_HEIGHT + CAPTION_CHROME_HEIGHT;
    });
    if (docked.length > MAX_DOCKED) rows.push(LOOK_HERE_HEIGHT);
    if (this.store.lookHere()) rows.push(LOOK_HERE_HEIGHT);
    if (rows.length === 0) return 0;
    return rows.reduce((sum, h) => sum + h, 0) + DOCK_GAP * (rows.length - 1) + DOCK_MARGIN * 2;
  }

  /**
   * The clearest spot beside the node: centered on the right, left, below or
   * above, then aligned with the node's edges on each side. A spot must lie in
   * the view and clear of other captions; the first that hides no other node
   * wins, otherwise the one hiding least, as long as that is a small share of
   * the caption. Null means dock.
   */
  private placeBeside(
    nodeId: string, node: ClientRect, height: number, view: ClientRect,
    taken: PlacedCaption[], nodes: {id: string; rect: ClientRect}[],
  ): {left: number; top: number} | null {
    if (!intersects(node, view)) return null;
    const width = CAPTION_WIDTH;
    const right = node.left + node.width + CAPTION_GAP;
    const left = node.left - CAPTION_GAP - width;
    const below = node.top + node.height + CAPTION_GAP;
    const above = node.top - CAPTION_GAP - height;
    const middleTop = node.top + node.height / 2 - height / 2;
    const centerLeft = node.left + node.width / 2 - width / 2;
    const topAligned = node.top;
    const bottomAligned = node.top + node.height - height;
    const leftAligned = node.left;
    const rightAligned = node.left + node.width - width;
    const candidates = [
      {left: right, top: middleTop}, {left, top: middleTop},
      {left: centerLeft, top: below}, {left: centerLeft, top: above},
      {left: right, top: topAligned}, {left: right, top: bottomAligned},
      {left, top: topAligned}, {left, top: bottomAligned},
      {left: leftAligned, top: below}, {left: rightAligned, top: below},
      {left: leftAligned, top: above}, {left: rightAligned, top: above},
    ];

    let best: {left: number; top: number} | null = null;
    let bestCovered = Infinity;
    for (const spot of candidates) {
      const box = {left: spot.left, top: spot.top, width, height};
      if (!contains(view, box)) continue;
      if (taken.some(t => intersects(box, {left: t.left, top: t.top, width, height: t.height}))) continue;
      let covered = 0;
      for (const other of nodes) {
        if (other.id !== nodeId) covered += overlapArea(box, other.rect);
      }
      if (covered === 0) return spot;
      if (covered < bestCovered) {
        best = spot;
        bestCovered = covered;
      }
    }
    return best && bestCovered <= MAX_COVERED_FRACTION * width * height ? best : null;
  }
}
