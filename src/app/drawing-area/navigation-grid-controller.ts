import Konva from 'konva';
import type { ThemeService } from '../services/theme.service';
import type { VisualConfigService } from '../services/visual-config.service';
import type { CrosshairsLayer } from './crosshairs.layer';
import type { DrawingLayer } from './drawing.layer';
import { DACommandType, GraphItemNavigationStrategy, GridTier, NavTargetKind } from './command.model';
import type { CommandSlice } from './command-handlers';
import { bandIndexAtCoordinate, bandIndexForStop, buildNavigationGrid, NavigationAxisBand,
  NavigationGridStop } from './navigation-grid';
import { adaptiveGoalAngleStep, adjustAngleTowardScreenVertical, cardinalAngle, CardinalDirection,
  distanceToGoalRay, GoalVerticalDirection, moveUsesQuadrantConstraint, navigationQuadrant,
  quadrantForDirection } from './navigation-quadrant-grid';
import { buildQuadrantRingGrid, nextQuadrantRingStop, quadrantArcAngles,
  quarterArcPoints } from './navigation-quadrant-rings';

/** The viewport a quadrant origin was captured against, so a pan can stale it. */
export interface NavigationViewport {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

/** A stop the navigation last landed on. */
export interface NavStopRef {
  id: string;
  kind: 'node' | 'label' | 'waypoint';
}

/** What move-by-node needs from the drawing area that owns it. */
export interface NavigationGridHost {
  readonly crosshairsLayer: CrosshairsLayer;
  readonly drawingLayer: DrawingLayer;
  readonly stage: Konva.Stage;
  readonly themeService: ThemeService;
  readonly visualConfigService: VisualConfigService;
  /** True while held-Add is aiming; the lattice of spots replaces this overlay. */
  readonly growActive: boolean;
  emitStatus(message: string): void;
  finishTweens(): void;
  moveCrosshairsBy(deltaX: number, deltaY: number, tier?: GridTier, showMovementGrid?: boolean): void;
  navStops(targets: NavTargetKind): NavigationGridStop[];
  navStopCenter(id: string, kind: 'node' | 'label' | 'waypoint'): {x: number; y: number} | null;
}

/** Which stops a move-by-node command steps between: nodes and labels unless
 *  it says otherwise. */
function navTargetsOf(command: {targets?: NavTargetKind}): NavTargetKind {
  return command.targets ?? 'labels';
}

/**
 * Move-by-node: stepping the crosshairs between graph items, and the overlay
 * that shows what a step will do.
 *
 * Three strategies share this file because they share a vocabulary — stops,
 * goals, origins — and differ only in how they pick the next one:
 * `adaptive-band-grid` treats visible stops as a spreadsheet of rows and
 * columns; `adaptive-quadrant-grid` and `adaptive-quadrant-rings` anchor to an
 * origin and sweep a quadrant. Each draws its own overlay, which is why the
 * drawing code sits beside the picking code rather than in a renderer of its
 * own: the overlay *is* the explanation of the rule being applied.
 *
 * Goals live in drawing-layer coordinates so a viewport pan cannot stale them.
 *
 * Covered by `tools/qa/grid-overlay/` — six scripts, 65 checks.
 */
export class NavigationGridController {
  constructor(private readonly host: NavigationGridHost) {}

  /** Move by node's commands: the held grid overlay, its steps, and its strategy. */
  commands() {
    return {
      [DACommandType.SET_GRAPH_ITEM_NAVIGATION_STRATEGY]: c => this.setGraphItemNavigationStrategy(c.strategy),
      [DACommandType.SHOW_NODE_GRID]: c => this.showNodeGrid(navTargetsOf(c)),
      [DACommandType.HIDE_NODE_GRID]: () => this.hideNodeGrid(),
      [DACommandType.SNAP_TO_NODE_LEFT]: c => this.snapToNodeInDirection('left', navTargetsOf(c)),
      [DACommandType.SNAP_TO_NODE_RIGHT]: c => this.snapToNodeInDirection('right', navTargetsOf(c)),
      [DACommandType.SNAP_TO_NODE_UP]: c => this.snapToNodeInDirection('up', navTargetsOf(c)),
      [DACommandType.SNAP_TO_NODE_DOWN]: c => this.snapToNodeInDirection('down', navTargetsOf(c)),
      [DACommandType.ADJUST_GRAPH_ITEM_GOAL_SOUTH]: c => this.adjustQuadrantGoalAngle('south', navTargetsOf(c)),
      [DACommandType.ADJUST_GRAPH_ITEM_GOAL_NORTH]: c => this.adjustQuadrantGoalAngle('north', navTargetsOf(c)),
    } satisfies CommandSlice;
  }

  // ── Grid navigation (move-by-node): notes/design-grid-navigation.md ──
  // Purely spatial (no edges). Visible stops form a fixed spreadsheet-like
  // grid; navigation and the overlay share the same band model. A press steps
  // one row/column and snaps to the goal position on the perpendicular axis.
  // Goals live in drawing-layer coordinates so viewport pans cannot stale them.
  private navGoalX: number | null = null;
  private navGoalY: number | null = null;
  /** Explicit so the known-good Cartesian grid remains available beside
   *  navigation experiments. */
  private graphItemNavigationStrategy: GraphItemNavigationStrategy = 'adaptive-quadrant-rings';
  /** Fixed for one run of the same hjkl direction, unless the viewport changes. */
  private quadrantOriginLayer: {x: number; y: number} | null = null;
  private quadrantOriginViewport: NavigationViewport | null = null;
  /** The direction of the current run. A different hjkl key re-origins at
   *  the current stop before that move is evaluated. */
  private quadrantLastDirection: CardinalDirection | null = null;
  /** Screen-space bearing of the goal ray from the origin. */
  private quadrantGoalAngle = 0;
  private quadrantGoalAdjusted = false;
  /** The goal ray is normally absent. n/p reveal it briefly, then a
   *  dedicated tween fades it without changing navigation state. */
  private quadrantGoalRayVisible = false;
  private quadrantGoalRayFadeDelay: number | null = null;
  private quadrantGoalRayFadeTween: Konva.Tween | null = null;
  private quadrantNavLast: {id: string; kind: 'node'|'label'|'waypoint'} | null = null;
  /** Which remembered perpendicular coordinate the next same-axis step will
   *  try to return to: x for vertical travel, y for horizontal travel. */
  private navGoalAxis: 'x' | 'y' | null = null;
  /** The stop the last grid step landed on. Reset detection recomputes its
   *  center (pan-safe): if the crosshairs are no longer on it, a fresh
   *  navigation started and the goal position is reset. */
  private navGridLast: {id: string; kind: 'node'|'label'|'waypoint'} | null = null;

