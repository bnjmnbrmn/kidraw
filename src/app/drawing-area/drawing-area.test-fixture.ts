/**
 * Wire a hand-built DrawingAreaComponent's collaborators.
 *
 * Most of the drawing area's white-box specs skip Angular and fabricate a
 * component with `Object.create(DrawingAreaComponent.prototype)`. That gives
 * them the methods without a TestBed, a stage or a real DOM — but it also skips
 * every field initializer, so each collaborator the class builds for itself
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
import { AreaSelect } from './area-select';
import { KeyboardDrag } from './keyboard-drag';
import { GraphSearch } from './graph-search';
import { ClipboardController } from './clipboard-controller';
import { HistoryController } from './history-controller';
import { GatherController } from './gather-controller';
import { SelectDrag } from './select-drag';
import { StyleController } from './style-controller';
import { LayoutController } from './layout-controller';
import { AgentCanvasSurface } from './agent-canvas-surface';
import { CrosshairsHover } from './crosshairs-hover';
import { Camera } from './camera';
import { CrosshairsProbe } from './crosshairs-probe';
import { FileController } from './file-controller';
import { LinkNavController } from './link-nav-controller';
import { NavigationGridController } from './navigation-grid-controller';
import { GrowController } from './grow-controller';
import { NavJourney } from './nav-journey';
import { TextEditingController } from './text-editing-controller';
import { LabelEditSession } from './label-edit-session';
import { Overlay } from './overlay';
import { Viewport } from './viewport';

/** The insets a spec gets if it does not care about panel overlays. */
const NO_INSET = {left: 0, right: 0, top: 0, bottom: 0};

/**
 * Give `component` the collaborators its field initializers would have.
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
  component.fileController = new FileController(component.fileHost());
  component.textEditor = new TextEditingController(component.textEditingHost());
  component.labelEdit = new LabelEditSession(component.labelEditHost());
  component.areaSelect = new AreaSelect(component.areaSelectHost());
  component.keyboardDrag = new KeyboardDrag(component.keyboardDragHost());
  component.search = new GraphSearch(component.graphSearchHost());
  component.history = new HistoryController(component.historyHost());
  component.gather = new GatherController(component.gatherHost());
  component.selectDrag = new SelectDrag(component.selectDragHost());
  component.clipboard = new ClipboardController(component.clipboardHost());
  component.style = new StyleController(component.styleHost());
  component.layout = new LayoutController(component.layoutHost());
  component.agentCanvas = new AgentCanvasSurface(component.agentCanvasHost());
  component.hover = new CrosshairsHover(component.crosshairsHoverHost());
  component.journey = new NavJourney();
  component.linkNav = new LinkNavController(component.linkNavHost());
  component.navGrid = new NavigationGridController(component.navigationGridHost());
  component.grow = new GrowController(component.growHost());
  component.gestures = component.allGestures();

  component.goalLine = new Overlay(drawingLayer);
  component.hoverTrace = new Overlay(drawingLayer);
  component.navigationLandingGhost = new Overlay(crosshairsLayer);
}

/** `Object.create` plus the wiring, for specs that want both in one step. */
export function fabricateDrawingArea(prototype: object): any {
  const component = Object.create(prototype);
  wireDrawingAreaCollaborators(component);
  return component;
}
