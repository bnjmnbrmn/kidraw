/**
 * The messages between a KiDraw tab and kidraw-agent, over one WebSocket per
 * tab: every message the tab may send (`TabToServer`) and every one it may
 * receive (`ServerToTab`). Both programs compile this same file.
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
  /** Agent settings the user last chose, applied before the session is announced. */
  options?: OptionChoice[];
}

/** One of the agent's settings the tab may change: which model, how hard it thinks. */
export interface AgentOption {
  id: string;
  /** e.g. "Model". */
  name: string;
  /** The value now in force, one of `choices`. */
  current: string;
  choices: { value: string; name: string; description?: string }[];
}

export interface OptionChoice {
  id: string;
  value: string;
}

export interface SetOptionMessage {
  type: 'set_option';
  id: string;
  value: string;
}

/** Sign the server's agent in to its model provider from the chat.
 *  `switchAccount` signs out first, so a different account can be used. */
export interface SignInMessage {
  type: 'sign_in';
  switchAccount?: boolean;
}

export interface CancelSignInMessage {
  type: 'cancel_sign_in';
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

export type TabToServer =
  | HelloMessage | PromptMessage | CancelMessage | ToolResultMessage | EndMessage
  | SetOptionMessage | SignInMessage | CancelSignInMessage;

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
  /** The agent's settings the tab may change; empty when it offers none. */
  options: AgentOption[];
  /** The agent can be signed in to its provider from the chat. */
  canSignIn: boolean;
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

/** The agent's settings changed (the tab asked, or the agent moved them itself). */
export interface OptionsMessage {
  type: 'options';
  options: AgentOption[];
}

/** Sign-in is waiting for the user to open `url` and enter `code`. */
export interface SignInPromptMessage {
  type: 'sign_in_prompt';
  url: string;
  code: string | null;
  message: string;
}

export interface SignInDoneMessage {
  type: 'sign_in_done';
  ok: boolean;
  message: string;
}

export interface ToolCallMessage {
  type: 'tool_call';
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

export type ServerToTab =
  | ReadyMessage | ErrorMessage | AgentTextMessage | AgentActivityMessage | TurnEndMessage | ToolCallMessage
  | OptionsMessage | SignInPromptMessage | SignInDoneMessage;
