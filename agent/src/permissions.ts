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
 * tools and shell commands that only read files in the workspace (see
 * isReadOnlyCommand). Everything else is refused, including edits, other
 * commands, network access,
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
  const readOnlyCommand = kind === 'execute' && isReadOnlyCommandRequest(toolCall.rawInput);
  if ((kind !== undefined && SAFE_KINDS.has(kind)) || readOnlyCommand || isKidrawToolApproval(params, titleOf)) {
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

/** Programs that only read. `sed` and `find` are further restricted below. */
const READ_PROGRAMS = new Set([
  'cat', 'head', 'tail', 'sed', 'grep', 'rg', 'ls', 'find', 'wc', 'nl', 'echo', 'printf', 'pwd', 'sort', 'uniq',
  'cut', 'tree', 'git',
]);
const GIT_READ_COMMANDS = new Set(['log', 'show', 'diff', 'status', 'blame', 'ls-files', 'grep', 'rev-parse']);
const FIND_WRITES = /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/;

/**
 * A shell command an agent asks to run outside its own sandbox, which inside
 * a session container fails to start. Approved only when every part of it
 * just reads files under the workspace: read-only programs, no redirection,
 * substitution or backgrounding, and no paths outside /workspace (so not the
 * session's Codex login either).
 */
export function isReadOnlyCommandRequest(rawInput: unknown): boolean {
  if (!rawInput || typeof rawInput !== 'object') return false;
  const { command, cwd } = rawInput as { command?: unknown; cwd?: unknown };
  if (typeof cwd === 'string' && !cwd.startsWith('/workspace')) return false;
  const text = Array.isArray(command) ? command.join(' ') : command;
  return typeof text === 'string' && isReadOnlyCommand(text);
}

export function isReadOnlyCommand(command: string): boolean {
  let text = command.trim();
  // codex-acp sends the command quoted as one shell word.
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replace(/\\"/g, '"');
  if (/[<>`]|\$\(|(^|[^&])&($|[^&])/.test(text)) return false;
  const segments = text.split(/&&|\|\||[;|\n]/).map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every(segment => {
    const words = segment.match(/'[^']*'|"[^"]*"|\S+/g) ?? [];
    const unquoted = words.map(w => (/^(['"]).*\1$/.test(w) ? w.slice(1, -1) : w));
    const program = unquoted[0]?.split('/').pop() ?? '';
    if (!READ_PROGRAMS.has(program)) return false;
    const args = unquoted.slice(1);
    if (args.some(arg => arg.includes('..') || arg.startsWith('~') || (arg.startsWith('/') && !arg.startsWith('/workspace')))) {
      return false;
    }
    if (program === 'sed') return args.includes('-n') && !args.some(arg => /^-i|--in-place/.test(arg) || /[we]\s*$|\bw\s/.test(arg));
    if (program === 'find') return !args.some(arg => FIND_WRITES.test(arg));
    if (program === 'rg') return !args.some(arg => arg.startsWith('--pre'));
    if (program === 'git') {
      const sub = args.find(arg => !arg.startsWith('-'));
      return !args.some(arg => arg === '-c' || arg.startsWith('--output') || arg === '--ext-diff' || arg.startsWith('--exec'))
        && sub !== undefined && GIT_READ_COMMANDS.has(sub) && args.indexOf(sub) === args.findIndex(a => !a.startsWith('-'));
    }
    return true;
  });
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
