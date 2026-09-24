/**
 * Commands that plugins bring (notes/design-plugins.md).
 *
 * A plugin names its own commands, namespaced by the plugin — `todo.setStatus`
 * (Ben, 2026-09-23) — so core keeps a closed list of its own and never has to
 * know what plugins do. Core carries a plugin command as one kind,
 * `PLUGIN_COMMAND`, holding a call: the command's id and its arguments.
 *
 * Each plugin declares its commands' argument types by adding to
 * `PluginCommandArgs` from its own file, so a call is type-checked end to end:
 *
 *     declare module './plugin-commands' {
 *       interface PluginCommandArgs {
 *         'todo.setStatus': {status: TaskStatus};
 *       }
 *     }
 */
import {joinDisjoint} from '../drawing-area/command-handlers';
import type {KidrawPlugin} from './plugin.model';
import type {PluginHost} from './plugin-host';

/** Every plugin command's id, mapped to its arguments. Plugins add to it. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PluginCommandArgs {}

export type PluginCommandId = keyof PluginCommandArgs & string;

/** One call of a plugin command: which, and with what. */
export type PluginCommandCall = {
  [K in PluginCommandId]: {id: K; args: PluginCommandArgs[K]};
}[PluginCommandId];

/** What a plugin runs for each of its commands. */
export type PluginCommandHandlers = {
  [K in PluginCommandId]?: (args: PluginCommandArgs[K]) => void;
};

/**
 * Every registered plugin's commands in one table. A command has exactly one
 * owner: two plugins claiming the same id is refused when the table is built.
 */
export class PluginCommands {
  private readonly table: Record<string, (args: unknown) => void>;

  constructor(host: PluginHost, plugins: Iterable<KidrawPlugin>) {
    this.table = joinDisjoint([...plugins].map(plugin => plugin.commands?.(host) ?? {}), 'plugins') as
      Record<string, (args: unknown) => void>;
  }

  /** Whether some plugin brought this command. */
  has(id: string): boolean {
    return id in this.table;
  }

  /** Run the call if a plugin owns it. False when none does. */
  run(call: PluginCommandCall): boolean {
    const handler = this.table[call.id];
    handler?.(call.args);
    return handler !== undefined;
  }
}