  /** Maximum stage-pixel span of one row/column band. Smaller when more stops
   *  are visible (finer grid); tunable by feel. */
  private navGridTolerance(visibleCount: number): number {
    return Math.max(12, Math.min(60, 180 / Math.sqrt(Math.max(1, visibleCount))));
  }

  private usesQuadrantOrigin(strategy = this.graphItemNavigationStrategy): boolean {
    return strategy === 'adaptive-quadrant-grid' ||
      strategy === 'adaptive-quadrant-rings';
  }

  setGraphItemNavigationStrategy(strategy: GraphItemNavigationStrategy): void {
    this.graphItemNavigationStrategy = strategy;
    this.navGoalX = null;
    this.navGoalY = null;
    this.navGoalAxis = null;
    this.navGridLast = null;
    this.resetQuadrantNavigation();
    if (this.usesQuadrantOrigin(strategy) && this.nodeGridVisible) {
      this.captureQuadrantOrigin();
    }
    if (this.nodeGridVisible) this.redrawNodeGrid();
    this.host.emitStatus(({
      'adaptive-band-grid': 'Graph-item navigation: Adaptive band grid',
      'adaptive-quadrant-grid': 'Graph-item navigation: Adaptive quadrant grid',
      'adaptive-quadrant-rings': 'Graph-item navigation: Adaptive quadrant rings',
    } as const)[strategy]);
  }

  snapToNodeInDirection(direction: 'left' | 'right' | 'up' | 'down', targets: NavTargetKind = 'labels') {
    switch (this.graphItemNavigationStrategy) {
      case 'adaptive-band-grid':
        this.snapWithAdaptiveBandGrid(direction, targets);
        return;
      case 'adaptive-quadrant-grid':
        this.snapWithQuadrantGrid(direction, targets);
        return;
      case 'adaptive-quadrant-rings':
        this.snapWithQuadrantRings(direction, targets);
        return;
    }
  }

  private resetQuadrantNavigation(): void {
    this.quadrantOriginLayer = null;
    this.quadrantOriginViewport = null;
    this.quadrantLastDirection = null;
    this.quadrantGoalAngle = 0;
    this.quadrantGoalAdjusted = false;
    this.hideQuadrantGoalRay();
    this.quadrantNavLast = null;
  }

  cancelQuadrantGoalRayFade(): void {
    if (this.quadrantGoalRayFadeDelay !== null) {
      window.clearTimeout(this.quadrantGoalRayFadeDelay);
      this.quadrantGoalRayFadeDelay = null;
    }
    this.quadrantGoalRayFadeTween?.destroy();
    this.quadrantGoalRayFadeTween = null;
  }

  hideQuadrantGoalRay(): void {
    this.cancelQuadrantGoalRayFade();
    this.quadrantGoalRayVisible = false;
  }

  private scheduleQuadrantGoalRayFade(): void {
    this.cancelQuadrantGoalRayFade();
    if (!this.quadrantGoalRayVisible) return;
    const ray = this.nodeGridGroup
      ?.findOne<Konva.Line>('.quadrant-grid-goal-ray');
    if (!ray) return;

    this.quadrantGoalRayFadeDelay = window.setTimeout(() => {
      this.quadrantGoalRayFadeDelay = null;
      const tween = new Konva.Tween({
        node: ray,
        duration: 0.8,
        opacity: 0,
        onFinish: () => {
          if (this.quadrantGoalRayFadeTween !== tween) return;
          this.quadrantGoalRayFadeTween = null;
          this.quadrantGoalRayVisible = false;
          ray.destroy();
          this.host.crosshairsLayer.batchDraw();
        },
      });
      this.quadrantGoalRayFadeTween = tween;
      tween.play();
    }, 650);
  }

  private currentNavigationViewport(): NavigationViewport {
    return {
      x: this.host.drawingLayer.x(),
      y: this.host.drawingLayer.y(),
      scale: this.host.drawingLayer.scaleX(),
      width: this.host.stage.width(),
      height: this.host.stage.height(),
    };
  }

  private navigationViewportMatches(snapshot: NavigationViewport | null): boolean {
    if (!snapshot) return false;
    const current = this.currentNavigationViewport();
    return Math.abs(current.x - snapshot.x) < 0.01 &&
      Math.abs(current.y - snapshot.y) < 0.01 &&
      Math.abs(current.scale - snapshot.scale) < 0.0001 &&
      current.width === snapshot.width &&
      current.height === snapshot.height;
  }

  private captureQuadrantOrigin(): void {
    const scale = this.host.drawingLayer.scaleX();
    this.quadrantOriginLayer = {
      x: (this.host.crosshairsLayer.crosshairs.x - this.host.drawingLayer.x()) / scale,
      y: (this.host.crosshairsLayer.crosshairs.y - this.host.drawingLayer.y()) / scale,
    };
    this.quadrantOriginViewport = this.currentNavigationViewport();
    this.quadrantLastDirection = null;
    this.quadrantGoalAngle = 0;
    this.quadrantGoalAdjusted = false;
    this.hideQuadrantGoalRay();
    this.quadrantNavLast = null;
  }

