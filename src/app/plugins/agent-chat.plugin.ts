import { KidrawPlugin } from './plugin.model';

/**
 * Agent mode as a plugin (Ben, 2026-09-23: "an AI chat plugin, encapsulating
 * the AI work we've already done"). The chat, asking about the selection,
 * following the agent, and its edits all live in src/app/agent/; this is the
 * switch for them. Off, its keys leave the keymenu and any session ends.
 * Nothing connects anywhere until you configure an endpoint, on or off.
 */
export const AGENT_CHAT_PLUGIN: KidrawPlugin = {
  id: 'agent-chat',
  name: 'AI Chat',
  description: 'Ask an agent about the graph and let it point, caption and edit — through your own agent server',
  feature: true,
  nodeDefaults: {},
};
