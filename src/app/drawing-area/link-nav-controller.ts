import type {InteractionMode} from './interaction-modes';
import Konva from 'konva';
import {DACommandType} from './command.model';
import type {CommandSlice} from './command-handlers';
import type {DANode} from './da-node';
import type {DAEdge} from './da-edge';
import type {DrawingLayer} from './drawing.layer';
import type {CrosshairsLayer} from './crosshairs.layer';
import type {Camera} from './camera';
import type {CrosshairsProbe} from './crosshairs-probe';
import type {NavJourney} from './nav-journey';
import type {Point} from './utils';
import {topmost} from './utils';
import {nodeCenterInStage} from './node-geometry';
import {navigationRayEnd} from './navigation-grid-controller';
import {Overlay} from './overlay';
import {
  linkDirectionsFrom,
  linkQuadrant,
  LinkCardinalDirection,
  moveLinkQuadrant,
  NavCandidate,
  navCandidatesFor,
  pickEntryCandidate,
} from './graph-nav';

export interface LinkNavHost {
  /** This mode is starting: whichever other mode is on stops (interaction-modes.ts). */
  beginMode(): void;
  readonly drawingLayer: DrawingLayer;
  readonly crosshairsLayer: CrosshairsLayer;
  readonly stage: Konva.Stage;
  readonly camera: Camera;
  /** What the crosshairs are on, for picking the node to start from. */
  readonly probe: CrosshairsProbe;
  /** Shared with the nav popup, so either surface continues the other's walk. */
  readonly journey: NavJourney;
  /** Crosshairs travel; link nav jumps them onto each node it lands on. */
  readonly navGrid: {jumpCrosshairsToStopCenter(centre: Point): void};
  /** The one palette colour the quadrant overlay draws with. */
  readonly crosshairsStroke: string;
  /** Seconds a crosshairs jump takes; the overlay redraws once it settles. */
  readonly crosshairMovementDuration: number;
  emitStatus(message: string): void;
  finishTweens(): void;
  /** Highlight an edge as the scan position, redrawing if it changed. */
  focusEdge(edge: DAEdge | null): void;
}

/**
 * Move by Link: the held, popup-free navigation mode.
 *
 * Hold the root key and the node under the crosshairs becomes the source; the
 * four NSEW keys scan and walk its links. A quadrant with exactly one link
 * walks it immediately, an ambiguous one focuses first and a second press
 * along that quadrant commits — so a press never does something the dashed
 * overlay did not already show.
 *
 * Where it has been lives in `NavJourney`, not here: the nav popup is the
 * other surface onto the same walk.
 */
export class LinkNavController implements InteractionMode {
  readonly name = 'move-by-link';
  /** The node the held session is scanning from; null when not held. */
  private source: DANode | null = null;
  /** Whether the visible highlight is the active scan position. When it is,
   *  a perpendicular key can move away from it without a confirming press. */
  private directionalFocus = false;
  private readonly quadrantLines: Overlay<Konva.Group>;
  private refreshTimer: number | null = null;

  constructor(private readonly host: LinkNavHost) {
    this.quadrantLines = new Overlay<Konva.Group>(() => this.host.crosshairsLayer);
  }

  /** Whether a held session is open — the theme and resize handlers redraw
   *  the overlay only then. */
  get active(): boolean {
    return this.source !== null;
  }

  /** Move by Link's commands: hold, step toward a quadrant, release. */
  commands() {
    return {
      [DACommandType.ENTER_LINK_NAV]: () => this.enter(),
      [DACommandType.MOVE_LINK_LEFT]: () => this.move('west'),
      [DACommandType.MOVE_LINK_RIGHT]: () => this.move('east'),
      [DACommandType.MOVE_LINK_UP]: () => this.move('north'),
      [DACommandType.MOVE_LINK_DOWN]: () => this.move('south'),
      [DACommandType.RELEASE_LINK_NAV]: () => this.release(),
    } satisfies CommandSlice;
  }

