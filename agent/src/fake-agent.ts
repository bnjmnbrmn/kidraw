/**
 * A scripted ACP agent for tests: no model, no credits.
 *
 * It also stands in for the parts of a real agent the chat drives: two
 * settings (model and reasoning effort, plus a sandbox mode the tab must never
 * be offered) and a device-code sign-in. `FAKE_AGENT_SIGNIN=wait` makes the
 * sign-in hang on the user instead of completing, so a test can cancel it.
 *
 * On `session/new` it connects to the KiDraw MCP endpoint it was given. Prompt
 * lines are run in order: `TOOL <name> <json-args>` calls that tool and replies
 * with the result, and `WAIT <ms>` pauses (so a test can act mid-turn). A line
 * reading `FAIL` makes the turn fail. A last line `SHOW PROMPT` echoes the whole
 * prompt as the agent received it. Anything else is echoed back.
 */
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

let mcp: Client | null = null;
const SESSION_ID = 'fake-session';
const DEVICE_CODE_AUTH = 'chat-gpt-device-code';

/** Settings this agent offers. `agent_mode` is here because a real one offers
 *  it too: kidraw-agent must not pass it on to the tab. */
const configOptions: acp.SessionConfigOption[] = [
  {
    id: 'agent_mode', name: 'Agent mode', type: 'select', category: 'mode', currentValue: 'read-only',
    options: [{ value: 'read-only', name: 'Read only' }, { value: 'full-access', name: 'Full access' }],
  },
  {
    id: 'model', name: 'Model', type: 'select', category: 'model', currentValue: 'fake-small',
    options: [
      { value: 'fake-small', name: 'Small', description: 'cheap' },
      { value: 'fake-large', name: 'Large', description: 'costly' },
    ],
  },
  {
    id: 'reasoning_effort', name: 'Reasoning effort', type: 'select', category: 'thought_level', currentValue: 'low',
    options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }],
  },
];

function setConfigOption(id: string, value: unknown): void {
  const option = configOptions.find(o => o.id === id);
  if (option) (option as { currentValue: unknown }).currentValue = value;
}

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
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: {},
    authMethods: [{ id: DEVICE_CODE_AUTH, name: 'ChatGPT (device code)' }],
  }))
  .onRequest(acp.methods.agent.session.new, async ctx => {
    const server = ctx.params.mcpServers[0];
    if (server) await connectMcp(server);
    return { sessionId: SESSION_ID, configOptions };
  })
  .onRequest(acp.methods.agent.session.setConfigOption, ctx => {
    setConfigOption(ctx.params.configId, ctx.params.value);
    return { configOptions };
  })
  .onRequest(acp.methods.agent.logout, () => ({}))
  .onRequest(acp.methods.agent.authenticate, async ctx => {
    if (ctx.params.methodId !== DEVICE_CODE_AUTH) throw new Error(`fake agent has no "${ctx.params.methodId}" sign-in`);
    const elicitationId = 'fake-login';
    const answer: Promise<acp.CreateElicitationResponse> = ctx.client.request(acp.methods.client.elicitation.create, {
      mode: 'url' as const,
      // Scoped to this authenticate request, the way a real agent scopes it.
      requestId: ctx.requestId,
      elicitationId,
      url: 'https://example.invalid/device',
      message: 'Sign in and enter this code: FAKE-CODE',
    });
    // The real agent finishes when the code is entered; here, at once, unless
    // the test wants the sign-in left hanging so it can cancel it.
    if (process.env['FAKE_AGENT_SIGNIN'] !== 'wait') {
      await ctx.client.notify(acp.methods.client.elicitation.complete, { elicitationId });
    }
    if ((await answer).action !== 'accept') throw new Error('sign-in was canceled');
    return {};
  })
  .onRequest(acp.methods.agent.session.prompt, async ctx => {
    const say = (text: string) => ctx.client.notify(acp.methods.client.session.update, {
      sessionId: SESSION_ID,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
    });
    if (/^FAIL\b/m.test(promptText(ctx.params.prompt))) {
      throw new Error('fake agent was told to fail');
    }
    for (const line of promptText(ctx.params.prompt).split('\n')) {
      const wait = /^WAIT (\d+)$/.exec(line.trim());
      if (wait) {
        await new Promise(resolve => setTimeout(resolve, Number(wait[1])));
        continue;
      }
      const match = /^TOOL (\w+)\s*(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, name, json] = match;
      const result = await mcp!.callTool({ name, arguments: json ? JSON.parse(json) : {} });
      const text = (result.content as { type: string; text?: string }[]).map(c => c.text ?? '').join('');
      await say(`${result.isError ? 'ERROR' : 'RESULT'} ${name}: ${text}\n`);
    }
    const last = promptText(ctx.params.prompt).trim().split('\n').pop() ?? '';
    if (last === 'SHOW PROMPT') await say(promptText(ctx.params.prompt));
    else if (!last.startsWith('TOOL ')) await say(`echo: ${last}`);
    return { stopReason: 'end_turn' as const };
  })
  .connect(stream);
