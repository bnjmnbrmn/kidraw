import { NodeShape, TextOverflowMode } from '../drawing-area/command.model';

/** Node style defaults an extension contributes. All fields optional so an
 *  extension overrides only what it cares about; anything unset falls through
 *  to the app defaults (see APP_NODE_DEFAULTS in snapshot-mapping). */
export interface ExtensionNodeDefaults {
  shape?: NodeShape;
  width?: number;
  height?: number;
  fontSize?: number;
  textOverflow?: TextOverflowMode;
}

/**
 * A kidraw extension (see notes/idea-diagram-types.md).
 *
 * One concept with typed contribution points, each with its own conflict
 * semantics. This slice implements two of them:
 *
 *   - identity: exactly one extension is bound as a graph's diagram type
 *     (`type:` in the graph doc, implicit `default` when absent). Binding an
 *     identity restyles existing nodes (undoably) and its defaults apply to
 *     nodes created later.
 *   - style defaults + persistence policy: node style props resolve through
 *     the cascade app -> identity -> per-node file props, and props equal to
 *     their resolved default are omitted on save (so derived values, e.g.
 *     fit-mode card sizes, never persist).
 *
 * Future contribution points (commands, keymenu entries, node/edge kinds,
 * tags, validation) extend this interface rather than adding new concepts.
 */
export interface KidrawExtension {
  id: string;
  name: string;
  nodeDefaults: ExtensionNodeDefaults;
}