  /** Begin a held session at the node under the crosshairs. */
  enter(): void {
    this.host.beginMode();
    this.host.finishTweens();
    const underCrosshairs = topmost(this.host.probe.nodes());
    const source = underCrosshairs ?? this.nearestNodeToCrosshairs();
    this.source = source;
    this.directionalFocus = false;
    this.host.focusEdge(null);
    if (!source) {
      this.host.emitStatus('Move the crosshairs onto a node to navigate.');
      return;
    }
    const snappedToNearest = underCrosshairs === null;
    if (snappedToNearest) {
      this.host.navGrid.jumpCrosshairsToStopCenter(this.centreInStage(source));
    }
    const continuingJourney = source === this.lastNode();
    this.host.journey.startAt(source);
    const entry = this.focusEntry(
      source,
      continuingJourney ? this.host.journey.momentum : null,
    );
    this.redraw();
    if (snappedToNearest) this.scheduleRefresh(source);
    if (!entry) {
      this.host.emitStatus('No edges here.');
      return;
    }
    this.host.emitStatus(`Link: ${labelOf(entry.other)}`);
  }

  /** Select/scan an NSEW link. A unique link in the requested quadrant walks
   *  immediately; an ambiguous quadrant focuses before an along-link press. */
  move(direction: LinkCardinalDirection): void {
    const source = this.source;
    if (!source) return;
    const candidates = navCandidatesFor(source);
    const move = moveLinkQuadrant(
      linkDirectionsFrom(source, candidates),
      this.directionalFocus ? this.host.journey.focusedEdge?.id ?? null : null,
      direction,
      true,
    );
    if (!move.id) {
      this.host.emitStatus(`No link in the ${direction} quadrant.`);
      return;
    }
    const candidate = candidates.find(c => c.edge.id === move.id);
    if (!candidate) return;
    if (move.traverse) {
      this.traverse(source, candidate);
      return;
    }
    this.directionalFocus = true;
    this.host.focusEdge(candidate.edge);
    this.redraw();
    this.host.emitStatus(`${direction}: ${labelOf(candidate.other)}`);
  }

  /** Releasing the held root key only exits. Traversal belongs to an explicit
   *  directional press, never to the mechanically unrelated key-up event. */
  release(): void {
    this.source = null;
    this.directionalFocus = false;
    this.host.focusEdge(null);
    this.clear();
  }

  /** Stop, as releasing the held key does. */
  cancel(): void {
    this.release();
  }

  /** Redraw the quadrant overlay for the open session — after a theme change,
   *  a resize, or a crosshairs jump that has now settled. */
  redraw(): void {
    if (this.source) this.redrawQuadrantLines(this.source);
  }

  /** Drop the overlay and its pending refresh. Safe to call when not held. */
  clear(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.quadrantLines.clear();
  }

  /** Walk to the far end of a link and keep scanning from there. */
  private traverse(source: DANode, candidate: NavCandidate): void {
    const dest = candidate.other;
    this.host.journey.arrive(source, dest, candidate.direction);
    this.source = dest;
    this.focusEntry(dest, this.host.journey.momentum);
    this.host.navGrid.jumpCrosshairsToStopCenter(this.centreInStage(dest));
    this.redraw();
    this.scheduleRefresh(dest);
    this.host.emitStatus(
      `${candidate.direction === 'out' ? '→' : '←'} ${labelOf(dest)}`);
  }

  /** Pick the entry link for a source node and make its highlight the active
   *  scan position. Momentum prefers continuing onward after a traversal; a
   *  cold start uses clockwise order from North. */
  private focusEntry(source: DANode, momentum: Point | null): NavCandidate | null {
    const candidates = navCandidatesFor(source);
    if (candidates.length === 0) {
      this.directionalFocus = false;
      this.host.focusEdge(null);
      return null;
    }
    const entryIndex = pickEntryCandidate(
      linkDirectionsFrom(source, candidates).map(candidate => candidate.direction),
      momentum,
    );
    const entry = entryIndex >= 0 ? candidates[entryIndex] : candidates[0];
    this.directionalFocus = true;
    this.host.focusEdge(entry.edge);
    return entry;
  }

