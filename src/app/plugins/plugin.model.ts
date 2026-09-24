import { NodeShape, TextOverflowMode } from '../drawing-area/command.model';
import type { PluginCommandCall, PluginCommandHandlers } from './plugin-commands';
import type { KeyedEntry } from './menu-keys';
import type { PluginHost } from './plugin-host';

export type LabelFormat = 'plain' | 'markdown';

/** Node style defaults a plugin contributes. All fields optional so a
 *  plugin overrides only what it cares about; anything unset falls through
 *  to the app defaults (see APP_NODE_DEFAULTS in snapshot-mapping). */
export interface PluginNodeDefaults {
  shape?: NodeShape;
  width?: number;
  height?: number;
  fontSize?: number;
  textOverflow?: TextOverflowMode;
}

/** One choice within an exclusive tag group, with its badge presentation. */
export interface PluginTagChoice {
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

/** An exclusive family of semantic node tags a plugin contributes:
 *  a node carries at most one tag from the group, and setting a choice
 *  replaces any sibling (e.g. task status on todo graphs). */
export interface PluginTagGroup {
  id: string;
  name: string;
  choices: PluginTagChoice[];
}

/** A kind of edge a plugin contributes, marked by a semantic tag and
 *  drawn in its own colour (outranking directedness and theme colours). */
export interface PluginEdgeKind {
  /** The semantic tag edges of this kind carry (e.g. `explanation/supports`). */
  tag: string;
  name: string;
  /** Stroke colour: a mid tone that reads on both themes. */
  color: string;
  /** What the kind means, for help text and agents. */
  description: string;
  /** Background links (e.g. to a definition) are drawn faint unless
   *  emphasized: an end selected, highlighted while reading, or marked. */
  faint?: boolean;
}

/** A kind of node a plugin contributes (e.g. a definition), marked by a
 *  semantic tag: drawn with its colour on the border and its name in a badge. */
export interface PluginNodeKind {
  tag: string;
  name: string;
  /** Border and badge colour: a mid tone that reads on both themes. */
  color: string;
  /** What the kind is for, for help text and agents. */
  description: string;
}

/** Numbered tags that put nodes in an order (e.g. the steps of an
 *  explanation), drawn as a number badge on each node. */
export interface PluginReadingOrder {
  /** A step's tag is this prefix and its number: `step/` gives `step/1`,
   *  `step/2`… A node read more than once carries several. */
  tagPrefix: string;
  /** Badge fill: a mid tone that reads on both themes. */
  color: string;
}

/** One entry in a plugin's own menu, which root `t` opens while the plugin
 *  is the graph's diagram type. Keys are assigned by the keymenu
 *  (menu-keys.ts): never clashing, ergonomic, and the suggested `key` when
 *  that fits. */
export interface PluginMenuEntry extends KeyedEntry {
  call: PluginCommandCall;
}

/**
 * A kidraw plugin (see notes/idea-diagram-types.md).
 *
 * One concept with typed contribution points, each with its own conflict
 * semantics. This slice implements three of them:
 *
 *   - identity: exactly one plugin is bound as a graph's diagram type
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
export interface KidrawPlugin {
  id: string;
  name: string;
  /** One line on what the diagram type is for, for the plugin picker. */
  description?: string;
  /** Core plugins are always on; any other can be turned off in Settings
   *  (Ben, 2026-09-23). */
  core?: boolean;
  /** A feature that adds to graphs of other types (Markdown, Math), rather
   *  than a diagram type a graph can be bound to. */
  feature?: boolean;
  /** Plugins this one cannot work without. Switching it on switches them on;
   *  switching one of them off switches it off — each with a notice (Ben,
   *  2026-09-23). */
  requires?: string[];
  /** Plugins this one makes use of when they are on, and does without when
   *  they are off (Explanation uses Math). */
  uses?: string[];
  nodeDefaults: PluginNodeDefaults;
  /** 'markdown' renders **bold**, *italic* and `code` in node labels and edits
   *  them as highlighted monospace source. Default 'plain'. */
  labelFormat?: LabelFormat;
  tagGroups?: PluginTagGroup[];
  edgeKinds?: PluginEdgeKind[];
  nodeKinds?: PluginNodeKind[];
  readingOrder?: PluginReadingOrder;
  /** The commands it brings, given what it may use of the canvas. Ids are
   *  namespaced by the plugin (`todo.setStatus`); see plugin-commands.ts. */
  commands?: (host: PluginHost) => PluginCommandHandlers;
  /** Its own menu, in order (see PluginMenuEntry). */
  menu?: PluginMenuEntry[];
}
