/**
 * Messages between this tab and kidraw-agent (agent/src/protocol.ts), over one
 * WebSocket per tab. Keep the two files in sync.
 */

export const AGENT_PROTOCOL_VERSION = 1;

/** A reference to something on the canvas. Ids travel on the wire; labels are for people. */
export interface CanvasRef {
  kind: 'node' | 'edge';
  id: string;
  label: string;
}

/** How much detail the user wants in explanations. */
export type DetailLevel = 'brief' | 'standard' | 'thorough';
export const DETAIL_LEVELS: readonly DetailLevel[] = ['brief', 'standard', 'thorough'];

/** One of the agent's settings this tab may change: which model, how hard it thinks. */
export interface AgentOption {
  id: string;
  /** e.g. "Model". */
  name: string;
  /** The value now in force, one of `choices`. */
  current: string;
  choices: {value: string; name: string; description?: string}[];
}

export interface OptionChoice {
  id: string;
  value: string;
}

/** One transcript entry, replayed to a tab that resumes its session. */
export interface HistoryEntry {
  role: 'user' | 'agent' | 'activity' | 'error';
  text: string;
  refs?: CanvasRef[];
}

export type TabToServer =
  | {
      type: 'hello'; protocol: number; token: string; agent: string; graphTitle?: string;
      /** Continue the session this tab had before a reload or a dropped connection. */
      resume?: {sessionId: string; secret: string};
      /** Agent settings the user last chose, applied before the session is announced. */
      options?: OptionChoice[];
    }
  /** `detail` is the user's current setting, sent with every prompt. */
  | {type: 'prompt'; text: string; refs?: CanvasRef[]; detail?: DetailLevel}
  | {type: 'cancel'}
  | {type: 'tool_result'; callId: string; ok: boolean; result?: unknown; error?: string}
  | {type: 'set_option'; id: string; value: string}
  /** Sign the server's agent in to its model provider; `switchAccount` signs out first. */
  | {type: 'sign_in'; switchAccount?: boolean}
  | {type: 'cancel_sign_in'}
  /** The user disconnected on purpose: end the session instead of keeping it for a resume. */
  | {type: 'end'};

export interface ReadyMessage {
  type: 'ready';
  agent: string;
  /** Sent back in `hello.resume` to continue this session after a reload. */
  session: {id: string; secret: string};
  /** True when this connection picked up an existing session. */
  resumed: boolean;
  /** The agent is in the middle of a reply. */
  busy: boolean;
  /** The conversation so far; empty for a new session. */
  history: HistoryEntry[];
  /** The agent's settings this tab may change; empty when it offers none. */
  options: AgentOption[];
  /** The agent can be signed in to its provider from this chat. */
  canSignIn: boolean;
}

export type ServerToTab =
  | ReadyMessage
  | {type: 'error'; message: string; fatal?: boolean}
  | {type: 'agent_text'; delta: string}
  | {type: 'agent_activity'; title: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'}
  | {type: 'turn_end'; stopReason: string}
  | {type: 'tool_call'; callId: string; name: string; args: Record<string, unknown>}
  | {type: 'options'; options: AgentOption[]}
  /** Sign-in is waiting for the user to open `url` and enter `code`. */
  | {type: 'sign_in_prompt'; url: string; code: string | null; message: string}
  | {type: 'sign_in_done'; ok: boolean; message: string};
