import { Injectable } from '@angular/core';

const LOG_SERVER_URL = 'http://localhost:9222';

@Injectable({ providedIn: 'root' })
export class DebugLogService {
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  log(...args: unknown[]) {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    console.log(...args);
    this.buffer.push(msg);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 50);
    }
  }

  private flush() {
    this.flushTimer = null;
    if (this.buffer.length === 0) return;
    const payload = this.buffer.join('\n');
    this.buffer = [];
    fetch(LOG_SERVER_URL, { method: 'POST', body: payload }).catch(() => {});
  }
}
