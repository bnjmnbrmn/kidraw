/**
 * Which key each entry of a plugin's menu goes on.
 *
 * The rule, in order (Ben, 2026-09-23): don't clash, be ergonomic, be
 * memorable. So a key already taken is never used; only the profile's
 * ergonomic keys for this position are offered, best first; and among those,
 * an entry gets the key it suggests (a mnemonic) when that key is still free.
 * Everything else takes the first free ergonomic key, in the plugin's order.
 * Entries left over when the keys run out are returned, not dropped silently.
 */

/** A menu entry: its label, and perhaps a key it would like. */
export interface KeyedEntry {
  label: string;
  /** A memorable key for this entry. Honoured only if it is ergonomic here
   *  and free. */
  key?: string;
}

export interface MenuKeys<E> {
  placed: {key: string; entry: E}[];
  /** Entries no key was left for. */
  unplaced: E[];
}

export function assignMenuKeys<E extends KeyedEntry>(
  entries: readonly E[],
  ergonomic: readonly string[],
  taken: ReadonlySet<string> = new Set(),
): MenuKeys<E> {
  const free = ergonomic.filter(key => !taken.has(key));
  const chosen = suggestedKeys(entries, free);
  const unused = free.filter(key => ![...chosen.values()].includes(key));
  const placed: {key: string; entry: E}[] = [];
  const unplaced: E[] = [];
  for (const entry of entries) {
    const key = chosen.get(entry) ?? unused.shift();
    if (key === undefined) unplaced.push(entry); else placed.push({key, entry});
  }
  return {placed, unplaced};
}

/** The entries whose suggested key is free and ergonomic here, each with that
 *  key. When two suggest the same key, the first entry gets it. */
function suggestedKeys<E extends KeyedEntry>(entries: readonly E[], free: readonly string[]): Map<E, string> {
  const chosen = new Map<E, string>();
  for (const entry of entries) {
    const wanted = entry.key;
    if (wanted !== undefined && free.includes(wanted) && ![...chosen.values()].includes(wanted)) {
      chosen.set(entry, wanted);
    }
  }
  return chosen;
}
