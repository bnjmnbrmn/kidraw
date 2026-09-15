/**
 * A scripted ACP agent for tests: no model, no credits.
 *
 * On `session/new` it connects to the KiDraw MCP endpoint it was given. Each
 * prompt line of the form `TOOL <name> <json-args>` calls that tool and replies
 * with the result; any other text is echoed back.
 */
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

let mcp: Client | null = null;
const SESSION_ID = 'fake-session';

async function connectMcp(server: acp.McpServer): Promise<void> {
  if (!('url' in server)) throw new Error('fake agent only supports HTTP MCP servers');
  const headers = Object.fromEntries(server.headers.map(h => [h.name, h.value]));
  const transport = new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers } });
  mcp = new Client({ name: 'fake-agent', version: '0.0.0' });
  await mcp.connect(transport);
}

function promptText(prompt: acp.ContentBlock[]): string {
  return prompt.map(block => (block.type === 'text' ? block.text : '')).join('\n');
}

const stream = acp.ndJsonStream(
  Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
  Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
);

acp.agent({ name: 'fake-agent' })
  .onRequest(acp.methods.agent.initialize, () => ({ protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: {} }))
  .onRequest(acp.methods.agent.session.new, async ctx => {
    const server = ctx.params.mcpServers[0];
    if (server) await connectMcp(server);
    return { sessionId: SESSION_ID };
  })
  .onRequest(acp.methods.agent.session.prompt, async ctx => {
    const say = (text: string) => ctx.client.notify(acp.methods.client.session.update, {
      sessionId: SESSION_ID,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
    });
    for (const line of promptText(ctx.params.prompt).split('\n')) {
      const match = /^TOOL (\w+)\s*(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, name, json] = match;
      const result = await mcp!.callTool({ name, arguments: json ? JSON.parse(json) : {} });
      const text = (result.content as { type: string; text?: string }[]).map(c => c.text ?? '').join('');
      await say(`${result.isError ? 'ERROR' : 'RESULT'} ${name}: ${text}\n`);
    }
    const last = promptText(ctx.params.prompt).trim().split('\n').pop() ?? '';
    if (!last.startsWith('TOOL ')) await say(`echo: ${last}`);
    return { stopReason: 'end_turn' as const };
  })
  .connect(stream);
