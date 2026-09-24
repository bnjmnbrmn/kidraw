/*
 * The tools-facing surface of DrawingAreaComponent.
 *
 * `private` in TypeScript is a compile-time fiction. The browser scripts under
 * tools/ reach into the component through window.ng.getComponent, where every
 * method is public, so a rename that the TypeScript compiler waves through can
 * still break a dozen scripts at runtime. That has now happened twice on the
 * refactoring branch: `handleCommands` → `handleCommand`, and `dragSelected`
 * changing its axis parameter from a string to an object. Both greps covered
 * .ts and .html; neither covered .js.
 *
 * So the surface is written down. This test needs no browser: it reads the
 * component source and checks that every name below is still declared, and
 * separately reports any *new* component call appearing in tools/ that is not
 * on the list — which is either a name to add here, or a script reaching for
 * something it should not.
 *
 * Adding to this list is cheap. Removing from it means finding the callers.
 */
const {readFileSync, readdirSync, statSync} = require('fs');
const {join, resolve} = require('path');

const REPO = resolve(__dirname, '../../..');
const COMPONENT = join(REPO, 'src/app/drawing-area/drawing-area.component.ts');

/** Methods the tools/ scripts call on DrawingAreaComponent. */
const TOOLS_FACING = [
  'addLabel',
  'checkResizeHandleProximity',
  'clearCrosshairHoverHighlight',
  'clearNormalMovementGoal',
  'crosshairHoverTarget',
  'crosshairsInLayerCoords',
  'dragSelected',
  'finishTweens',
  'fitViewToContent',
  'getDAEdgesContainingCrosshairs',
  'getDANodesContainingCrosshairs',
  'getNodeCenterInLayerCoordinates',
  'getNodeCenterInStageCoordinates',
  'handleCommand',
  'insertWaypointAtCrosshairs',
  'moveCrosshairsBy',
  'refreshCrosshairHoverHighlight',
  'refreshLabelEditGhost',
  'refreshNavigationLandingGhost',
  'viewCenterX',
  'viewCenterY',
  'viewMaxY',
  'viewMinY',
];

/**
 * Overlay fields the scripts read through, and what each now holds.
 *
 * These are not methods, so the call-shaped check below cannot see them. They
 * were renamed and wrapped in an Overlay, which broke
 * drag-and-grow/grow-ghost-targets.js at runtime — the third time a rename
 * that compiled cleanly broke a browser script.
 */
const TOOLS_FACING_FIELDS = [
  'growGhost',
  'hoverTrace',
  'goalLine',
  'labelEditGhost',
  'navigationLandingGhost',
  'navGhost',
];

/**
 * Component fields the scripts must NOT reach for, and what to call instead.
 *
 * `tweens` was read by seventeen scripts as
 * `da.tweens.forEach(t => t.finish()); da.tweens = []` — which is exactly
 * `finishTweens()`. When the array moved into Animations they all broke at
 * once. Listing the retired names here turns the next such move into a failing
 * check rather than five red scripts.
 */
const RETIRED_FIELDS = {
  tweens: 'call finishTweens() instead',
  currentDragRafId: 'the drag loop is owned by Animations',
  crosshairHoverHighlight: 'use hoverTrace.node',
  navGhostGroup: 'use navGhost.node',
  normalMovementGoalLine: 'use goalLine.node',
  linkNavSource: 'use linkNav.active; the source is the controller\'s own',
  linkNavQuadrantLines: 'the overlay moved into LinkNavController',
  linkNavDirectionalFocus: 'internal to LinkNavController',
  graphNavEdge: 'use journey.focusedEdge',
  graphNavMomentum: 'use journey.momentum',
  graphNavLastNode: 'use journey.lastNodeAmong(nodes)',
  navDirection: 'use journey.direction',
  navHistory: 'the jumplist is private to NavJourney',
};

/** Receivers the scripts use for the component, for the reverse check. */
const RECEIVERS = ['da', 'c', 'comp', 'daComp', 'component'];
/** Things reached through those names that belong to other objects. */
const NOT_OURS = new Set(['addEventListener', 'navStops', 'querySelector', 'then', 'catch']);

/**
 * Every script under tools/, skipping what is not a hand-written driver:
 * dot-directories (build caches), `archive/` (dated snapshots, never run), and
 * this file, which names the retired fields in order to forbid them.
 */
function jsFilesUnder(dir) {
  return readdirSync(dir).flatMap(entry => {
    if (entry.startsWith('.') || entry === 'archive') return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return jsFilesUnder(path);
    if (path === __filename) return [];
    return /\.(js|mjs)$/.test(entry) ? [path] : [];
  });
}

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const source = readFileSync(COMPONENT, 'utf8');
const declares = name =>
  new RegExp(`^\\s{2}(?:private |public |protected |async |static )*${name}\\s*[(<]`, 'm').test(source);

const missing = TOOLS_FACING.filter(name => !declares(name));
check('every tools-facing method is still declared on the component',
  missing.length === 0,
  missing.length ? `gone: ${missing.join(', ')}` : `${TOOLS_FACING.length} checked`);

const fieldsMissing = TOOLS_FACING_FIELDS.filter(name =>
  !new RegExp(`^\\s{2}(?:private |readonly |public |protected )*${name}\\s*[:=]`, 'm').test(source));
check('every tools-facing field is still declared on the component',
  fieldsMissing.length === 0,
  fieldsMissing.length ? `gone: ${fieldsMissing.join(', ')}` : `${TOOLS_FACING_FIELDS.length} checked`);

// An Overlay is reached as `.node`; reading it bare returns the wrapper and
// silently does nothing useful.
const bareOverlayReads = [];
for (const file of jsFilesUnder(join(REPO, 'tools'))) {
  const text = readFileSync(file, 'utf8');
  for (const name of TOOLS_FACING_FIELDS) {
    if (new RegExp(`\\.${name}\\s*(\\?\\.)?(find|getChildren|destroy|getAttr|children)\\b`).test(text)) {
      bareOverlayReads.push(`${file.slice(REPO.length + 1)}: .${name}`);
    }
  }
}
const retired = [];
for (const file of jsFilesUnder(join(REPO, 'tools'))) {
  const text = readFileSync(file, 'utf8');
  for (const [name, advice] of Object.entries(RETIRED_FIELDS)) {
    if (new RegExp(`\\.${name}\\b`).test(text)) {
      retired.push(`${file.slice(REPO.length + 1)}: .${name} — ${advice}`);
    }
  }
}
check('no script reads a retired component field',
  retired.length === 0,
  retired.length ? retired.join('; ') : `${Object.keys(RETIRED_FIELDS).length} checked`);

check('no script reaches through an Overlay without .node',
  bareOverlayReads.length === 0,
  bareOverlayReads.length ? bareOverlayReads.join('; ') : 'none');

const known = new Set(TOOLS_FACING);
const pattern = new RegExp(`\\b(?:${RECEIVERS.join('|')})\\.([a-zA-Z_][a-zA-Z0-9_]*)\\(`, 'g');
const seen = new Set();
for (const file of jsFilesUnder(join(REPO, 'tools'))) {
  for (const [, name] of readFileSync(file, 'utf8').matchAll(pattern)) {
    if (!known.has(name) && !NOT_OURS.has(name) && declares(name)) seen.add(name);
  }
}
check('no unlisted component method is called from tools/',
  seen.size === 0,
  seen.size ? `add to TOOLS_FACING: ${[...seen].sort().join(', ')}` : 'none');

console.log(`\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
