/**
 * Style cascade resolver.
 *
 * Given a top-level style (external or inline) + a way to resolve its
 * imports, produce a single merged KidrawStyleSet representing the
 * cascaded result. See kidraw-file-format.md → "How style sets compose".
 *
 * Rules:
 *   - Depth-first import walk.
 *   - Source order = cascade order: later wins on conflicts.
 *   - A style's own rules apply AFTER its imports, so it overrides them.
 *   - Each imported path is visited at most once (subsequent encounters
 *     are no-ops).
 *   - Cycles (a path that's currently in the DFS stack) are rejected.
 *
 * Tag-style flattening (resolveAndApplyToGraph): after the cascade,
 * matching tagStyles are folded into per-element rules in tag-order
 * (as declared on the node/edge), and then the per-element rules from
 * the cascade override them. Element-specific beats tag-style within
 * a single file too, because the per-element layer is applied last.
 */

import {
  EdgeStyleProps,
  InlineStyleSet,
  KidrawGraphDoc,
  KidrawStyleSet,
  NodeStyleProps,
  ParseResult,
  StyleProps,
  fail,
  inlineToStyleSet,
  ok,
} from './types';

export type ImportResolver = (path: string) => KidrawStyleSet | null;

/** Walk the import graph and merge rules into a single style. */
export function resolveStyleCascade(
  root: KidrawStyleSet | InlineStyleSet,
  resolveImport: ImportResolver,
): ParseResult<KidrawStyleSet> {
  const merged: KidrawStyleSet = { kdStyle: 1 };
  const loaded = new Set<string>();
  const stack = new Set<string>();
  const rootStyle = toStyleSet(root);
  const err = walk(rootStyle, undefined, merged, loaded, stack, resolveImport);
  return err ? fail(err) : ok(merged);
}

/**
 * Cascade the style, then flatten tagStyles onto per-element rules
 * (using the graph's tag declarations). Returns a style set in which
 * `tagStyles` is dropped and `nodes`/`edges` contain the final
 * properties to apply to each element. Element ids with no
 * applicable rules are omitted.
 */
export function resolveAndApplyToGraph(
  graph: KidrawGraphDoc,
  root: KidrawStyleSet | InlineStyleSet,
  resolveImport: ImportResolver,
): ParseResult<KidrawStyleSet> {
  const cascaded = resolveStyleCascade(root, resolveImport);
  if (!cascaded.ok) return cascaded;
  return ok(flattenTagStyles(graph, cascaded.value));
}

// ─── Internals ───────────────────────────────────────────────────────────

function toStyleSet(input: KidrawStyleSet | InlineStyleSet): KidrawStyleSet {
  if ('kdStyle' in input) return input as KidrawStyleSet;
  return inlineToStyleSet(input as InlineStyleSet);
}

function walk(
  style: KidrawStyleSet,
  currentPath: string | undefined,
  merged: KidrawStyleSet,
  loaded: Set<string>,
  stack: Set<string>,
  resolveImport: ImportResolver,
): string | null {
  if (currentPath !== undefined) {
    if (stack.has(currentPath)) {
      return `Import cycle detected at "${currentPath}"`;
    }
    if (loaded.has(currentPath)) {
      return null; // already merged via another branch
    }
    stack.add(currentPath);
  }

  for (const importPath of style.imports ?? []) {
    if (stack.has(importPath)) {
      return `Import cycle detected: "${importPath}"`;
    }
    if (loaded.has(importPath)) continue;
    const imported = resolveImport(importPath);
    if (!imported) {
      return `Cannot resolve import "${importPath}"`;
    }
    const err = walk(imported, importPath, merged, loaded, stack, resolveImport);
    if (err) return err;
  }

  applyOwnRules(style, merged);

  if (currentPath !== undefined) {
    stack.delete(currentPath);
    loaded.add(currentPath);
  }
  return null;
}

function applyOwnRules(src: KidrawStyleSet, dst: KidrawStyleSet): void {
  if (src.tagStyles) {
    if (!dst.tagStyles) dst.tagStyles = {};
    for (const [tag, props] of Object.entries(src.tagStyles)) {
      dst.tagStyles[tag] = { ...dst.tagStyles[tag], ...props };
    }
  }
  if (src.nodes) {
    if (!dst.nodes) dst.nodes = {};
    for (const [id, props] of Object.entries(src.nodes)) {
      dst.nodes[id] = { ...dst.nodes[id], ...props };
    }
  }
  if (src.edges) {
    if (!dst.edges) dst.edges = {};
    for (const [id, props] of Object.entries(src.edges)) {
      dst.edges[id] = { ...dst.edges[id], ...props };
    }
  }
  if (src.view) {
    dst.view = src.view; // later view wins entirely
  }
  // `imports` is purely a traversal aid — never carried into the merged result.
}

function flattenTagStyles(graph: KidrawGraphDoc, cascade: KidrawStyleSet): KidrawStyleSet {
  const out: KidrawStyleSet = { kdStyle: 1 };
  if (cascade.view) out.view = cascade.view;

  const nodesOut: { [id: string]: NodeStyleProps } = {};
  for (const [id, semantics] of Object.entries(graph.semantics.nodes)) {
    let resolved: NodeStyleProps = {};
    for (const tag of semantics.tags ?? []) {
      const tagRule = cascade.tagStyles?.[tag];
      if (tagRule) resolved = { ...resolved, ...(tagRule as NodeStyleProps) };
    }
    const elementRule = cascade.nodes?.[id];
    if (elementRule) resolved = { ...resolved, ...elementRule };
    if (Object.keys(resolved).length > 0) nodesOut[id] = resolved;
  }
  if (Object.keys(nodesOut).length > 0) out.nodes = nodesOut;

  const edgesOut: { [id: string]: EdgeStyleProps } = {};
  for (const [id, semantics] of Object.entries(graph.semantics.edges)) {
    let resolved: EdgeStyleProps = {};
    for (const tag of semantics.tags ?? []) {
      const tagRule = cascade.tagStyles?.[tag];
      if (tagRule) resolved = { ...resolved, ...(tagRule as EdgeStyleProps) };
    }
    const elementRule = cascade.edges?.[id];
    if (elementRule) resolved = { ...resolved, ...elementRule };
    if (Object.keys(resolved).length > 0) edgesOut[id] = resolved;
  }
  if (Object.keys(edgesOut).length > 0) out.edges = edgesOut;

  return out;
}