  private ensureQuadrantOrigin(): void {
    if (!this.quadrantOriginLayer ||
        !this.navigationViewportMatches(this.quadrantOriginViewport)) {
      this.captureQuadrantOrigin();
    }
  }

  private quadrantOriginInStage(): {x: number; y: number} | null {
    if (!this.quadrantOriginLayer) return null;
    const scale = this.host.drawingLayer.scaleX();
    return {
      x: this.host.drawingLayer.x() + this.quadrantOriginLayer.x * scale,
      y: this.host.drawingLayer.y() + this.quadrantOriginLayer.y * scale,
    };
  }

  adjustQuadrantGoalAngle(
    direction: GoalVerticalDirection,
    targets: NavTargetKind,
  ): void {
    if (this.graphItemNavigationStrategy !== 'adaptive-quadrant-grid') {
      this.host.emitStatus('Select Adaptive quadrant grid with g → o first.');
      return;
    }
    this.host.finishTweens();
    this.ensureQuadrantOrigin();
    const visibleCount = this.host.navStops(targets).filter(stop =>
      stop.cx >= 0 && stop.cx <= this.host.stage.width() &&
      stop.cy >= 0 && stop.cy <= this.host.stage.height()).length;
    const step = adaptiveGoalAngleStep(visibleCount);
    const adjusted = adjustAngleTowardScreenVertical(
      this.quadrantGoalAngle,
      direction,
      step,
    );
    const changed = adjusted !== this.quadrantGoalAngle;
    this.quadrantGoalAngle = adjusted;
    this.quadrantGoalAdjusted = true;
    this.quadrantGoalRayVisible = true;
    this.nodeGridTargets = targets;
    if (this.nodeGridVisible) this.redrawNodeGrid();
    const degrees = Math.round(step * 180 / Math.PI);
    this.host.emitStatus(changed
      ? `Goal ray: ${direction} (${degrees}° step)`
      : `Goal ray is already due ${direction}`);
  }

  private snapWithQuadrantGrid(direction: CardinalDirection, targets: NavTargetKind): void {
    this.host.finishTweens();
    this.ensureQuadrantOrigin();
    if (this.quadrantLastDirection !== null &&
        this.quadrantLastDirection !== direction) {
      this.captureQuadrantOrigin();
    }
    this.quadrantLastDirection = direction;
    const origin = this.quadrantOriginInStage();
    if (!origin) return;
    const cx = this.host.crosshairsLayer.crosshairs.x;
    const cy = this.host.crosshairsLayer.crosshairs.y;
    const vertical = direction === 'up' || direction === 'down';
    const positive = direction === 'right' || direction === 'down';
    const allStops = this.host.navStops(targets);
    const inView = (stop: NavigationGridStop) =>
      stop.cx >= 0 && stop.cx <= this.host.stage.width() &&
      stop.cy >= 0 && stop.cy <= this.host.stage.height();
    const visible = allStops.filter(inView);
    if (visible.length === 0) return;
    const tolerance = this.navGridTolerance(visible.length);
    const grid = buildNavigationGrid(
      visible,
      this.host.stage.width(),
      this.host.stage.height(),
      tolerance,
    );
    const bands = vertical ? grid.rows : grid.columns;
    const primary = (stop: NavigationGridStop) => vertical ? stop.cy : stop.cx;
    const here = vertical ? cy : cx;
    const currentStop = visible.find(stop =>
      Math.abs(stop.cx - cx) < 4 && Math.abs(stop.cy - cy) < 4);
    const atOrigin = Math.max(Math.abs(cx - origin.x), Math.abs(cy - origin.y)) < 4;
    const currentQuadrant = navigationQuadrant(cx - origin.x, cy - origin.y)
      ?? quadrantForDirection(direction);

    const lastCenter = this.quadrantNavLast
      ? this.host.navStopCenter(this.quadrantNavLast.id, this.quadrantNavLast.kind)
      : null;
    const onLast = !!lastCenter && Math.abs(lastCenter.x - cx) < 4 && Math.abs(lastCenter.y - cy) < 4;
    if (this.quadrantNavLast && !onLast) {
      this.quadrantGoalAngle = Math.atan2(cy - origin.y, cx - origin.x);
      this.quadrantGoalAdjusted = false;
    } else if (atOrigin && !this.quadrantGoalAdjusted) {
      this.quadrantGoalAngle = cardinalAngle(direction);
    }

    const constrainToQuadrant = moveUsesQuadrantConstraint(currentQuadrant, direction);
    const candidatesFor = (stops: NavigationGridStop[]) => constrainToQuadrant
      ? stops.filter(stop => {
          const stopQuadrant = navigationQuadrant(stop.cx - origin.x, stop.cy - origin.y);
          return stopQuadrant === null || stopQuadrant === currentQuadrant;
        })
      : stops;

    let startIndex: number;
    if (currentStop) {
      startIndex = bandIndexForStop(bands, currentStop) + (positive ? 1 : -1);
    } else if (positive) {
      startIndex = bands.findIndex(band => band.center > here);
    } else {
      startIndex = -1;
      for (let i = bands.length - 1; i >= 0; i--) {
        if (bands[i].center < here) {
          startIndex = i;
          break;
        }
      }
    }

    let candidates: NavigationGridStop[] | null = null;
    for (let index = startIndex;
         index >= 0 && index < bands.length;
         index += positive ? 1 : -1) {
      const inBand = candidatesFor(bands[index].stops);
      if (inBand.length > 0) {
        candidates = inBand;
        break;
      }
    }

    // If the constrained region has no visible destination, bring the nearest
    // matching off-screen band into view. That pan deliberately re-origins the
    // quadrant grid when it finishes.
    if (!candidates) {
      const offscreenAhead = candidatesFor(allStops.filter(stop =>
        !inView(stop) &&
        (positive
          ? primary(stop) > here + tolerance
          : primary(stop) < here - tolerance)));
      if (offscreenAhead.length === 0) {
        if (this.nodeGridVisible) this.redrawNodeGrid();
        return;
      }
      const bandEdge = positive
        ? Math.min(...offscreenAhead.map(primary))
        : Math.max(...offscreenAhead.map(primary));
      candidates = offscreenAhead.filter(stop =>
        Math.abs(primary(stop) - bandEdge) <= tolerance);
    }

    this.nodeGridTargets = targets;
    const perpendicular = (stop: NavigationGridStop) => vertical ? stop.cx : stop.cy;
    const currentPerpendicular = vertical ? cx : cy;
    const target = candidates.reduce((a, b) => {
      const aRay = distanceToGoalRay(origin, this.quadrantGoalAngle, a);
      const bRay = distanceToGoalRay(origin, this.quadrantGoalAngle, b);
      if (Math.abs(aRay - bRay) >= 0.01) return aRay < bRay ? a : b;
      return Math.abs(perpendicular(a) - currentPerpendicular) <=
        Math.abs(perpendicular(b) - currentPerpendicular) ? a : b;
    });
    this.quadrantNavLast = {id: target.id, kind: target.kind};
    this.jumpCrosshairsToStopCenter({x: target.cx, y: target.cy});
  }

