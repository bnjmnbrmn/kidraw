import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = relative => readFileSync(resolve(here, '..', relative), 'utf8');

const drawingArea = read('src/app/drawing-area/drawing-area.component.ts');
const drawingLayer = read('src/app/drawing-area/drawing.layer.ts');

function methodBody(source, name, nextMarker) {
  const start = source.indexOf(name);
  assert.notEqual(start, -1, `Could not find ${name}`);
  const end = source.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `Could not find marker after ${name}`);
  return source.slice(start, end);
}

test('DrawingAreaComponent teardown releases owned browser/Konva resources', () => {
  const teardown = methodBody(
    drawingArea,
    'ngOnDestroy(): void',
    'private canEdit = false',
  );
  const expectedCleanup = [
    ['command subscription', /commandsSub\?\.unsubscribe\(\)|destroyRef/],
    ['ResizeObserver', /resizeObserver\?\.disconnect\(\)/],
    ['drag animation frame', /cancelDragAnimation\(\)/],
    ['grid fade timer', /clearTimeout\(this\.gridFadeTimeout\)/],
    ['link-navigation timer', /clearTimeout\(this\.linkNavQuadrantRefreshTimer\)/],
    ['navigation-popup timer', /clearNavPopupRevealTimer\(\)/],
    ['deferred gather timer', /clearTimeout\(this\.gatherDeferredRouting\)/],
    ['Konva stage', /stage\?\.destroy\(\)/],
  ];

  const missing = expectedCleanup
    .filter(([, pattern]) => !pattern.test(teardown))
    .map(([label]) => label);
  assert.deepEqual(missing, [], `Teardown does not release: ${missing.join(', ')}`);
});

test('removing graph objects disposes caret blink intervals', () => {
  const removeNode = methodBody(drawingLayer, 'removeNode(node: DANode)', 'removeEdge(edge: DAEdge)');
  const removeLabel = read('src/app/drawing-area/da-edge.ts').match(
    /removeLabel\(label: DALabel\): void \{([\s\S]*?)\n\s*\}/,
  )?.[1] ?? '';

  const missing = [];
  if (!/hideCursor\(\)|dispose\(\)/.test(removeNode)) missing.push('node caret interval');
  if (!/hideCursor\(\)|dispose\(\)/.test(removeLabel)) missing.push('label caret interval');
  assert.deepEqual(missing, [], `Removal does not release: ${missing.join(', ')}`);
});
