/**
 * Wire a hand-built DrawingAreaComponent's collaborators.
 *
 * Most of the drawing area's white-box specs skip Angular and fabricate a
 * component with `Object.create(DrawingAreaComponent.prototype)`. That gives
 * them the methods without a TestBed, a stage or a real DOM — but it also skips
 * every field initialiser, so each collaborator the class builds for itself
 * (`camera`, `viewport`, the seven overlays) comes out `undefined`, and a spec
 * that touches one dies on `Cannot read properties of undefined`.
 *
 * Each of those collaborators reads its dependencies through a lazy accessor,
 * so this can run immediately after `Object.create` and before the spec sets
 * `drawingLayer` or `stage`. Call it once; assign the fakes afterwards in any
 * order.
 *
 * Not reachable from the app: tsconfig.app.json compiles from `src/main.ts`
 * and nothing there imports this.
 */
import { Animations } from './animations';
import { Camera } from './camera';
import { CrosshairsProbe } from './crosshairs-probe';
import { Overlay } from './overlay';
import { Viewport } from './viewport';

/** The insets a spec gets if it does not care about panel overlays. */
const NO_INSET = {left: 0, right: 0, top: 0, bottom: 0};

/**
 * Give `component` the collaborators its field initialisers would have.
 *
 * Deliberately typed `any`: these specs are already reaching past `private`,
 * and pretending otherwise would just add casts at every call site.
 */
export function wireDrawingAreaCollaborators(component: any): void {
  const drawingLayer = () => component.drawingLayer;
  const crosshairsLayer = () => component.crosshairsLayer;

  component.animations = new Animations();
  component.camera = new Camera(drawingLayer);
  component.probe = new CrosshairsProbe(drawingLayer, crosshairsLayer, component.camera);
  component.viewport = new Viewport(() => component.stage, () => component.viewportInset ?? NO_INSET);

  component.goalLine = new Overlay(drawingLayer);
  component.hoverTrace = new Overlay(drawingLayer);
  component.navGhost = new Overlay(drawingLayer);
  component.growGhost = new Overlay(drawingLayer);
  component.labelEditGhost = new Overlay(crosshairsLayer);
  component.navigationLandingGhost = new Overlay(crosshairsLayer);
  component.linkNavQuadrantLines = new Overlay(crosshairsLayer);
}

/** `Object.create` plus the wiring, for specs that want both in one step. */
export function fabricateDrawingArea(prototype: object): any {
  const component = Object.create(prototype);
  wireDrawingAreaCollaborators(component);
  return component;
}
