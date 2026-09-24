/*
 * What each browser test covers, and whether it is currently trustworthy.
 *
 * `region` is the part of the app a script guards. It is the column that
 * matters when restructuring `drawing-area.component.ts`: before moving a
 * region's code, run its region here and get it green first.
 *
 * `status`:
 *   'suite'      — in the regression suite.
 *   'diagnostic' — prints observations and asserts nothing, so it can never
 *                  fail. Useful while chasing a bug; worthless as a net, and
 *                  excluded so it cannot be mistaken for cover.
 *   'oneoff' — a snapshot of one day's work, kept for its record but not a
 *              statement about how the app should behave now.
 *
 * `baseline` is what a script scored on 2026-09-16, and appears only on the
 * sixteen that were already failing by then — nothing had run them together in
 * months. Such a script passes by not getting *worse*, so the suite is usable
 * today without pretending the app is sound. **A baseline is a debt, not a
 * pass:** the region it covers is only partly protected, and fixing the script
 * (or the app) means deleting the baseline line.
 */
export const SUITE = [
  // ── The tools-facing surface of DrawingAreaComponent (no browser needed) ──
  { script: 'contract/component-api.js', region: 'contract', status: 'suite' },

  // ── Move-by-node grid overlay (drawing-area.component.ts ~5342-7417) ──
  { script: 'grid-overlay/grid-nav.js', region: 'grid-overlay', status: 'suite' },
  { script: 'grid-overlay/quadrant-grid-nav.js', region: 'grid-overlay', status: 'suite' },
  { script: 'grid-overlay/quadrant-ring-nav.js', region: 'grid-overlay', status: 'suite' },
  { script: 'grid-overlay/gather-fisheye.js', region: 'grid-overlay', status: 'suite' },
  { script: 'grid-overlay/nav-tiers.js', region: 'grid-overlay', status: 'suite' },
  { script: 'grid-overlay/normal-movement-goal.js', region: 'grid-overlay', status: 'suite' },

  // ── Nav popup and view centring (~365-1667, ~3979-4518) ──
  { script: 'nav-popup/nav-popup.js', region: 'nav-popup', status: 'suite', baseline: { passed: 7, failed: 30, code: 1 } },
  { script: 'nav-popup/nav-margin.js', region: 'nav-popup', status: 'suite' },
  { script: 'nav-popup/recenter-crosshairs.js', region: 'nav-popup', status: 'suite' },

  // ── File, named graphs, diagram type (~1169-2139) ──
  { script: 'file/file-flows.js', region: 'file', status: 'suite' },

  // ── In-graph search (~2126-3724) ──
  { script: 'search/search-recenter.js', region: 'search', status: 'suite' },

  // ── Drag, grow ghosts, quick add (~7424-8753) ──
  { script: 'drag-and-grow/coarse-drag.js', region: 'drag-and-grow', status: 'suite', baseline: { passed: 16, failed: 1, code: 1 } },
  { script: 'drag-and-grow/grow-mode.js', region: 'drag-and-grow', status: 'suite', baseline: { passed: 8, failed: 17, code: 1 } },
  { script: 'drag-and-grow/grow-ghost-targets.js', region: 'drag-and-grow', status: 'suite' },
  { script: 'drag-and-grow/add-insert-taps.js', region: 'drag-and-grow', status: 'suite', baseline: { passed: 11, failed: 6, code: 1 },
    note: 'cases 1-3, 5 green after the 2026-09-17 rewrite; case 4 (tap i mode) and case 6 (v+o cycle) await a decision' },
  { script: 'drag-and-grow/add-zoom-ghost.js', region: 'drag-and-grow', status: 'suite' },
  { script: 'drag-and-grow/area-select.js', region: 'drag-and-grow', status: 'suite' },

  // ── Edges, waypoints, routing ──
  { script: 'edges/second-waypoint.js', region: 'edges', status: 'diagnostic' },
  { script: 'edges/waypoint-select.js', region: 'edges', status: 'diagnostic' },
  { script: 'edges/edge-label-anchors.js', region: 'edges', status: 'suite', baseline: { passed: 12, failed: 3, code: 1 } },
  { script: 'edges/edge-direction-colors.js', region: 'edges', status: 'suite' },
  { script: 'edges/arrowhead-placement.js', region: 'edges', status: 'suite' },
  { script: 'edges/layout-routing.js', region: 'edges', status: 'suite' },
  { script: 'edges/layout-clear.js', region: 'edges', status: 'suite', baseline: { passed: 6, failed: 1, code: 1 } },
  { script: 'edges/tree-crossings.js', region: 'edges', status: 'suite', baseline: { passed: 0, failed: 1, code: 1 } },

  // ── Keymenu and key handling ──
  { script: 'keys/binding-reorg.js', region: 'keys', status: 'suite', baseline: { passed: 13, failed: 2, code: 1 } },
  { script: 'keys/compact-keymenu.js', region: 'keys', status: 'suite' },
  { script: 'keys/compact-viewport.js', region: 'keys', status: 'suite' },
  { script: 'keys/clipboard-yank-paste.js', region: 'keys', status: 'suite', baseline: { passed: 2, failed: 0, code: 1 } },
  { script: 'keys/quote-key.js', region: 'keys', status: 'suite' },
  { script: 'keys/quote-key-shift-release.js', region: 'keys', status: 'diagnostic' },
  { script: 'keys/ex-line.js', region: 'keys', status: 'suite' },
  { script: 'keys/speed-while-held.js', region: 'keys', status: 'suite' },
  { script: 'keys/vim-bindings.js', region: 'keys', status: 'suite' },
  { script: 'keys/cut-copy.js', region: 'keys', status: 'suite' },
  { script: 'keys/vim-operators.js', region: 'keys', status: 'suite' },
  { script: 'keys/repeat-interval.js', region: 'keys', status: 'suite' },
  { script: 'keys/repeat-release-order.js', region: 'keys', status: 'suite' },

  // ── Labels and editing ──
  { script: 'labels/label-edit-flow.js', region: 'labels', status: 'suite', baseline: { passed: 16, failed: 2, code: 1 } },
  { script: 'labels/connect-focus.js', region: 'labels', status: 'suite' },

  // ── Selection, crosshairs, viewport ──
  { script: 'selection/selection-visibility.js', region: 'selection', status: 'suite' },
  { script: 'selection/panzoom-crosshairs.js', region: 'selection', status: 'suite' },
  { script: 'selection/viewport-persist.js', region: 'selection', status: 'suite' },
  { script: 'selection/overlap-targets.js', region: 'selection', status: 'suite' },

  // ── Graph types ──
  { script: 'graph-types/task-status.js', region: 'graph-types', status: 'suite' },
  { script: 'graph-types/plugin-settings.js', region: 'graph-types', status: 'suite' },
  { script: 'graph-types/markdown-math-plugins.js', region: 'graph-types', status: 'suite' },
  { script: 'graph-types/plugin-library.js', region: 'graph-types', status: 'suite' },
  { script: 'graph-types/ai-chat-plugin.js', region: 'graph-types', status: 'suite' },

  // ── Style: sizes, shapes, edge styles, colour, and the defaults ──
  { script: 'style/style-commands.js', region: 'style', status: 'suite' },

  // ── Agent mode: the canvas surface, without an agent server ──
  { script: 'agent/canvas-surface.js', region: 'agent', status: 'suite' },

  // ── Undo: one step per change ──
  { script: 'undo/one-step-per-change.js', region: 'undo', status: 'suite' },

  // ── Snapshots of one day's "Next" list, kept for the record ──
  { script: 'archive/2026-08-03-next-five.js', region: 'dated-snapshots', status: 'oneoff', note: '2026-08-03 Next items' },
  { script: 'archive/next-items.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'archive/2026-08-08-next.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'archive/2026-08-08-next-round2.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'archive/2026-08-09-next-round2.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'archive/2026-08-09-next-round3.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'archive/2026-08-09-next-round4.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'archive/2026-08-10-next.js', region: 'dated-snapshots', status: 'oneoff' },
];