  /**
   * Each same-direction run walks outward through the one-stop rings in that
   * direction's quadrant. A turn captures the current stop as a fresh origin,
   * preserving the existing h h h j turn-sensitive interaction.
   */
  private snapWithQuadrantRings(
    direction: CardinalDirection,
    targets: NavTargetKind,
  ): void {
    this.host.finishTweens();
    this.ensureQuadrantOrigin();
    if (this.quadrantLastDirection !== null &&
        this.quadrantLastDirection !== direction) {
      this.captureQuadrantOrigin();
    }
    this.quadrantLastDirection = direction;

    const origin = this.quadrantOriginInStage();
    if (!origin) return;
    const grid = buildQuadrantRingGrid(this.host.navStops(targets), origin);
    const cx = this.host.crosshairsLayer.crosshairs.x;
    const cy = this.host.crosshairsLayer.crosshairs.y;
    const lastCenter = this.quadrantNavLast
      ? this.host.navStopCenter(
          this.quadrantNavLast.id,
          this.quadrantNavLast.kind,
        )
      : null;
    const onLast = !!lastCenter &&
      Math.abs(lastCenter.x - cx) < 4 &&
      Math.abs(lastCenter.y - cy) < 4;
    const current = (onLast
      ? grid.stops.find(stop =>
          stop.source.id === this.quadrantNavLast?.id &&
          stop.source.kind === this.quadrantNavLast?.kind)
      : grid.stops.find(stop =>
          Math.abs(stop.source.cx - cx) < 4 &&
          Math.abs(stop.source.cy - cy) < 4)) ?? null;
    const target = nextQuadrantRingStop(
      grid,
      quadrantForDirection(direction),
      current,
    );
    if (!target) {
      if (this.nodeGridVisible) this.redrawNodeGrid();
      return;
    }

    this.nodeGridTargets = targets;
    this.quadrantNavLast = {
      id: target.source.id,
      kind: target.source.kind,
    };
    this.jumpCrosshairsToStopCenter({
      x: target.source.cx,
      y: target.source.cy,
    });
  }

