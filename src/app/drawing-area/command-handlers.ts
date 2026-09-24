/**
 * Commands dispatched through a table instead of a switch.
 *
 * Each owner — crosshairs movement, text editing, files… — contributes a
 * slice: an object from command kinds to handlers. `mergeCommandSlices` joins
 * the slices and refuses a kind claimed twice; assigning the result to
 * `CommandHandlers` refuses a kind nobody claimed, at compile time. Together
 * they keep what the old switch's `assertNever` gave — every command handled —
 * and add what a switch cannot: each owner's commands in one place, which is
 * the seam plugins will register into (notes/design-plugins.md).
 */
import {DACommand} from './command.model';

/** The kinds a command can have. Taken from the `DACommand` union rather than
 *  the `DACommandType` enum: an enum member with no command shape can never
 *  be sent, so it needs no handler. */
type CommandKind = DACommand['kind'];

/** What runs one kind of command, given the command with its payload. */
export type CommandHandler<K extends CommandKind> = (command: Extract<DACommand, {kind: K}>) => void;

/** One handler for every command kind. */
export type CommandHandlers = {[K in CommandKind]: CommandHandler<K>};

/** One owner's share of the table. Write a slice as an object literal that
 *  `satisfies CommandSlice`, so each handler's parameter is typed by its key. */
export type CommandSlice = Partial<CommandHandlers>;

/** The intersection of a union's members: `A | B` becomes `A & B`. Merged
 *  slices have every slice's keys, so their type is the intersection. */
type Intersection<U> = (U extends unknown ? (member: U) => void : never) extends (all: infer I) => void ? I : never;

/** Join slices into one table. Throws when two slices claim the same kind:
 *  a command has exactly one owner. */
export function mergeCommandSlices<S extends CommandSlice[]>(...slices: S): Intersection<S[number]> {
  return joinDisjoint(slices, 'command slices') as Intersection<S[number]>;
}

/** Join tables of handlers into one, refusing a key that two of them claim.
 *  `owners` names them for the error: "Two plugins claim todo.setStatus". */
export function joinDisjoint(tables: readonly object[], owners: string): Record<string, unknown> {
  const joined: Record<string, unknown> = {};
  for (const table of tables) {
    for (const [key, handler] of Object.entries(table)) {
      if (key in joined) throw new Error(`Two ${owners} claim ${key}`);
      joined[key] = handler;
    }
  }
  return joined;
}

/** Run the command's handler. */
export function runCommand(handlers: CommandHandlers, command: DACommand): void {
  (handlers[command.kind] as (command: DACommand) => void)(command);
}
