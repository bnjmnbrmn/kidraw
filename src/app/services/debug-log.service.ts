import { Injectable } from '@angular/core';

// Local dev talks straight to the collector; any other host (e.g. the app
// proxied at kidraw.dev.bnjmnbrmn.com) posts same-origin to /debug-log,
// which nginx forwards to the collector on the box — a phone can't reach
// localhost:9222, and the https page couldn't post to plain http anyway.
const LOG_SERVER_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:9222'
  : '/debug-log';

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