  private snapWithAdaptiveBandGrid(direction: 'left' | 'right' | 'up' | 'down', targets: NavTargetKind) {
    this.host.finishTweens();
    const cx = this.host.crosshairsLayer.crosshairs.x;
    const cy = this.host.crosshairsLayer.crosshairs.y;
    const scale = this.host.drawingLayer.scaleX();
    const lx = this.host.drawingLayer.x(), ly = this.host.drawingLayer.y();
    const currentLayerX = (cx - lx) / scale;
    const currentLayerY = (cy - ly) / scale;
    const vertical = direction === 'up' || direction === 'down';
    const positive = direction === 'down' || direction === 'right';

    // Fresh navigation? The goal position resets unless we're still standing
    // on the stop the last grid step landed on.
    const lastCenter = this.navGridLast ? this.host.navStopCenter(this.navGridLast.id, this.navGridLast.kind) : null;
    const onLast = !!lastCenter && Math.abs(lastCenter.x - cx) < 4 && Math.abs(lastCenter.y - cy) < 4;
    if (!onLast) {
      this.navGoalX = currentLayerX;
      this.navGoalY = currentLayerY;
      this.navGoalAxis = null;
    }

    this.nodeGridTargets = targets;

    const allStops = this.host.navStops(targets);
    const inView = (s: NavigationGridStop) =>
      s.cx >= 0 && s.cx <= this.host.stage.width() && s.cy >= 0 && s.cy <= this.host.stage.height();
    const visible = allStops.filter(inView);
    const T = this.navGridTolerance(visible.length);
    const grid = buildNavigationGrid(visible, this.host.stage.width(), this.host.stage.height(), T);
    const bands = vertical ? grid.rows : grid.columns;
    const prim = (s: NavigationGridStop) => vertical ? s.cy : s.cx;
    const perp = (s: NavigationGridStop) => vertical ? s.cx : s.cy;
    const goal = vertical
      ? lx + (this.navGoalX ?? currentLayerX) * scale
      : ly + (this.navGoalY ?? currentLayerY) * scale;
    const here = vertical ? cy : cx;
    const currentStop = visible.find(stop =>
      Math.abs(stop.cx - cx) < 4 && Math.abs(stop.cy - cy) < 4);

    let targetBandIndex: number;
    if (currentStop) {
      const currentBandIndex = bandIndexForStop(bands, currentStop);
      targetBandIndex = currentBandIndex + (positive ? 1 : -1);
    } else if (positive) {
      targetBandIndex = bands.findIndex(band => band.center > here);
    } else {
      targetBandIndex = -1;
      for (let i = bands.length - 1; i >= 0; i--) {
        if (bands[i].center < here) { targetBandIndex = i; break; }
      }
    }

    let targetBand: NavigationGridStop[] | null =
      targetBandIndex >= 0 && targetBandIndex < bands.length
        ? bands[targetBandIndex].stops
        : null;

    // Past the visible spreadsheet edge, choose the nearest off-screen band
    // and let moveCrosshairsBy pan it into view. It will be part of the fixed
    // visible grid rebuilt after the pan completes.
    if (!targetBand) {
      const offscreenAhead = allStops.filter(stop => !inView(stop) &&
        (positive ? prim(stop) > here + T : prim(stop) < here - T));
      if (offscreenAhead.length === 0) {
        if (this.nodeGridVisible) this.redrawNodeGrid();
        return;
      }
      const bandEdge = positive
        ? Math.min(...offscreenAhead.map(prim))
        : Math.max(...offscreenAhead.map(prim));
      targetBand = offscreenAhead.filter(stop => Math.abs(prim(stop) - bandEdge) <= T);
    }

    const target = targetBand.reduce((a, b) =>
      Math.abs(perp(a) - goal) <= Math.abs(perp(b) - goal) ? a : b);

    this.jumpCrosshairsToStopCenter({x: target.cx, y: target.cy});
    const targetLayerX = (target.cx - lx) / scale;
    const targetLayerY = (target.cy - ly) / scale;
    if (vertical) {
      this.navGoalY = targetLayerY; // moved along y; keep goalX (the column)
      this.navGoalAxis = 'x';
    } else {
      this.navGoalX = targetLayerX; // moved along x; keep goalY (the row)
      this.navGoalAxis = 'y';
    }
    this.navGridLast = {id: target.id, kind: target.kind};
  }

  jumpCrosshairsToStopCenter(c: {x: number; y: number}): void {
    this.host.moveCrosshairsBy(c.x - this.host.crosshairsLayer.crosshairs.x,
                          c.y - this.host.crosshairsLayer.crosshairs.y,
                          undefined, false);
  }

  // ── Move-by-node grid overlay (design-grid-navigation.md, stage 2) ──
  // While the move-by-node key is held, the row/column bands the navigation
  // uses are drawn over the viewport so the grid is visible; the band the
  // crosshairs sit in is emphasised. Redrawn on every step (the view pans).
  private nodeGridVisible = false;
  private nodeGridGroup: Konva.Group | null = null;
  private nodeGridTargets: NavTargetKind = 'labels';

  showNodeGrid(targets: NavTargetKind = 'labels'): void {
    const opening = !this.nodeGridVisible;
    this.nodeGridVisible = true;
    this.nodeGridTargets = targets;
    if (opening && this.usesQuadrantOrigin()) {
      this.captureQuadrantOrigin();
    }
    // Move-by-node's band grid replaces the ordinary drawing grid while held.
    this.host.drawingLayer.hideGrid();
    this.host.drawingLayer.batchDraw();
    this.redrawNodeGrid();
  }

  hideNodeGrid(): void {
    this.nodeGridVisible = false;
    this.resetQuadrantNavigation();
    this.nodeGridGroup?.destroy();
    this.nodeGridGroup = null;
    this.host.crosshairsLayer.batchDraw();
  }

