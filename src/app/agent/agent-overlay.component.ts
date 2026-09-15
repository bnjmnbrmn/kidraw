import {Component, effect, inject, Input, NgZone, OnDestroy} from '@angular/core';
import {AgentCaption, AgentService} from './agent.service';
import {ClientRect} from './agent-canvas';

interface PlacedCaption {
  caption: AgentCaption;
  left: number;
  top: number;
}

const CAPTION_WIDTH = 240;
const CAPTION_GAP = 14;
/** Rough height for placement decisions; captions are short by contract. */
const CAPTION_EST_HEIGHT = 64;

/**
 * Agent annotations drawn over the canvas: captions beside the nodes they
 * describe, docked at the bottom when there's no room (or the node is off
 * screen), plus the "look here" hint while the user leads the view.
 * Positions follow the canvas every animation frame while captions are shown.
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
  /** Right-hand space taken by the agent panel. */
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
    const placed: PlacedCaption[] = [];
    const docked: AgentCaption[] = [];
    for (const caption of captions) {
      const rect = this.agent.nodeClientRect(caption.nodeId);
      const spot = rect ? this.placeBeside(rect, view, placed) : null;
      if (spot) placed.push({caption, ...spot});
      else docked.push(caption);
    }
    this.placed = placed;
    this.docked = docked;
  }

  /** Right of the node, else left, else below, else above — inside the view and clear of other captions. */
  private placeBeside(node: ClientRect, view: ClientRect, taken: PlacedCaption[]): {left: number; top: number} | null {
    const visible = node.left + node.width > view.left && node.left < view.left + view.width
      && node.top + node.height > view.top && node.top < view.top + view.height;
    if (!visible) return null;
    const midY = node.top + node.height / 2 - CAPTION_EST_HEIGHT / 2;
    const midX = node.left + node.width / 2 - CAPTION_WIDTH / 2;
    const candidates = [
      {left: node.left + node.width + CAPTION_GAP, top: midY},
      {left: node.left - CAPTION_GAP - CAPTION_WIDTH, top: midY},
      {left: midX, top: node.top + node.height + CAPTION_GAP},
      {left: midX, top: node.top - CAPTION_GAP - CAPTION_EST_HEIGHT},
    ];
    for (const c of candidates) {
      const inside = c.left >= view.left && c.left + CAPTION_WIDTH <= view.left + view.width
        && c.top >= view.top && c.top + CAPTION_EST_HEIGHT <= view.top + view.height;
      const clear = taken.every(t => c.left + CAPTION_WIDTH < t.left || t.left + CAPTION_WIDTH < c.left
        || c.top + CAPTION_EST_HEIGHT < t.top || t.top + CAPTION_EST_HEIGHT < c.top);
      if (inside && clear) return c;
    }
    return null;
  }
}
