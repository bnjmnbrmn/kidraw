import { randomUUID } from 'node:crypto';
import type { ServerToTab } from './shared/messages.js';

interface PendingToolCall {
  resolve(result: unknown): void;
  reject(err: Error): void;
  timer: NodeJS.Timeout;
}

/**
 * Canvas tool calls waiting on the tab. A call goes out as a `tool_call`
 * message and waits for the matching `tool_result`; one the tab never
 * answers fails after `timeoutMs`, and all of them fail at once when the tab
 * goes away, rather than being left hanging.
 */
export class PendingToolCalls {
  private readonly pending = new Map<string, PendingToolCall>();

  constructor(private readonly timeoutMs: number) {}

  /** Send a call to the tab and wait for its answer. */
  call(name: string, args: Record<string, unknown>, send: (message: ServerToTab) => void): Promise<unknown> {
    const callId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId);
        reject(new Error(`KiDraw did not answer "${name}" in time`));
      }, this.timeoutMs);
      this.pending.set(callId, { resolve, reject, timer });
      send({ type: 'tool_call', callId, name, args });
    });
  }

  /** The tab answered. An answer to a call already given up on is dropped. */
  settle(callId: string, ok: boolean, result: unknown, error: string | undefined): void {
    const call = this.pending.get(callId);
    if (!call) return;
    this.pending.delete(callId);
    clearTimeout(call.timer);
    if (ok) call.resolve(result);
    else call.reject(new Error(error ?? 'Tool failed in KiDraw'));
  }

  /** Fail every call still waiting, e.g. because the tab disconnected. */
  rejectAll(reason: string): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