  /** Dashed 45° rays expose the exact N/E/S/W quadrant boundaries used by
   *  moveLinkQuadrant, with the active quadrant washed in. They live in stage
   *  coordinates so their dash and stroke stay screen-stable at every zoom. */
  private redrawQuadrantLines(source: DANode): void {
    const group = new Konva.Group({name: 'move-by-link-quadrants', listening: false});
    const origin = this.centreInStage(source);
    const focused = this.host.journey.focusedEdge;
    const geometry = linkDirectionsFrom(source, navCandidatesFor(source));
    const focusedDirection = focused
      ? geometry.find(candidate => candidate.id === focused.id)?.direction ?? null
      : null;
    const active = linkQuadrant(focusedDirection);
    if (active) group.add(this.quadrantWash(origin, active));
    for (const angle of [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]) {
      const end = navigationRayEnd(
        origin, angle, this.host.stage.width(), this.host.stage.height());
      if (!end) continue;
      group.add(new Konva.Line({
        name: 'move-by-link-diagonal',
        points: [origin.x, origin.y, end.x, end.y],
        stroke: this.host.crosshairsStroke,
        strokeWidth: 1.5,
        strokeScaleEnabled: false,
        opacity: 0.46,
        dash: [7, 5],
        listening: false,
      }));
    }
    // A backdrop, not an overlay: the real graph stays readable through it.
    this.quadrantLines.show(() => group, 'bottom');
    this.host.crosshairsLayer.batchDraw();
  }

  /** The active quadrant as a wedge reaching past the far corner of the stage. */
  private quadrantWash(origin: Point, quadrant: LinkCardinalDirection): Konva.Line {
    const reach = this.host.stage.width() + this.host.stage.height();
    const points = {
      north: [origin.x, origin.y, origin.x - reach, origin.y - reach,
        origin.x + reach, origin.y - reach],
      south: [origin.x, origin.y, origin.x - reach, origin.y + reach,
        origin.x + reach, origin.y + reach],
      east: [origin.x, origin.y, origin.x + reach, origin.y - reach,
        origin.x + reach, origin.y + reach],
      west: [origin.x, origin.y, origin.x - reach, origin.y - reach,
        origin.x - reach, origin.y + reach],
    }[quadrant];
    return new Konva.Line({
      name: 'move-by-link-active-quadrant',
      points,
      closed: true,
      fill: this.host.crosshairsStroke,
      opacity: 0.1,
      listening: false,
    });
  }

  /** The crosshairs tween is still running when a jump starts, so the overlay
   *  drawn now is at the old origin. Redraw once it has landed. */
  private scheduleRefresh(source: DANode): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      if (this.source === source) this.redrawQuadrantLines(source);
    }, Math.ceil(this.host.crosshairMovementDuration * 1000) + 30);
  }

  private nearestNodeToCrosshairs(): DANode | null {
    const nodes = this.host.drawingLayer.getDANodes();
    if (nodes.length === 0) return null;
    const x = this.host.crosshairsLayer.crosshairsX();
    const y = this.host.crosshairsLayer.crosshairsY();
    const distance = (node: DANode) => {
      const c = this.centreInStage(node);
      return Math.hypot(c.x - x, c.y - y);
    };
    return nodes.reduce((best, node) => distance(node) < distance(best) ? node : best);
  }

  private lastNode(): DANode | null {
    return this.host.journey.lastNodeAmong(this.host.drawingLayer.getDANodes());
  }

  private centreInStage(node: DANode): Point {
    return nodeCenterInStage(node, this.host.camera);
  }
}

function labelOf(node: DANode): string {
  return (node.label?.text() ?? '').trim() || '(unlabeled)';
}
