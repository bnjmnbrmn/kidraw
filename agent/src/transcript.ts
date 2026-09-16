import type { HistoryEntry, ServerToTab } from './protocol.js';

/** Entries kept for a tab that resumes. Older ones fall off the front. */
const MAX_HISTORY = 300;

/** An entry still being written to: `open` marks an agent reply mid-stream. */
type OpenEntry = HistoryEntry & { open?: boolean };

/**
 * What a session would have to say again if its tab came back.
 *
 * A KiDraw session outlives its socket (see `TabSession`), so every
 * conversation event is both sent and recorded here. When a tab reloads or
 * reconnects it gets `replay()` in the `ready` message and picks the
 * conversation up mid-sentence.
 *
 * Streaming is the reason this is more than an array: an agent reply arrives
 * as many `agent_text` deltas that belong to one entry, and an activity line
 * is revised in place as a tool call moves from pending to completed. Both are
 * folded into the entry already there rather than appended.
 */
export class Transcript {
  private readonly entries: OpenEntry[] = [];

  /** Fold a conversation event into the transcript. Anything else is ignored. */
  record(message: ServerToTab): void {
    const last = this.entries[this.entries.length - 1];
    switch (message.type) {
      case 'agent_text':
        if (last?.role === 'agent' && last.open) last.text += message.delta;
        else this.push({ role: 'agent', text: message.delta, open: true });
        break;
      case 'agent_activity': {
        const text = message.status === 'failed' ? `${message.title} (failed)` : message.title;
        if (last?.role === 'activity' && last.text.replace(/ \(failed\)$/, '') === message.title) last.text = text;
        else this.push({ role: 'activity', text });
        break;
      }
      case 'error':
        // A fatal error ends the session, so there is nothing left to resume into.
        if (!message.fatal) this.push({ role: 'error', text: message.message });
        break;
      case 'turn_end':
        for (const entry of this.entries) entry.open = false;
        break;
      default:
        break;
    }
  }

  /** Add an entry the session writes itself, such as the user's own prompt. */
  push(entry: OpenEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_HISTORY) this.entries.splice(0, this.entries.length - MAX_HISTORY);
  }

  /** The conversation so far, without the streaming bookkeeping. */
  replay(): HistoryEntry[] {
    return this.entries.map(({ role, text, refs }) => (refs ? { role, text, refs } : { role, text }));
  }
}
