/**
 * The conversation as the chat shows it: the user's messages, the agent's
 * reply as it streams in, one line per thing the agent is doing (reading the
 * graph, running a search), and errors.
 */
import type {WritableSignal} from '@angular/core';
import type {HistoryEntry} from './agent-protocol';
import type {ChatMessage} from './agent-store';

export class ChatTranscript {
  private nextId = 1;

  constructor(private readonly messages: WritableSignal<ChatMessage[]>) {}

  add(message: Omit<ChatMessage, 'id'>): void {
    this.messages.update(list => [...list, {...message, id: this.nextId++}]);
  }

  /** An error, unless the last thing said was the same error: pressing
   *  Reconnect against the same problem shouldn't stack copies of it. */
  addErrorOnce(text: string): void {
    const last = this.last();
    if (!(last?.role === 'error' && last.text === text)) this.add({role: 'error', text});
  }

  /** More of the agent's reply: extends the reply that is streaming, or starts one. */
  appendAgentText(delta: string): void {
    this.messages.update(list => {
      const last = list[list.length - 1];
      if (last?.role === 'agent' && last.streaming) {
        return [...list.slice(0, -1), {...last, text: last.text + delta}];
      }
      return [...list, {id: this.nextId++, role: 'agent', text: delta, streaming: true}];
    });
  }

  /** What the agent is doing. A status change to the same activity updates
   *  its line instead of adding another. */
  recordActivity(title: string, status: string): void {
    const text = status === 'failed' ? `${title} (failed)` : title;
    this.messages.update(list => {
      const last = list[list.length - 1];
      if (last?.role === 'activity' && last.text.replace(/ \(failed\)$/, '') === title) {
        return [...list.slice(0, -1), {...last, text}];
      }
      return [...list, {id: this.nextId++, role: 'activity', text}];
    });
  }

  /** The reply is complete. */
  endStreaming(): void {
    this.messages.update(list => list.map(m => (m.streaming ? {...m, streaming: false} : m)));
  }

  /** Replace everything with a resumed session's history; its last reply is
   *  still streaming if the agent is mid-answer. */
  replaceWith(history: HistoryEntry[], busy: boolean): void {
    this.messages.set(history.map((entry, index) => ({
      id: this.nextId++,
      role: entry.role,
      text: entry.text,
      ...(entry.refs ? {refs: entry.refs} : {}),
      ...(busy && entry.role === 'agent' && index === history.length - 1 ? {streaming: true} : {}),
    })));
  }

  isEmpty(): boolean {
    return this.messages().length === 0;
  }

  private last(): ChatMessage | undefined {
    const list = this.messages();
    return list[list.length - 1];
  }
}
