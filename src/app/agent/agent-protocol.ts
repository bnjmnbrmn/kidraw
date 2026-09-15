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

export type TabToServer =
  | {type: 'hello'; protocol: number; token: string; agent: string; graphTitle?: string}
  | {type: 'prompt'; text: string; refs?: CanvasRef[]}
  | {type: 'cancel'}
  | {type: 'tool_result'; callId: string; ok: boolean; result?: unknown; error?: string};

export type ServerToTab =
  | {type: 'ready'; agent: string}
  | {type: 'error'; message: string; fatal?: boolean}
  | {type: 'agent_text'; delta: string}
  | {type: 'agent_activity'; title: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'}
  | {type: 'turn_end'; stopReason: string}
  | {type: 'tool_call'; callId: string; name: string; args: Record<string, unknown>};
