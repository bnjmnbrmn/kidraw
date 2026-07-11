import { NodeShape, TextOverflowMode } from '../drawing-area/command.model';

/** Style defaults a plugin applies to nodes. All fields optional so a plugin
 *  overrides only what it cares about. */
export interface PluginNodeDefaults {
  shape?: NodeShape;
  width?: number;
  height?: number;
  fontSize?: number;
  textOverflow?: TextOverflowMode;
}

/**
 * A kidraw plugin (v0): a named bundle of style defaults.
 *
 * Applying a plugin restyles the current graph's nodes and records the plugin
 * id on the graph (persisted as `plugins` in the graph doc), so the defaults
 * keep applying to nodes created later and survive save/reopen.
 *
 * Future direction: once multi-file save preserves style imports, a plugin's
 * style half can migrate to an importable .kd-style set with cascade
 * `defaults`; the id-on-the-doc mechanism stays for behavioral defaults.
 */
export interface KidrawPlugin {
  id: string;
  name: string;
  nodeDefaults: PluginNodeDefaults;
}
