/**
 * Messages between a KiDraw tab and kidraw-agent, over one WebSocket per tab.
 * Keep in sync with src/app/agent/agent-protocol.ts in the Angular app.
 */

export const PROTOCOL_VERSION = 1;

/** A reference to something on the canvas. Ids travel on the wire; labels are for people. */
export interface CanvasRef {
  kind: 'node' | 'edge';
  id: string;
  label: string;
}

// ─── tab → server ─────────────────────────────────────────────────────────

export interface HelloMessage {
  type: 'hello';
  protocol: number;
  /** Shared access token (sent in the first message, never in the URL). */
  token: string;
  agent: string;
  graphTitle?: string;
  /** Continue the session this tab had before a reload or a dropped connection. */
  resume?: { sessionId: string; secret: string };
}

/** How much detail the user wants in explanations. */
export type DetailLevel = 'brief' | 'standard' | 'thorough';
export const DETAIL_LEVELS: readonly DetailLevel[] = ['brief', 'standard', 'thorough'];

export interface PromptMessage {
  type: 'prompt';
  text: string;
  refs?: CanvasRef[];
  /** The user's current setting, sent with every prompt. */
  detail?: DetailLevel;
}

export interface CancelMessage {
  type: 'cancel';
}

export interface ToolResultMessage {
  type: 'tool_result';
  callId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** The user disconnected on purpose: end the session now rather than keeping it for a resume. */
export interface EndMessage {
  type: 'end';
}

export type TabToServer = HelloMessage | PromptMessage | CancelMessage | ToolResultMessage | EndMessage;

// ─── server → tab ─────────────────────────────────────────────────────────

/** One transcript entry, replayed to a tab that resumes. */
export interface HistoryEntry {
  role: 'user' | 'agent' | 'activity' | 'error';
  text: string;
  refs?: CanvasRef[];
}

export interface ReadyMessage {
  type: 'ready';
  agent: string;
  /** Send back in `hello.resume` to continue this session after a reload. */
  session: { id: string; secret: string };
  /** True when this connection picked up an existing session. */
  resumed: boolean;
  /** The agent is in the middle of a reply. */
  busy: boolean;
  /** The conversation so far; empty for a new session. */
  history: HistoryEntry[];
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  /** The session is over; the tab should disconnect. */
  fatal?: boolean;
}

export interface AgentTextMessage {
  type: 'agent_text';
  /** Incremental text to append to the current agent reply. */
  delta: string;
}

export interface AgentActivityMessage {
  type: 'agent_activity';
  /** Short human-readable description, e.g. "focus" or "Reading graph". */
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface TurnEndMessage {
  type: 'turn_end';
  stopReason: string;
}

export interface ToolCallMessage {
  type: 'tool_call';
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

export type ServerToTab =
  | ReadyMessage | ErrorMessage | AgentTextMessage | AgentActivityMessage | TurnEndMessage | ToolCallMessage;
