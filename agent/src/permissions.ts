import type * as acp from '@agentclientprotocol/sdk';

/** Permission kinds a read-only KiDraw session approves. */
const SAFE_KINDS = new Set(['read', 'search', 'think']);

/** The MCP server name KiDraw's canvas tools are registered under. */
export const KIDRAW_MCP_SERVER = 'kidraw';

export interface PermissionDecision {
  response: acp.RequestPermissionResponse;
  /** Set when the request was refused: what was refused, for the transcript. */
  refused?: string;
}

/**
 * Answer an agent's permission request. KiDraw sessions are read-only: reading,
 * searching and thinking are allowed, and so are calls to KiDraw's own canvas
 * tools. Everything else is refused, including edits, commands, network access,
 * requests for extra sandbox permissions (codex-acp sends those as kind
 * "other"), and any kind this policy doesn't recognise.
 *
 * `titleOf` looks up an earlier tool call's title, for approvals that refer to
 * a call by id instead of naming the MCP server.
 */
export function decidePermission(
  params: acp.RequestPermissionRequest,
  titleOf: (toolCallId: string) => string | undefined,
): PermissionDecision {
  const { toolCall, options } = params;
  const kind = toolCall.kind ?? undefined;
  if ((kind !== undefined && SAFE_KINDS.has(kind)) || isKidrawToolApproval(params, titleOf)) {
    const allow = options.find(o => o.kind === 'allow_once') ?? options.find(o => o.kind === 'allow_always');
    if (allow) return { response: { outcome: { outcome: 'selected', optionId: allow.optionId } } };
  }
  const reject = options.find(o => o.kind === 'reject_once') ?? options.find(o => o.kind === 'reject_always');
  return {
    response: reject
      ? { outcome: { outcome: 'selected', optionId: reject.optionId } }
      : { outcome: { outcome: 'cancelled' } },
    refused: toolCall.title ?? titleOf(toolCall.toolCallId) ?? kind ?? 'an unknown request',
  };
}

function isKidrawToolApproval(
  params: acp.RequestPermissionRequest,
  titleOf: (toolCallId: string) => string | undefined,
): boolean {
  const meta = params._meta as Record<string, unknown> | null | undefined;
  if (meta?.['is_mcp_tool_approval'] !== true) return false;
  const rawInput = params.toolCall.rawInput;
  if (rawInput && typeof rawInput === 'object' && 'serverName' in rawInput) {
    return (rawInput as { serverName: unknown }).serverName === KIDRAW_MCP_SERVER;
  }
  // Approval for a call already announced: its title names the server,
  // e.g. "kidraw.get_outline" or "mcp__kidraw__get_outline".
  const title = titleOf(params.toolCall.toolCallId) ?? '';
  return new RegExp(`(^|[^a-z0-9])${KIDRAW_MCP_SERVER}([^a-z0-9]|$)`, 'i').test(title);
}