  redrawNodeGrid(): void {
    if (!this.nodeGridVisible) return;
    this.nodeGridGroup?.destroy();
    const group = new Konva.Group({listening: false});
    this.nodeGridGroup = group;

    if (this.graphItemNavigationStrategy === 'adaptive-quadrant-grid') {
      this.drawQuadrantNodeGrid(group);
      this.host.crosshairsLayer.add(group);
      group.moveToBottom();
      this.scheduleQuadrantGoalRayFade();
      this.host.crosshairsLayer.batchDraw();
      return;
    }
    if (this.graphItemNavigationStrategy === 'adaptive-quadrant-rings') {
      this.drawQuadrantRingGrid(group);
      this.host.crosshairsLayer.add(group);
      group.moveToBottom();
      this.host.crosshairsLayer.batchDraw();
      return;
    }

    const W = this.host.stage.width(), H = this.host.stage.height();
    const stops = this.host.navStops(this.nodeGridTargets)
      .filter(s => s.cx >= 0 && s.cx <= W && s.cy >= 0 && s.cy <= H);
    const T = this.navGridTolerance(stops.length);
    const grid = buildNavigationGrid(stops, W, H, T);
    const cx = this.host.crosshairsLayer.crosshairs.x, cy = this.host.crosshairsLayer.crosshairs.y;
    const palette = this.host.visualConfigService.getEffectivePalette(this.host.themeService.theme);
    const stroke = palette.crosshairsStroke;

    const stopUnderCrosshairs = stops.find(stop =>
      Math.abs(stop.cx - cx) < 4 && Math.abs(stop.cy - cy) < 4);
    const activeColumn = stopUnderCrosshairs
      ? bandIndexForStop(grid.columns, stopUnderCrosshairs)
      : bandIndexAtCoordinate(grid.columns, cx);
    const activeRow = stopUnderCrosshairs
      ? bandIndexForStop(grid.rows, stopUnderCrosshairs)
      : bandIndexAtCoordinate(grid.rows, cy);

    // Alternating low-opacity fills make rows and columns read as areas rather
    // than centerlines. The active row/column, then their cell intersection,
    // are layered on top like a spreadsheet selection.
    const fillBand = (band: NavigationAxisBand, vertical: boolean, opacity: number) =>
      new Konva.Rect({
        x: vertical ? band.start : 0,
        y: vertical ? 0 : band.start,
        width: vertical ? band.end - band.start : W,
        height: vertical ? H : band.end - band.start,
        fill: stroke,
        opacity,
        listening: false,
      });
    grid.columns.forEach((band, index) => {
      if (index % 2 === 1) group.add(fillBand(band, true, 0.035));
    });
    grid.rows.forEach((band, index) => {
      if (index % 2 === 1) group.add(fillBand(band, false, 0.035));
    });
    if (activeColumn >= 0) group.add(fillBand(grid.columns[activeColumn], true, 0.075));
    if (activeRow >= 0) group.add(fillBand(grid.rows[activeRow], false, 0.075));
    if (activeColumn >= 0 && activeRow >= 0) {
      const column = grid.columns[activeColumn], row = grid.rows[activeRow];
      group.add(new Konva.Rect({
        x: column.start, y: row.start,
        width: column.end - column.start, height: row.end - row.start,
        fill: stroke, opacity: 0.1, listening: false,
      }));
    }

    const boundary = (points: number[]) => new Konva.Line({
      points, stroke, strokeWidth: 1, opacity: 0.3, listening: false,
    });
    for (let i = 1; i < grid.columns.length; i++) {
      group.add(boundary([grid.columns[i].start, 0, grid.columns[i].start, H]));
    }
    for (let i = 1; i < grid.rows.length; i++) {
      group.add(boundary([0, grid.rows[i].start, W, grid.rows[i].start]));
    }

    // Boundaries are inferred from centers and can legitimately cross a wide
    // item. Give every stop its own compact membership legend: the horizontal
    // arm carries its row's light/dark cadence, and the vertical arm carries
    // its column's. A node remains readable even when the distant boundary is
    // visually ambiguous.
    const markerOpacity = (bandIndex: number) => bandIndex % 2 === 1 ? 0.9 : 0.48;
    for (const stop of stops) {
      const rowIndex = bandIndexForStop(grid.rows, stop);
      const columnIndex = bandIndexForStop(grid.columns, stop);
      const marker = new Konva.Group({
        name: 'node-grid-membership-marker',
        x: stop.cx,
        y: stop.cy,
        listening: false,
      });
      const arm = (points: number[], name: string, opacity: number) => {
        marker.add(new Konva.Line({
          points,
          stroke: palette.nodeFill,
          strokeWidth: 5,
          opacity: 0.9,
          lineCap: 'round',
          listening: false,
        }));
        marker.add(new Konva.Line({
          name,
          points,
          stroke,
          strokeWidth: 2,
          opacity,
          lineCap: 'round',
          listening: false,
        }));
      };
      arm([-9, 0, 9, 0], 'node-grid-row-arm', markerOpacity(rowIndex));
      arm([0, -9, 0, 9], 'node-grid-column-arm', markerOpacity(columnIndex));
      group.add(marker);
    }

    // A text-editor-style goal column/row survives a gap: the current stop
    // may sit off it temporarily, then a later step re-acquires it. Paint that
    // remembered coordinate more strongly than the cell boundaries so the
    // snap-back behavior is visible rather than surprising.
    const lastCenter = this.navGridLast
      ? this.host.navStopCenter(this.navGridLast.id, this.navGridLast.kind)
      : null;
    const stillInSequence = !!lastCenter &&
      Math.abs(lastCenter.x - cx) < 4 && Math.abs(lastCenter.y - cy) < 4;
    if (stillInSequence && this.navGoalAxis) {
      const scale = this.host.drawingLayer.scaleX();
      const guideCoordinate = this.navGoalAxis === 'x'
        ? this.host.drawingLayer.x() + (this.navGoalX ?? 0) * scale
        : this.host.drawingLayer.y() + (this.navGoalY ?? 0) * scale;
      const currentCoordinate = this.navGoalAxis === 'x' ? cx : cy;
      const points = this.navGoalAxis === 'x'
        ? [guideCoordinate, 0, guideCoordinate, H]
        : [0, guideCoordinate, W, guideCoordinate];
      // The highlighted active row/column is enough while we are already on
      // the goal. Reveal the extra guide only when a gap has displaced us.
      if (Math.abs(currentCoordinate - guideCoordinate) >= 4) {
        group.add(new Konva.Line({
          name: 'node-grid-goal-guide',
          points,
          stroke,
          strokeWidth: 2,
          opacity: 0.75,
          dash: [8, 6],
          listening: false,
        }));
      }
    }

    this.host.crosshairsLayer.add(group);
    group.moveToBottom();
    this.host.crosshairsLayer.batchDraw();
  }

