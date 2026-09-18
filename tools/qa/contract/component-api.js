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
  'crosshairsInLayerCoords',
  'dragSelected',
  'finishTweens',
  'fitViewToContent',
  'getDAEdgesContainingCrosshairs',
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

/** Receivers the scripts use for the component, for the reverse check. */
const RECEIVERS = ['da', 'c', 'comp', 'daComp', 'component'];
/** Things reached through those names that belong to other objects. */
const NOT_OURS = new Set(['addEventListener', 'navStops', 'querySelector', 'then', 'catch']);

function jsFilesUnder(dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return jsFilesUnder(path);
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
