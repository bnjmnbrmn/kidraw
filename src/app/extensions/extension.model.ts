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

/** One choice within an exclusive tag group, with its badge presentation. */
export interface ExtensionTagChoice {
  /** The semantic tag persisted on the node (e.g. `status/done`). */
  tag: string;
  /** Badge text (e.g. `DONE`). */
  label: string;
  /** Badge fill color; badge text is always white, so pick a mid tone that
   *  reads on both themes. */
  color: string;
  /** Dim the whole node and strike through its label (e.g. done tasks). */
  dims?: boolean;
}

/** An exclusive family of semantic node tags an extension contributes:
 *  a node carries at most one tag from the group, and setting a choice
 *  replaces any sibling (e.g. task status on todo graphs). */
export interface ExtensionTagGroup {
  id: string;
  name: string;
  choices: ExtensionTagChoice[];
}

/**
 * A kidraw extension (see notes/idea-diagram-types.md).
 *
 * One concept with typed contribution points, each with its own conflict
 * semantics. This slice implements three of them:
 *
 *   - identity: exactly one extension is bound as a graph's diagram type
 *     (`type:` in the graph doc, implicit `default` when absent). Binding an
 *     identity restyles existing nodes (undoably) and its defaults apply to
 *     nodes created later.
 *   - style defaults + persistence policy: node style props resolve through
 *     the cascade app -> identity -> per-node file props, and props equal to
 *     their resolved default are omitted on save (so derived values, e.g.
 *     fit-mode card sizes, never persist).
 *   - tag groups: exclusive semantic-tag families with badge presentation
 *     (e.g. the todo graph's task statuses).
 *
 * Future contribution points (commands, keymenu entries, node/edge kinds,
 * validation) extend this interface rather than adding new concepts.
 */
export interface KidrawExtension {
  id: string;
  name: string;
  nodeDefaults: ExtensionNodeDefaults;
  tagGroups?: ExtensionTagGroup[];
}