  private drawQuadrantRingGrid(group: Konva.Group): void {
    this.ensureQuadrantOrigin();
    const origin = this.quadrantOriginInStage();
    if (!origin) return;

    const W = this.host.stage.width(), H = this.host.stage.height();
    const grid = buildQuadrantRingGrid(
      this.host.navStops(this.nodeGridTargets),
      origin,
    );
    const palette = this.host.visualConfigService.getEffectivePalette(this.host.themeService.theme);
    const stroke = palette.crosshairsStroke;
    const cx = this.host.crosshairsLayer.crosshairs.x;
    const cy = this.host.crosshairsLayer.crosshairs.y;
    const activeStop = grid.stops.find(stop =>
      Math.abs(stop.source.cx - cx) < 4 &&
      Math.abs(stop.source.cy - cy) < 4) ?? null;
    const activeQuadrant = activeStop?.quadrant ??
      (this.quadrantLastDirection
        ? quadrantForDirection(this.quadrantLastDirection)
        : null);
    const maxReach = Math.max(
      Math.hypot(origin.x, origin.y),
      Math.hypot(W - origin.x, origin.y),
      Math.hypot(origin.x, H - origin.y),
      Math.hypot(W - origin.x, H - origin.y),
    );
    const toDegrees = 180 / Math.PI;
    const quadrants = ['north', 'south', 'east', 'west'] as const;

    // A low-opacity wash makes the active radial region legible without
    // overwhelming the independently alternating ring bands.
    if (activeQuadrant) {
      const angles = quadrantArcAngles(activeQuadrant);
      group.add(new Konva.Arc({
        name: 'quadrant-ring-active-quadrant',
        x: origin.x,
        y: origin.y,
        innerRadius: 0,
        outerRadius: maxReach,
        angle: 90,
        rotation: angles.start * toDegrees,
        fill: stroke,
        opacity: 0.035,
        listening: false,
      }));
    }

    // While a node is being placed, the rings are not the thing to look at:
    // the ghost slots are, and every stop in the graph contributes a ring, so
    // the anchor ends up inside a dozen concentric arcs (da-499). Keep the
    // quadrant wash and the band you are actually on; drop the rest of the
    // lattice until the gesture is over.
    const placing = this.host.growActive;
    for (const quadrant of quadrants) {
      const angles = quadrantArcAngles(quadrant);
      const rings = grid.rings[quadrant];
      rings.forEach((ring, index) => {
        const innerRadius = Math.min(ring.innerRadius, maxReach);
        const outerRadius = Math.min(ring.outerRadius, maxReach);
        const active = ring.stop === activeStop;
        if (outerRadius > innerRadius && ((index % 2 === 1 && !placing) || active)) {
          group.add(new Konva.Arc({
            name: active
              ? 'quadrant-ring-active-band'
              : 'quadrant-ring-band',
            x: origin.x,
            y: origin.y,
            innerRadius,
            outerRadius,
            angle: 90,
            rotation: angles.start * toDegrees,
            fill: stroke,
            opacity: active ? 0.105 : 0.025,
            listening: false,
          }));
        }

        if (!placing &&
            Number.isFinite(ring.outerRadius) &&
            ring.outerRadius > 0 &&
            ring.outerRadius <= maxReach) {
          group.add(new Konva.Line({
            name: 'quadrant-ring-boundary',
            points: quarterArcPoints(
              origin,
              ring.outerRadius,
              quadrant,
            ),
            stroke,
            strokeWidth: 1,
            opacity: 0.34,
            listening: false,
          }));
        }
      });
    }

    // Unlike the moving ghost frame in the rectangular experiment, these
    // diagonals are the actual edges of the four independently spaced ring
    // systems, so they stay attached to the active origin.
    for (const angle of [
      Math.PI / 4,
      Math.PI * 3 / 4,
      Math.PI * 5 / 4,
      Math.PI * 7 / 4,
    ]) {
      const end = navigationRayEnd(origin, angle, W, H);
      if (!end) continue;
      group.add(new Konva.Line({
        name: 'quadrant-ring-diagonal',
        points: [origin.x, origin.y, end.x, end.y],
        stroke,
        strokeWidth: 1.5,
        opacity: 0.46,
        dash: [7, 5],
        listening: false,
      }));
    }

    group.add(new Konva.Circle({
      name: 'quadrant-ring-origin',
      x: origin.x,
      y: origin.y,
      radius: 6,
      fill: palette.nodeFill,
      stroke,
      strokeWidth: 2,
      opacity: 0.9,
      listening: false,
    }));
  }

