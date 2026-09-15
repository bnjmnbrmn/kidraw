import {Component, effect, inject, Input, NgZone, OnDestroy} from '@angular/core';
import {AgentCaption, AgentService} from './agent.service';
import {ClientRect} from './agent-canvas';

interface PlacedCaption {
  caption: AgentCaption;
  left: number;
  top: number;
  height: number;
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
 * the view. Positions follow the canvas every animation frame while captions
 * are shown.
 */
@Component({
  selector: 'app-agent-overlay',
  templateUrl: './agent-overlay.component.html',
  styleUrl: './agent-overlay.component.css',
})
export class AgentOverlayComponent implements OnDestroy {
  readonly agent = inject(AgentService);
  private readonly zone = inject(NgZone);
  @Input() dark = false;
  @Input() followKey = 't';
  /** Space the keymenu occupies at the bottom, so the dock sits above it. */
  @Input() bottomInset = 0;
  /** Right-hand space taken by the agent panel (and a compact menu docked beside it). */
  @Input() rightInset = 0;

  placed: PlacedCaption[] = [];
  docked: AgentCaption[] = [];
  private frame: number | null = null;

  constructor() {
    effect(() => {
      const active = this.agent.captions().length > 0;
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
        this.zone.run(() => this.layout());
        this.frame = this.agent.captions().length > 0 ? requestAnimationFrame(tick) : null;
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  private stopLoop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.placed = [];
    this.docked = [];
  }

  private layout(): void {
    const captions = this.agent.captions();
    const view = this.agent.viewClientRect();
    if (!view) {
      this.placed = [];
      this.docked = captions;
      return;
    }
    const nodes = this.agent.visibleNodeRects();
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
    this.placed = placed;
    this.docked = docked;
  }

  /**
   * The clearest spot beside the node: centred on the right, left, below or
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
    const centreLeft = node.left + node.width / 2 - width / 2;
    const topAligned = node.top;
    const bottomAligned = node.top + node.height - height;
    const leftAligned = node.left;
    const rightAligned = node.left + node.width - width;
    const candidates = [
      {left: right, top: middleTop}, {left, top: middleTop},
      {left: centreLeft, top: below}, {left: centreLeft, top: above},
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
