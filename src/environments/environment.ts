/**
 * Development environment.
 *
 * `DEBUG_CHANNEL` turns on the observation channel to the local collector
 * (tools/log-server.js): DebugLogService's POSTs and DraftStorageService's
 * draft mirror. Both are dev-box-only affordances — they let an agent on
 * the box read the log and the graph currently being edited.
 *
 * angular.json replaces this file with environment.prod.ts for the
 * production configuration. It is deliberately a top-level primitive const
 * rather than a property on an `environment` object: esbuild inlines the
 * primitive and drops the guarded branches, whereas an object property
 * read survives minification and leaves the collector URLs in the bundle.
 */
export const DEBUG_CHANNEL = true;
