/**
 * Overlays must describe the graph as it is now, not as it was.
 *
 * The dashed trace and the landing ghost are snapshots taken when the
 * crosshairs last moved. On 2026-08-29 a reflow pushed a node 96px and the
 * outline stayed behind — the screenshot Ben sent. The fix was to refresh
 * from the one exit every geometry-changing path already goes through; this
 * pins that contract so a new path cannot skip it.
 */
import Konva from 'konva';
import {DrawingAreaComponent} from '../app/drawing-area/drawing-area.component';
import {DrawingLayer} from '../app/drawing-area/drawing.layer';
import {DANode} from '../app/drawing-area/da-node';

function componentWith(nodes: DANode[]): any {
  const component = Object.create(DrawingAreaComponent.prototype) as any;
  const drawingLayer = new DrawingLayer();
  for (const n of nodes) drawingLayer.addRawNode(n);
  component.drawingLayer = drawingLayer;
  component.stage = {width: () => 1200, height: () => 800};
  component.crosshairsLayer = {
    crosshairs: {konvaGroup: {visible: () => true}, x: 0, y: 0},
    add: () => undefined,
    batchDraw: () => undefined,
  };
  component.navigationLandingGhost = null;
  component.crosshairHoverHighlight = null;
  component.visualConfigService = {
    getEffectivePalette: () => ({crosshairsStroke: '#abcdef', drawingStageBackground: '#050505'}),
  };
  component.themeService = {theme: 'dark'};
  component.getLabelUnderCrosshairs = () => null;
  component.getWaypointUnderCrosshairs = () => null;
  component.getDAEdgesContainingCrosshairs = () => [];
  component.RESIZE_REFLOW_GAP = 16;
  return component;
}

/** Where the trace says the node is. */
function traceBox(component: any): {x: number; y: number} | null {
  const shape: Konva.Shape | null = component.crosshairHoverHighlight;
  if (!shape) return null;
  const r = shape.getClientRect();
  return {x: Math.round(r.x), y: Math.round(r.y)};
}

describe('overlay freshness', () => {
  it('re-traces after a node moves under it', () => {
    const hovered = new DANode(400, 300, 'hovered');
    const other = new DANode(700, 300, 'other');
    const component = componentWith([hovered, other]);
    component.getDANodesContainingCrosshairs = () => [hovered];

    component.refreshCrosshairHoverHighlight();
    const before = traceBox(component)!;
    expect(before).not.toBeNull();

    // Anything that moves a node ends in updateEdgesForResizedNodes: a
    // resize and its reflow, a layout, a paste, a drag.
    hovered.konvaGroup.x(hovered.konvaGroup.x() + 96);
    component.updateEdgesForResizedNodes([hovered]);

    const after = traceBox(component)!;
    expect(after.x - before.x).toBe(96);
  });

  it('re-traces after a node grows under it', () => {
    const hovered = new DANode(400, 300, 'hovered');
    // `resizeBy` moves the base box; under the default `fit` overflow the drawn
    // box follows the text, so growing it needs a fixed-size mode.
    hovered.textOverflowMode = 'widen-both';
    const component = componentWith([hovered]);
    component.getDANodesContainingCrosshairs = () => [hovered];

    component.refreshCrosshairHoverHighlight();
    const before = component.crosshairHoverHighlight.getClientRect().width;

    hovered.resizeBy(60);
    component.updateEdgesForResizedNodes([hovered]);

    const after = component.crosshairHoverHighlight.getClientRect().width;
    expect(after - before).toBeCloseTo(60, 0);
  });

  it('traces a circle with an ellipse and a box with a rectangle', () => {
    // A rounded rectangle around a stretched circle reads as a different
    // shape than the thing it is tracing (da-442).
    for (const [shape, expected] of [['circle', 'Ellipse'], ['box', 'Rect']] as const) {
      const node = new DANode(200, 100, 'traced', undefined, undefined, shape);
      const component = componentWith([node]);
      component.getDANodesContainingCrosshairs = () => [node];

      component.refreshCrosshairHoverHighlight();

      expect(component.crosshairHoverHighlight.getClassName()).toBe(expected);
    }
  });
});