  private drawQuadrantNodeGrid(group: Konva.Group): void {
    this.ensureQuadrantOrigin();
    const origin = this.quadrantOriginInStage();
    if (!origin) return;

    const W = this.host.stage.width(), H = this.host.stage.height();
    const stops = this.host.navStops(this.nodeGridTargets)
      .filter(stop => stop.cx >= 0 && stop.cx <= W && stop.cy >= 0 && stop.cy <= H);
    const grid = buildNavigationGrid(
      stops,
      W,
      H,
      this.navGridTolerance(stops.length),
    );
    const palette = this.host.visualConfigService.getEffectivePalette(this.host.themeService.theme);
    const stroke = palette.crosshairsStroke;
    const cx = this.host.crosshairsLayer.crosshairs.x;
    const cy = this.host.crosshairsLayer.crosshairs.y;

    // The adaptive rows/columns remain visible as a deliberately subordinate
    // movement grid. These are roughly one third of the former fill/boundary
    // opacity, with no active row, column, or cell highlight.
    const fillBand = (
      band: NavigationAxisBand,
      vertical: boolean,
      name: string,
    ) => new Konva.Rect({
      name,
      x: vertical ? band.start : 0,
      y: vertical ? 0 : band.start,
      width: vertical ? band.end - band.start : W,
      height: vertical ? H : band.end - band.start,
      fill: stroke,
      opacity: 0.012,
      listening: false,
    });
    grid.columns.forEach((band, index) => {
      if (index % 2 === 1) {
        group.add(fillBand(band, true, 'quadrant-grid-column-band'));
      }
    });
    grid.rows.forEach((band, index) => {
      if (index % 2 === 1) {
        group.add(fillBand(band, false, 'quadrant-grid-row-band'));
      }
    });
    for (let index = 1; index < grid.columns.length; index++) {
      group.add(new Konva.Line({
        name: 'quadrant-grid-column-boundary',
        points: [grid.columns[index].start, 0, grid.columns[index].start, H],
        stroke,
        strokeWidth: 1,
        opacity: 0.1,
        listening: false,
      }));
    }
    for (let index = 1; index < grid.rows.length; index++) {
      group.add(new Konva.Line({
        name: 'quadrant-grid-row-boundary',
        points: [0, grid.rows[index].start, W, grid.rows[index].start],
        stroke,
        strokeWidth: 1,
        opacity: 0.1,
        listening: false,
      }));
    }

    // The darker diagonal wash remains the primary region cue.
    const activeQuadrant = navigationQuadrant(cx - origin.x, cy - origin.y) ??
      (this.quadrantLastDirection
        ? quadrantForDirection(this.quadrantLastDirection)
        : null);
    if (activeQuadrant) {
      const reach = W + H;
      const quadrantPoints = {
        north: [
          origin.x, origin.y,
          origin.x - reach, origin.y - reach,
          origin.x + reach, origin.y - reach,
        ],
        south: [
          origin.x, origin.y,
          origin.x - reach, origin.y + reach,
          origin.x + reach, origin.y + reach,
        ],
        east: [
          origin.x, origin.y,
          origin.x + reach, origin.y - reach,
          origin.x + reach, origin.y + reach,
        ],
        west: [
          origin.x, origin.y,
          origin.x - reach, origin.y - reach,
          origin.x - reach, origin.y + reach,
        ],
      }[activeQuadrant];
      group.add(new Konva.Line({
        name: 'quadrant-grid-active-quadrant',
        points: quadrantPoints,
        closed: true,
        fill: stroke,
        opacity: 0.1,
        listening: false,
      }));
    }

    const diagonalAngles = [
      Math.PI / 4,
      Math.PI * 3 / 4,
      Math.PI * 5 / 4,
      Math.PI * 7 / 4,
    ];
    const addGhostDiagonalRays = (center: {x: number; y: number}) => {
      for (const angle of diagonalAngles) {
        const end = navigationRayEnd(center, angle, W, H);
        if (end) {
          group.add(new Konva.Line({
            name: 'quadrant-grid-ghost-diagonal',
            points: [center.x, center.y, end.x, end.y],
            stroke,
            strokeWidth: 1.5,
            opacity: 0.42,
            dash: [7, 5],
            listening: false,
          }));
        }
      }
    };

    // Preview the diagonal frame that would become active on the next
    // direction change. It follows the crosshairs; the quadrant wash now
    // communicates the active frame without a second, darker set of lines.
    addGhostDiagonalRays({x: cx, y: cy});

    const markerOpacity = (bandIndex: number) => bandIndex % 2 === 1 ? 0.9 : 0.48;
    for (const stop of stops) {
      const rowIndex = bandIndexForStop(grid.rows, stop);
      const columnIndex = bandIndexForStop(grid.columns, stop);
      const marker = new Konva.Group({
        name: 'quadrant-grid-membership-marker',
        x: stop.cx,
        y: stop.cy,
        listening: false,
      });
      const arm = (points: number[], name: string, opacity: number) => {
        marker.add(new Konva.Line({
          points,
          stroke: palette.nodeFill,
          strokeWidth: 5,
          opacity: 0.9,
          lineCap: 'round',
          listening: false,
        }));
        marker.add(new Konva.Line({
          name,
          points,
          stroke,
          strokeWidth: 2,
          opacity,
          lineCap: 'round',
          listening: false,
        }));
      };
      arm([-9, 0, 9, 0], 'quadrant-grid-row-arm', markerOpacity(rowIndex));
      arm([0, -9, 0, 9], 'quadrant-grid-column-arm', markerOpacity(columnIndex));
      group.add(marker);
    }

    const goalEnd = this.quadrantGoalRayVisible
      ? navigationRayEnd(origin, this.quadrantGoalAngle, W, H)
      : null;
    if (goalEnd) {
      group.add(new Konva.Line({
        name: 'quadrant-grid-goal-ray',
        points: [origin.x, origin.y, goalEnd.x, goalEnd.y],
        stroke,
        strokeWidth: 2,
        opacity: 0.8,
        dash: [8, 6],
        listening: false,
      }));
    }

    group.add(new Konva.Circle({
      name: 'quadrant-grid-origin',
      x: origin.x,
      y: origin.y,
      radius: 6,
      fill: palette.nodeFill,
      stroke,
      strokeWidth: 2,
      opacity: 0.9,
      listening: false,
    }));
  }

  /** The stop the last step landed on, whichever strategy made it. */
  get lastStop(): NavStopRef | null {
    return this.graphItemNavigationStrategy === 'adaptive-band-grid'
      ? this.navGridLast : this.quadrantNavLast;
  }

  /** True while the held-key overlay is up. */
  get visible(): boolean {
    return this.nodeGridVisible;
  }

  /**
   * Treat `stop` as where navigation now stands, without having moved there.
   * Held-Add uses this: its lattice of spots replaces the overlay, and the
   * spot it lands on has to become the origin for whatever follows.
   */
  adoptStop(stop: NavStopRef): void {
    this.navGridLast = stop;
    this.quadrantNavLast = stop;
    this.quadrantLastDirection = null;
  }
}

/**
 * Where a ray from `origin` at `angle` leaves a `width` x `height` viewport.
 * Pure geometry — no component state — so it lives outside the class and the
 * drawing area can use it without going through the controller.
 */
export function navigationRayEnd(
    origin: {x: number; y: number},
  angle: number,
  width: number,
  height: number,
): {x: number; y: number} | null {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const candidates: number[] = [];
  if (dx > 1e-9) candidates.push((width - origin.x) / dx);
  else if (dx < -1e-9) candidates.push((0 - origin.x) / dx);
  if (dy > 1e-9) candidates.push((height - origin.y) / dy);
  else if (dy < -1e-9) candidates.push((0 - origin.y) / dy);
  const positive = candidates.filter(value => value > 0);
  if (positive.length === 0) return null;
  const distance = Math.min(...positive);
  return {x: origin.x + dx * distance, y: origin.y + dy * distance};
}
