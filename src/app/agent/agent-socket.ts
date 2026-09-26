/**
 * The WebSocket to kidraw-agent, and what its closing means.
 *
 * `AgentSocket` is one attempt at a connection: it opens, gives up after a
 * timeout if the server never answers, and reports how it closed. Whether to
 * try again is `afterClose`'s call, from how it closed and how the session
 * stood; AgentService acts on the answer.
 */
import type {TabToServer} from '@kidraw/agent-protocol/messages';

/** A socket can hang without opening or closing (e.g. an address the page's own server accepts). */
const CONNECT_TIMEOUT_MS = 15_000;

/** Waits between attempts to reconnect a dropped connection. */
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];

/** Close code the server uses when another tab picked this session up. */
const TAKEN_OVER = 4001;

export interface SocketClosed {
  code: number;
  reason: string;
  /** The socket opened before it closed. */
  opened: boolean;
  /** Closed by us, because the server never answered. */
  timedOut: boolean;
}

export interface SocketEvents {
  opened(): void;
  message(raw: unknown): void;
  closed(closed: SocketClosed): void;
}

export class AgentSocket {
  private readonly socket: WebSocket;
  private opened = false;
  private timer: ReturnType<typeof setTimeout> | null;

  /** Throws for an address the browser can't open at all. */
  constructor(url: string, private readonly events: SocketEvents) {
    this.socket = new WebSocket(url);
    this.socket.onopen = () => {
      this.opened = true;
      events.opened();
    };
    this.socket.onmessage = event => events.message(event.data);
    this.socket.onclose = event => this.reportClosed(event.code, event.reason, false);
    this.timer = setTimeout(() => this.timeOut(), CONNECT_TIMEOUT_MS);
  }

  send(message: TabToServer): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** The server answered: the connect timeout no longer applies. */
  established(): void {
    this.stopTimer();
  }

  /** Close it without reporting: whoever calls this already knows. */
  close(): void {
    this.stopTimer();
    this.socket.onclose = null;
    this.socket.close();
  }

  private timeOut(): void {
    this.timer = null;
    this.socket.onclose = null;
    this.socket.close();
    this.reportClosed(1006, '', true);
  }

  private reportClosed(code: number, reason: string, timedOut: boolean): void {
    this.stopTimer();
    this.events.closed({code, reason, opened: this.opened, timedOut});
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** What to do about a connection that closed on its own. */
export type AfterClose =
  | {kind: 'taken-over'}
  | {kind: 'retry'}
  | {kind: 'fail'; message: string};

export interface SessionSituation {
  /** The session was up (not still connecting) when it closed. */
  wasReady: boolean;
  /** Reconnect attempts made in a row so far. */
  attempts: number;
  /** There is a stored session a reconnect could resume. */
  canResume: boolean;
  endpoint: {name: string; url: string};
}

/**
 * A 4000–4999 close means the server refused or ended the session; anything
 * else is a dropped connection, retried while the session can still resume.
 */
export function afterClose(closed: SocketClosed, situation: SessionSituation): AfterClose {
  if (closed.code === TAKEN_OVER) return {kind: 'taken-over'};
  const refused = closed.code >= 4000 && closed.code < 5000;
  const wasUp = situation.wasReady || situation.attempts > 0;
  if (!refused && wasUp && situation.attempts < RECONNECT_DELAYS_MS.length && situation.canResume) {
    return {kind: 'retry'};
  }
  return {kind: 'fail', message: failureMessage(closed, situation, refused)};
}

function failureMessage(closed: SocketClosed, situation: SessionSituation, refused: boolean): string {
  const {name, url} = situation.endpoint;
  if (refused) return closed.reason || 'The agent server ended the session.';
  if (situation.attempts > 0) return `Couldn't reconnect to ${name}.`;
  if (closed.timedOut) return `Timed out connecting to ${url}. Check the address and that the server is running.`;
  if (!closed.opened || !situation.wasReady) {
    return `Couldn't reach ${url}. Check the address, that the server is running, and that it allows this site.`;
  }
  return 'Disconnected from the agent.';
}
