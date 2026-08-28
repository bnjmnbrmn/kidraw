/**
 * Production environment.
 *
 * `false` — a hosted build must never post logs or, more importantly, a
 * visitor's draft graph to a collector. Being a primitive const, this
 * folds at build time and the guarded code leaves the bundle entirely.
 * See environment.ts.
 */
export const DEBUG_CHANNEL = false;
