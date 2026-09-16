/*
 * What each browser test covers, and whether it is currently trustworthy.
 *
 * `region` is the part of the app a script guards. It is the column that
 * matters when restructuring `drawing-area.component.ts`: before moving a
 * region's code, run its region here and get it green first.
 *
 * `status`:
 *   'suite'  — in the regression suite.
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
  // ── Move-by-node grid overlay (drawing-area.component.ts ~5342-7417) ──
  { script: 'repro-grid-nav.js', region: 'grid-overlay', status: 'suite', baseline: { passed: 7, failed: 3, code: 1 } },
  { script: 'repro-quadrant-grid-nav.js', region: 'grid-overlay', status: 'suite', baseline: { passed: 9, failed: 2, code: 1 } },
  { script: 'repro-quadrant-ring-nav.js', region: 'grid-overlay', status: 'suite', baseline: { passed: 4, failed: 1, code: 1 } },
  { script: 'repro-gather-fisheye.js', region: 'grid-overlay', status: 'suite' },
  { script: 'repro-nav-tiers.js', region: 'grid-overlay', status: 'suite' },
  { script: 'repro-normal-movement-goal.js', region: 'grid-overlay', status: 'suite', baseline: { passed: 0, failed: 0, code: 1 } },

  // ── Nav popup and view centring (~365-1667, ~3979-4518) ──
  { script: 'repro-nav-popup.js', region: 'nav-popup', status: 'suite', baseline: { passed: 7, failed: 30, code: 1 } },
  { script: 'repro-nav-margin.js', region: 'nav-popup', status: 'suite' },
  { script: 'repro-recenter-crosshairs.js', region: 'nav-popup', status: 'suite', baseline: { passed: 4, failed: 1, code: 1 } },

  // ── In-graph search (~2126-3724) ──
  { script: 'repro-search-recenter.js', region: 'search', status: 'suite', baseline: { passed: 2, failed: 4, code: 1 } },

  // ── Drag, grow ghosts, quick add (~7424-8753) ──
  { script: 'repro-coarse-drag.js', region: 'drag-and-grow', status: 'suite', baseline: { passed: 16, failed: 1, code: 1 } },
  { script: 'repro-grow-mode.js', region: 'drag-and-grow', status: 'suite', baseline: { passed: 8, failed: 17, code: 1 } },
  { script: 'repro-grow-ghost-targets.js', region: 'drag-and-grow', status: 'suite' },
  { script: 'repro-add-insert-taps.js', region: 'drag-and-grow', status: 'suite', baseline: { passed: 2, failed: 5, code: 1 } },
  { script: 'repro-add-zoom-ghost.js', region: 'drag-and-grow', status: 'suite' },
  { script: 'repro-area-select.js', region: 'drag-and-grow', status: 'suite' },

  // ── Edges, waypoints, routing ──
  { script: 'repro-second-waypoint.js', region: 'edges', status: 'suite' },
  { script: 'repro-waypoint-select.js', region: 'edges', status: 'suite' },
  { script: 'repro-edge-label-anchors.js', region: 'edges', status: 'suite', baseline: { passed: 12, failed: 3, code: 1 } },
  { script: 'repro-edge-direction-colors.js', region: 'edges', status: 'suite' },
  { script: 'repro-da-259-arrowhead.js', region: 'edges', status: 'suite' },
  { script: 'repro-layout-clear.js', region: 'edges', status: 'suite', baseline: { passed: 6, failed: 1, code: 1 } },
  { script: 'repro-tree-crossings.js', region: 'edges', status: 'suite', baseline: { passed: 0, failed: 1, code: 1 } },

  // ── Keymenu and key handling ──
  { script: 'repro-binding-reorg.js', region: 'keys', status: 'suite', baseline: { passed: 13, failed: 2, code: 1 } },
  { script: 'repro-compact-keymenu.js', region: 'keys', status: 'suite' },
  { script: 'repro-compact-viewport.js', region: 'keys', status: 'suite' },
  { script: 'repro-da-161-clipboard.js', region: 'keys', status: 'suite', baseline: { passed: 2, failed: 0, code: 1 } },
  { script: 'repro-da-163-quote.js', region: 'keys', status: 'suite' },
  { script: 'repro-da-163-quote2.js', region: 'keys', status: 'suite' },
  { script: 'repro-da-165-ex-line.js', region: 'keys', status: 'suite' },
  { script: 'repro-da-182-speed-while-held.js', region: 'keys', status: 'suite' },
  { script: 'repro-da-265-vim-bindings.js', region: 'keys', status: 'suite' },
  { script: 'repro-da-272-cut-copy.js', region: 'keys', status: 'suite' },
  { script: 'repro-da-343-vim-operators.js', region: 'keys', status: 'suite' },
  { script: 'repro-da-347-repeat-interval.js', region: 'keys', status: 'suite' },
  { script: 'repro-repeat-release-order.js', region: 'keys', status: 'suite' },

  // ── Labels and editing ──
  { script: 'repro-label-edit-flow.js', region: 'labels', status: 'suite', baseline: { passed: 16, failed: 2, code: 1 } },
  { script: 'repro-da-345-connect-focus.js', region: 'labels', status: 'suite' },

  // ── Selection, crosshairs, viewport ──
  { script: 'repro-da-243-selection-visibility.js', region: 'selection', status: 'suite' },
  { script: 'repro-da-257-panzoom-crosshairs.js', region: 'selection', status: 'suite' },
  { script: 'repro-viewport-persist.js', region: 'selection', status: 'suite' },

  // ── Graph types ──
  { script: 'repro-task-status.js', region: 'graph-types', status: 'suite' },

  // ── Snapshots of one day's "Next" list, kept for the record ──
  { script: 'repro-next-five.js', region: 'dated-snapshots', status: 'oneoff', note: '2026-08-03 Next items' },
  { script: 'repro-next-items.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'repro-2026-08-08-next.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'repro-2026-08-08-next-round2.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'repro-2026-08-09-next-round2.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'repro-2026-08-09-next-round3.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'repro-2026-08-09-next-round4.js', region: 'dated-snapshots', status: 'oneoff' },
  { script: 'repro-2026-08-10-next.js', region: 'dated-snapshots', status: 'oneoff' },
];
