import { Injectable } from '@angular/core';

import { DEBUG_CHANNEL } from '../../environments/environment';

// Local dev talks straight to the collector; any other host (e.g. the app
// proxied at kidraw.dev.bnjmnbrmn.com) posts same-origin to /debug-log,
// which nginx forwards to the collector on the box — a phone can't reach
// localhost:9222, and the https page couldn't post to plain http anyway.
// Computed lazily rather than as a module-level const so that reading
// window.location is not a module-load side effect in a hosted build.
// Note: esbuild still emits this function and the URL strings — it
// short-circuits the folded DEBUG_CHANNEL guards rather than eliminating
// the branches. The strings are inert dead code, not a live endpoint;
// the guarantee that matters is enforced by the guards, not by absence.
function logServerUrl(): string {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:9222'
    : '/debug-log';
}

@Injectable({ providedIn: 'root' })
export class DebugLogService {
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  log(...args: unknown[]) {
    console.log(...args);
    // Hosted builds keep the console output but never talk to a collector:
    // DEBUG_CHANNEL is a compile-time false there, so this folds to an
    // unconditional return and nothing below can run.
    if (!DEBUG_CHANNEL) return;
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    this.buffer.push(msg);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 50);
    }
  }

  private flush() {
    // Guarded here as well as in log(): flush() is a class method, so the
    // bundler can't prove it unreachable from the log() guard alone, and
    // LOG_SERVER_URL would survive into the hosted bundle. With the check
    // first, the constant goes unreferenced and drops out.
    if (!DEBUG_CHANNEL) return;
    this.flushTimer = null;
    if (this.buffer.length === 0) return;
    const payload = this.buffer.join('\n');
    this.buffer = [];
    fetch(logServerUrl(), { method: 'POST', body: payload }).catch(() => {});
  }
}
