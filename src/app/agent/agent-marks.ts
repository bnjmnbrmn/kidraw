/**
 * What the agent leaves on the canvas while it explains: a halo on the nodes
 * it highlights and on the one it last focused, a brief glow on nodes it has
 * just changed, captions beside nodes, and — while the user leads the view —
 * a "look here" hint instead of moving it.
 *
 * All of it points at nodes of one graph, so it all goes when the graph does.
 */
import type {WritableSignal} from '@angular/core';
import type {AgentCanvasTarget, AgentNodeInfo} from './agent-canvas';
import type {AgentCaption} from './agent-store';

/** How long nodes the agent just changed stay lit. */
const FLASH_MS = 1_500;

export class AgentMarks {
  private highlightIds: string[] = [];
  /** The node the agent last focused; marked with the same halo as highlights. */
  private focusedId: string | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  private nextCaptionId = 1;

  constructor(
    private readonly canvas: () => AgentCanvasTarget | null,
    private readonly captions: WritableSignal<AgentCaption[]>,
    private readonly lookHere: WritableSignal<AgentNodeInfo | null>,
  ) {}

  /** Move the view onto the node and mark it. Never touches the selection. */
  focus(id: string): void {
    this.canvas()?.agentFocusNode(id);
    this.focusedId = id;
    this.showHalos();
  }

  highlight(ids: string[]): void {
    this.highlightIds = ids;
    this.showHalos();
  }

  /** A caption beside the node, replacing any it already had. */
  caption(node: AgentNodeInfo, text: string): void {
    this.captions.update(list => [
      ...list.filter(c => c.nodeId !== node.id),
      {id: this.nextCaptionId++, nodeId: node.id, label: node.label, text},
    ]);
  }

  /** The nodes the agent just changed glow for a moment, over the halos. */
  flash(ids: string[]): void {
    const canvas = this.canvas();
    if (!canvas || ids.length === 0) return;
    canvas.agentSetHighlights([...new Set([...this.haloIds(), ...ids])]);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.showHalos(), FLASH_MS);
  }

  clear(): void {
    this.captions.set([]);
    this.lookHere.set(null);
    if (this.highlightIds.length === 0 && !this.focusedId) return;
    this.highlightIds = [];
    this.focusedId = null;
    this.canvas()?.agentSetHighlights([]);
  }

  private showHalos(): void {
    this.canvas()?.agentSetHighlights(this.haloIds());
  }

  private haloIds(): string[] {
    return [...new Set([...this.highlightIds, ...(this.focusedId ? [this.focusedId] : [])])];
  }
}
