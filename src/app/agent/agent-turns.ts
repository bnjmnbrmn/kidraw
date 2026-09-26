/**
 * The agent's turns, as far as the graph is concerned.
 *
 * Every prompt starts a turn, and everything the agent changes during it is
 * one change set, labeled with what was asked: it undoes as one step, and
 * "Undo the agent's last turn" reverts it even after later edits. Pressing
 * Stop refuses further edits until the next prompt, since the agent may send
 * a tool call or two before it notices.
 */
import type {WritableSignal} from '@angular/core';
import type {CanvasEditMeta} from '../drawing-area/canvas-port';

export class AgentTurns {
  private count = 0;
  private changeSetId: string | null = null;
  private label = 'Agent edit';
  private stopped = false;
  /** Turns that changed the graph, oldest first. */
  private edited: string[] = [];

  /** @param lastEdited the change set "undo its last turn" would revert, for the panel. */
  constructor(private readonly lastEdited: WritableSignal<string | null>) {}

  /** A prompt was sent: a new turn, named after what was asked. */
  begin(prompt: string): void {
    this.changeSetId = this.newChangeSetId();
    this.label = `Agent: ${prompt.length > 40 ? `${prompt.slice(0, 39)}…` : prompt}`;
    this.stopped = false;
  }

  /** The user pressed Stop. */
  stop(): void {
    this.stopped = true;
  }

  /** Why the agent may not change the graph now, or null. */
  editsRefused(): string | null {
    return this.stopped ? 'The user stopped you. Do not change the graph until they send another message.' : null;
  }

  /** Who and what an edit is filed under. */
  editMeta(agentName: string): CanvasEditMeta {
    this.changeSetId ??= this.newChangeSetId();
    return {author: `agent:${agentName}`, label: this.label, changeSetId: this.changeSetId};
  }

  /** An edit in this change set went through. */
  recordEdit(changeSetId: string): void {
    if (!this.edited.includes(changeSetId)) this.edited.push(changeSetId);
    this.lastEdited.set(changeSetId);
  }

  /** That change set was reverted: the one before it is now the last. */
  forget(changeSetId: string): void {
    this.edited = this.edited.filter(id => id !== changeSetId);
    this.lastEdited.set(this.edited[this.edited.length - 1] ?? null);
  }

  private newChangeSetId(): string {
    return `agent-turn-${Date.now().toString(36)}-${++this.count}`;
  }
}
