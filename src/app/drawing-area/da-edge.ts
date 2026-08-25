import Konva from 'konva';
import {DANode} from './da-node';
import {DALabel} from './da-label';
import {DAWaypoint} from './da-waypoint';
import {nextId} from './id-generator';
import {EdgeDirectedness, LineStyle} from './command.model';
import {
  anchorPosition, cycleSide, EdgeLabelSide, LABEL_T_MAX, LABEL_T_MIN,
  directionalLabelAnchorStep, nextTStop, pathLength, projectPointToPath,
  sideFromSignedDist,
} from './edge-label-anchor';
import { sampleSmoothPath } from './routing-curve';

/** An entry in `DAEdge._controlPoints`. Plain `{x,y}` bend points come from
 *  routers; editable points (including a self-loop's initial bends) carry
 *  `waypointId` (linking to a `DAWaypoint` glyph) and `pinned` (whether
 *  routers should preserve the point's position when they re-route). */
export interface EdgeControlPoint {
  x: number;
  y: number;
  waypointId?: string;
  pinned?: boolean;
}

export class DAEdge {
  /** Semantic tags loaded from the graph document. */
  public tags: string[] = [];
  readonly id: string;
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  private _navFocused: boolean = false;
  private _navUnderlay: Konva.Line | null = null;
  private _selectionUnderlay: Konva.Line | null = null;
  private _directionGradient: {from: string; to: string} | null = null;
  private _undirectedColor: string | null = null;
  private _bidirectionalColor: string | null = null;
  public readonly _line: Konva.Arrow;
  // Not readonly: reverseDirection() swaps them in place so an edge can be
  // flipped without losing its id, labels or waypoints.
  public srcNode: DANode;
  public destNode: DANode;
  private _labels: DALabel[] = [];
  private _waypointGlyphs: Map<string, DAWaypoint> = new Map();

  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly NAV_FOCUS_UNDERLAY_WIDTH = 18;
  public readonly NAV_FOCUS_UNDERLAY_OPACITY = 0.4;
  /** Selection band (da-243). Narrower than the nav band and in the shared
   *  selection accent rather than the edge's own colour, so "selected" and
   *  "being navigated" stay tellable apart when both are on one edge. */
  public readonly SELECTION_UNDERLAY_WIDTH = 11;
  public readonly SELECTION_UNDERLAY_OPACITY = 0.55;
  public readonly SELECTION_COLOR = '#33aaff';
  public readonly POINTER_LENGTH = 10;
  public readonly POINTER_WIDTH = 10;
  /** Pull the rendered endpoint out from the node perimeter by this many
   *  pixels along the last segment direction. Set to 0 once the sim started
   *  pinning end beads on the line so edges approach the node perpendicular
   *  to the face — at that approach the arrowhead doesn't clip behind the
   *  face, so a standoff is no longer needed (and the user noticed the gap). */
  public readonly ARROW_STANDOFF = 0;

  private _strokeColor: string = 'black';
  private _fillColor: string = 'black';
  private _directedness: EdgeDirectedness = 'directed';
  private _lineStyle: LineStyle = 'solid';
  private _controlPoints: EdgeControlPoint[] = [];
  /** Default-route lane used to keep multiple loops on one node distinct. */
  public readonly selfLoopLane: number;
  /** Last node position folded into this loop's absolute waypoint positions. */
  private _selfLoopNodePosition: {x: number; y: number} | null = null;
  /** Konva.Arrow's tension: 0 renders the points as a polyline (charged-spring
   *  routing). > 0 renders them as a smooth Catmull-Rom-derived curve through
   *  the same points (Bezier routing). Konva tracks the curve tangent for the
   *  arrowhead automatically. */
  public readonly SMOOTH_TENSION = 0.5;
  private _renderTension: number = this.SMOOTH_TENSION;

  constructor(srcNode: DANode, destNode: DANode, label: string, id?: string,
              colors?: { stroke?: string; fill?: string }, selfLoopLane = 0) {
    this.id = id ?? nextId();
    this.group = new Konva.Group();
    this.srcNode = srcNode;
    this.destNode = destNode;
    this.selfLoopLane = Math.max(0, Math.floor(selfLoopLane));
    if (colors?.stroke) this._strokeColor = colors.stroke;
    if (colors?.fill) this._fillColor = colors.fill;

    if (srcNode === destNode) {
      this._selfLoopNodePosition = {
        x: srcNode.konvaGroup.x(),
        y: srcNode.konvaGroup.y(),
      };
      // Self-loops are editable from birth: their two visible bends are real
      // waypoint-backed control points, never implicit/hidden geometry.
      this._controlPoints = this.buildSelfLoopPoints(srcNode)
        .slice(1, -1)
        .map(point => ({...point, waypointId: nextId(), pinned: false}));
    }

    srcNode.addOutgoingEdge(this);
    destNode.addIncomingEdge(this);

    this._line = new Konva.Arrow({
      points: this.calculatePoints(srcNode, destNode),
      stroke: this.stroke(),
      strokeWidth: this.strokeWidth(),
      fill: this._fillColor,
      pointerLength: this.POINTER_LENGTH,
      pointerWidth: this.POINTER_WIDTH,
      tension: this._renderTension,
    });
    this.group.add(this._line);
    if (this._controlPoints.length > 0) {
      this.assignControlPoints(this._controlPoints);
    }
    this.applyDirectedness();
    this.applyLineStyle();
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this._line.strokeWidth(this.strokeWidth());
    this.applySelectionBand();
  }

  get navFocused(): boolean {
    return this._navFocused;
  }

  /** Navigation focus (move-by-graph): the edge currently being traversed.
   *  Deliberately NOT a selection — it renders as a wide semi-transparent
   *  underlay band in the edge's own stroke color (theme- and
   *  custom-color-safe), a highlighter track clearly distinct from the
   *  thick-stroke look of a real selection, and no command treats it as
   *  selected. */
  set navFocused(value: boolean) {
    this._navFocused = value;
    this.applyNavFocus();
  }

  /** Set the directedness-aware color scheme. `gradient` fades source → dest
   *  for *directed* edges (readable flow at any zoom); `undirected` and
   *  `bidirectional` are flat hues used when there is no single direction —
   *  the gradient is meaningless there. Any field null falls back to the
   *  plain stroke color. */
  setDirectionColors(scheme: {gradient?: {from: string; to: string} | null;
                              undirected?: string | null;
                              bidirectional?: string | null} | null): void {
    this._directionGradient = scheme?.gradient ?? null;
    this._undirectedColor = scheme?.undirected ?? null;
    this._bidirectionalColor = scheme?.bidirectional ?? null;
    this.applyEdgeStroke();
  }

  /** Resolve the stroke/fill from the edge's directedness: undirected and
   *  bidirectional get their own flat color (no gradient — there is no
   *  single flow direction to depict); a directed edge uses the gradient if
   *  one is set, else the plain stroke. */
  private applyEdgeStroke(): void {
    const flat = (color: string) => {
      // Clear to null, not []: Konva's hasStroke() treats an empty stops
      // array as truthy and then renders a zero-stop (transparent) gradient
      // instead of the flat stroke — the line would vanish.
      this._line.strokeLinearGradientColorStops(null as unknown as number[]);
      this._line.stroke(color);
      this._line.fill(color);
    };
    if (this._directedness === 'undirected') {
      flat(this._undirectedColor ?? this._strokeColor);
      return;
    }
    if (this._directedness === 'bidirectional') {
      flat(this._bidirectionalColor ?? this._strokeColor);
      return;
    }
    if (!this._directionGradient) {
      flat(this._strokeColor);
      return;
    }
    const points = this.getPathPoints();
    if (points.length < 2) return;
    const a = points[0];
    const b = points[points.length - 1];
    // Konva prefers the flat color when both are set; clear it so the
    // gradient shows. Gradient coordinates are in the line's own space,
    // which is the layer space (the group is untransformed).
    this._line.stroke(undefined as unknown as string);
    this._line.strokeLinearGradientStartPoint({x: a.x, y: a.y});
    this._line.strokeLinearGradientEndPoint({x: b.x, y: b.y});
    this._line.strokeLinearGradientColorStops(
      [0, this._directionGradient.from, 1, this._directionGradient.to]);
    this._line.fill(this._directionGradient.to);
  }

  /** A selected edge gets an accent band under its stroke. The stroke also
   *  thickens 2 → 4, but that alone is invisible when zoomed out — it scales
   *  with the diagram, so at 25% a "thick" selected edge is one pixel. The
   *  band is drawn at a constant screen width instead, because it is UI
   *  chrome rather than diagram geometry (da-243). */
  private applySelectionBand(): void {
    if (this._isSelected) {
      if (!this._selectionUnderlay) {
        this._selectionUnderlay = new Konva.Line({
          points: this._line.points(),
          stroke: this.SELECTION_COLOR,
          strokeWidth: this.SELECTION_UNDERLAY_WIDTH,
          opacity: this.SELECTION_UNDERLAY_OPACITY,
          lineCap: 'round',
          lineJoin: 'round',
          listening: false,
          strokeScaleEnabled: false,
        });
        this.group.add(this._selectionUnderlay);
      }
      this._selectionUnderlay.points(this._line.points());
      this._selectionUnderlay.tension(this._renderTension);
      this._selectionUnderlay.visible(true);
      // Above the nav band (so a navigated selection still reads as
      // selected) but below the edge's own stroke.
      this._selectionUnderlay.moveToBottom();
      this._navUnderlay?.moveToBottom();
    } else {
      this._selectionUnderlay?.visible(false);
    }
  }

  private applyNavFocus(): void {
    if (this._navFocused) {
      if (!this._navUnderlay) {
        this._navUnderlay = new Konva.Line({
          points: this._line.points(),
          strokeWidth: this.NAV_FOCUS_UNDERLAY_WIDTH,
          opacity: this.NAV_FOCUS_UNDERLAY_OPACITY,
          lineCap: 'round',
          lineJoin: 'round',
          listening: false,
          // Constant screen-pixel width at every zoom level: the band is the
          // "you are navigating here" affordance, not diagram geometry.
          strokeScaleEnabled: false,
        });
        this.group.add(this._navUnderlay);
        this._navUnderlay.moveToBottom();
      }
      this._navUnderlay.points(this._line.points());
      this._navUnderlay.stroke(this._strokeColor);
      this._navUnderlay.tension(this._renderTension);
      this._navUnderlay.visible(true);
    } else {
      this._navUnderlay?.visible(false);
    }
  }

  private strokeWidth() {
    return this._isSelected ? this.STROKE_WIDTH_SELECTED : this.STROKE_WIDTH_NORMAL;
  }

  private stroke() {
    return this._strokeColor;
  }

  get directedness(): EdgeDirectedness {
    return this._directedness;
  }

  set directedness(value: EdgeDirectedness) {
    this._directedness = value;
    this.applyDirectedness();
  }

  get lineStyle(): LineStyle {
    return this._lineStyle;
  }

  set lineStyle(value: LineStyle) {
    this._lineStyle = value;
    this.applyLineStyle();
  }

  private applyDirectedness(): void {
    const pointerLength = this._directedness === 'undirected' ? 0 : this.POINTER_LENGTH;
    const pointerWidth = this._directedness === 'undirected' ? 0 : this.POINTER_WIDTH;
    this._line.pointerLength(pointerLength);
    this._line.pointerWidth(pointerWidth);
    this._line.pointerAtBeginning(this._directedness === 'bidirectional');
    // Directedness drives the color scheme (undirected/bidirectional are flat).
    this.applyEdgeStroke();
  }

  private applyLineStyle(): void {
    const dash = this._lineStyle === 'dashed' ? [10, 5] : this._lineStyle === 'dotted' ? [2, 4] : [];
    this._line.dash(dash);
    this._line.dashEnabled(dash.length > 0);
  }

  applyColors(colors: { stroke: string; fill: string }): void {
    this._strokeColor = colors.stroke;
    this._fillColor = colors.fill;
    this._line.stroke(this._strokeColor);
    this._line.fill(this._fillColor);
    this._waypointGlyphs.forEach(wp => wp.applyColors({stroke: this._strokeColor}));
    this.applyNavFocus(); // the glow follows the stroke color
    this.applyEdgeStroke(); // directedness color scheme outranks theme stroke
  }

  get labels(): DALabel[] {
    return this._labels;
  }

  /** Flip which end is the source, keeping the rendered path where it is.
   *  The node adjacency lists are re-hung, the bend points are reversed (the
   *  polyline is stored source→dest) and every label's arc-length anchor is
   *  mirrored (t → 1-t) so labels stay physically put. `side` is
   *  screen-stable by definition, so it is left alone. */
  reverseDirection(): void {
    this.srcNode.removeOutgoingEdge(this);
    this.destNode.removeIncomingEdge(this);

    const oldSrc = this.srcNode;
    this.srcNode = this.destNode;
    this.destNode = oldSrc;

    this.srcNode.addOutgoingEdge(this);
    this.destNode.addIncomingEdge(this);

    this._controlPoints = [...this._controlPoints].reverse();
    for (const label of this._labels) {
      label.edgeT = 1 - label.edgeT;
    }
    this.refreshGeometry();
  }

  addLabel(label: DALabel): void {
    this._labels.push(label);
    this.group.add(label.konvaGroup);
    this.positionLabel(label);
  }

  /** Set a label's anchor (t, side) from its current absolute x/y by
   *  projecting onto the rendered path. Used when restoring legacy data
   *  that stored absolute label positions. */
  adoptLabelPosition(label: DALabel): void {
    const projected = projectPointToPath(this.getPathPoints(), {x: label.x, y: label.y});
    if (!projected) return;
    label.edgeT = projected.t;
    label.side = sideFromSignedDist(projected.signedDist, this.labelSideClearance(label) / 2);
  }

  /** Slide a label along the path by a pixel distance (negative = toward
   *  the source). The anchor fraction is clamped to the outer canonical
   *  stops so the label stays clear of node faces and arrowheads. */
  slideLabelBy(label: DALabel, distancePx: number): void {
    const total = pathLength(this.getPathPoints());
    if (total < 1e-9) return;
    label.edgeT = Math.min(Math.max(label.edgeT + distancePx / total, LABEL_T_MIN), LABEL_T_MAX);
    this.positionLabel(label);
  }

  /** Jump a label to the next canonical stop (start / middle / end) in the
   *  given direction. */
  snapLabelToNextStop(label: DALabel, direction: 1 | -1): void {
    label.edgeT = nextTStop(label.edgeT, direction);
    this.positionLabel(label);
  }

  /** Step a label through the above → on → below cycle. `direction` +1
   *  moves it downward, -1 upward. */
  cycleLabelSide(label: DALabel, direction: 1 | -1): void {
    label.side = cycleSide(label.side, direction);
    this.positionLabel(label);
  }

  /** Move in a cardinal screen direction, choosing along-path motion or a
   * side change according to the edge angle. Opposite-screen moves no-op. */
  dragLabelToward(
    label: DALabel,
    direction: {x: number; y: number},
    distance: number,
    coarse = false,
  ): void {
    const anchor = directionalLabelAnchorStep(
      this.getPathPoints(),
      label.edgeT,
      label.side,
      this.labelSideClearance(label),
      direction,
      distance,
      {
        coarse,
        labelSize: {width: label.width, height: label.height},
        keepOutRects: [...new Set([this.srcNode, this.destNode])].map(node => ({
          x: node.group.x(),
          y: node.group.y(),
          width: node.NODE_WIDTH,
          height: node.NODE_HEIGHT,
        })),
        keepOutPadding: 4,
      },
    );
    if (!anchor) return;
    label.edgeT = anchor.t;
    label.side = anchor.side;
    this.positionLabel(label);
  }

  /** Set a label's anchor directly and re-place it. */
  setLabelAnchor(label: DALabel, edgeT: number, side: EdgeLabelSide): void {
    label.edgeT = Math.min(Math.max(edgeT, LABEL_T_MIN), LABEL_T_MAX);
    label.side = side;
    this.positionLabel(label);
  }

  /** Perpendicular distance from the line at which an above/below label
   *  centers: half the label box plus a small gap past the line stroke. */
  private labelSideClearance(label: DALabel): number {
    return label.height / 2 + this.STROKE_WIDTH_SELECTED / 2 + 2;
  }

  /** Derive a label's absolute position from its (edgeT, side) anchor on
   *  the current rendered path. */
  private positionLabel(label: DALabel): void {
    const pos = anchorPosition(this.getPathPoints(), label.edgeT, label.side,
      this.labelSideClearance(label));
    if (pos) label.position = pos;
  }

  private positionLabels(): void {
    this._labels.forEach(label => this.positionLabel(label));
  }

  removeLabel(label: DALabel): void {
    const index = this._labels.indexOf(label);
    if (index > -1) {
      this._labels.splice(index, 1);
      label.konvaGroup.remove();
    }
  }

  /** Returns the polyline points the edge currently renders along.
   *  Endpoints aim toward the nearest control point (or the far node center if there are none),
   *  so the perimeter intersection stays correct on bent edges. Each endpoint
   *  is pulled outward by ARROW_STANDOFF along the line direction so the
   *  arrowhead base does not clip behind the node face on shallow angles. */
  getPathPoints(): { x: number; y: number }[] {
    if (this.srcNode === this.destNode) {
      this.syncSelfLoopPosition();
      const defaults = this.buildSelfLoopPoints(this.srcNode);
      // A self-loop has two deliberately distinct attachment points on the
      // node. Keep those endpoints, while its explicit control points own all
      // geometry between them just like they do for an ordinary edge.
      return [
        defaults[0],
        ...this._controlPoints.map(p => ({x: p.x, y: p.y})),
        defaults[defaults.length - 1],
      ];
    }
    const srcAimTarget = this.aimTarget(
      this.srcNode, this._controlPoints, this.getNodeCenter(this.destNode));
    const destAimTarget = this.aimTarget(
      this.destNode, [...this._controlPoints].reverse(), this.getNodeCenter(this.srcNode));
    const srcEdge = this.srcNode.getEdgePoint(srcAimTarget.x, srcAimTarget.y);
    const destEdge = this.destNode.getEdgePoint(destAimTarget.x, destAimTarget.y);
    return [
      this.applyArrowStandoff(srcEdge, srcAimTarget),
      ...this._controlPoints.map(p => ({x: p.x, y: p.y})),
      this.applyArrowStandoff(destEdge, destAimTarget),
    ];
  }

  /** Which point an endpoint should aim at when choosing its attachment on
   *  the node perimeter.
   *
   *  The nearest control point is the natural choice, but one that has been
   *  dragged inside the node gives no usable direction: aiming from inside
   *  puts the attachment on an arbitrary side, and the stroke then has to
   *  double back across the node to reach it — the arrowhead ends up
   *  somewhere the line never arrives from. A control point exactly on the
   *  centre is worse still and flips the arrowhead 180° (da-259).
   *
   *  So walk outwards to the first control point that is genuinely outside
   *  the node, and fall back to the far node's centre if none is.
   *
   *  `candidates` must run from the endpoint outwards. */
  private aimTarget(node: DANode, candidates: readonly {x: number; y: number}[],
                    fallback: {x: number; y: number}): {x: number; y: number} {
    for (const cp of candidates) {
      if (!this.pointInsideNode(node, cp)) return cp;
    }
    return fallback;
  }

  private pointInsideNode(node: DANode, p: {x: number; y: number}): boolean {
    const pos = node.konvaGroup.position();
    return p.x >= pos.x && p.x <= pos.x + node.NODE_WIDTH
        && p.y >= pos.y && p.y <= pos.y + node.NODE_HEIGHT;
  }

  /** Sample the path Konva actually paints, including the collinear endpoint
   *  stubs and spline tension. Quality metrics use this instead of the raw
   *  control polygon so a harmless control segment behind a curved route is
   *  not reported as a visible node pierce. */
  getRenderedPathPoints(stepsPerSegment = 12): {x: number; y: number}[] {
    const points = this.renderPoints();
    return this.smoothRendering
      ? sampleSmoothPath(points, this.SMOOTH_TENSION, stepsPerSegment)
      : points;
  }

  /** Push a perimeter endpoint outward (toward `aim`, i.e., along the
   *  last segment direction away from the node) by ARROW_STANDOFF. */
  private applyArrowStandoff(endpoint: {x: number; y: number}, aim: {x: number; y: number}): {x: number; y: number} {
    const dx = aim.x - endpoint.x;
    const dy = aim.y - endpoint.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return endpoint;
    const k = this.ARROW_STANDOFF / dist;
    return {x: endpoint.x + dx * k, y: endpoint.y + dy * k};
  }

  public calculatePoints(srcNode: DANode, destNode: DANode): number[] {
    return this.renderPoints().flatMap(p => [p.x, p.y]);
  }

  /** Points handed to Konva: the logical path plus short collinear "stub"
   *  points inside the first and last chords. With tension, the rendered
   *  spline's end tangents follow the end chords — on a bent route that made
   *  arrowheads touch a node while pointing somewhere other than its center
   *  (and departures leave at odd tangents). The stubs pin the end chords
   *  onto the node-center rays, so arrival and departure always aim at the
   *  centers. Render-only: waypoint insertion, labels, routing, and nav
   *  stops keep using getPathPoints(), whose segments map 1:1 to control
   *  points. */
  private renderPoints(): { x: number; y: number }[] {
    const pts = this.getPathPoints();
    if (this._controlPoints.length === 0 || pts.length < 3
        || this.srcNode === this.destNode) {
      return pts;
    }
    const STUB = 26;
    const stubToward = (end: {x: number; y: number}, toward: {x: number; y: number}) => {
      const dx = toward.x - end.x;
      const dy = toward.y - end.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) return null;
      const k = Math.min(STUB, dist * 0.45) / dist;
      return {x: end.x + dx * k, y: end.y + dy * k};
    };
    const srcStub = stubToward(pts[0], pts[1]);
    const destStub = stubToward(pts[pts.length - 1], pts[pts.length - 2]);
    return [
      pts[0],
      ...(srcStub ? [srcStub] : []),
      ...pts.slice(1, -1),
      ...(destStub ? [destStub] : []),
      pts[pts.length - 1],
    ];
  }

  /** Internal bend points between the src and dest endpoints. Each entry is
   *  either a router-generated bead (plain `{x,y}`) or a user-placed waypoint
   *  (carries `waypointId` and `pinned`). Routers iterate this for read-only
   *  access; they replace the array via `setControlPoints`, which preserves
   *  pinned waypoints. Empty array means the edge is a straight line. */
  get controlPoints(): readonly EdgeControlPoint[] {
    return this._controlPoints;
  }

  /** Replace router-generated bend points. Pinned user waypoints are preserved
   *  by being re-inserted at the index along the new polyline that minimizes
   *  total path-length increase. Unpinned waypoints are dropped (routers
   *  effectively overwrite them — pin them if you want them to survive). */
  setControlPoints(points: {x: number; y: number}[]): void {
    const pinned = this._controlPoints.filter(cp => cp.pinned);
    const fresh: EdgeControlPoint[] = points.map(p => ({x: p.x, y: p.y}));
    const merged = mergePinnedIntoSequence(this.srcAnchor(), this.destAnchor(), fresh, pinned);
    this.assignControlPoints(merged);
  }

  clearControlPoints(): void {
    if (this._controlPoints.length === 0) return;
    this.assignControlPoints([]);
  }

  /** Restore from a snapshot: preserve `waypointId` and `pinned` exactly as
   *  serialized. Used by `restoreGraph` (undo/redo, load from file). */
  restoreControlPoints(cps: readonly EdgeControlPoint[]): void {
    const restored: EdgeControlPoint[] = cps.map(c => ({
      x: c.x,
      y: c.y,
      ...(c.waypointId ? {waypointId: c.waypointId} : {}),
      ...(c.pinned ? {pinned: true} : {}),
    }));
    this.assignControlPoints(restored);
  }

  /** Insert a user-placed waypoint at `point`, choosing the index in the
   *  polyline that minimizes the total path-length increase. Returns the
   *  new `DAWaypoint` glyph. */
  insertWaypoint(point: {x: number; y: number}): DAWaypoint {
    const cps = [...this._controlPoints];
    const path = this.getPathPoints();
    const idx = bestInsertionIndex(path[0], path[path.length - 1], cps, point);
    return this.spliceWaypoint(cps, point, idx);
  }

  /** Insert a user-placed waypoint at `point` at the given control-point
   *  index. Used when the caller already knows exactly which polyline segment
   *  to split — e.g. when snapping a new waypoint onto the existing rendered
   *  path so the line shape doesn't change. `index` is the position in the
   *  `_controlPoints` array (0..length), which maps 1:1 to segments in
   *  `getPathPoints()`. */
  insertWaypointAt(point: {x: number; y: number}, index: number): DAWaypoint {
    const cps = [...this._controlPoints];
    const clamped = Math.max(0, Math.min(index, cps.length));
    return this.spliceWaypoint(cps, point, clamped);
  }

  private spliceWaypoint(cps: EdgeControlPoint[], point: {x: number; y: number}, idx: number): DAWaypoint {
    const cp: EdgeControlPoint = {
      x: point.x,
      y: point.y,
      waypointId: nextId(),
      pinned: false,
    };
    cps.splice(idx, 0, cp);
    this.assignControlPoints(cps);
    return this._waypointGlyphs.get(cp.waypointId!)!;
  }

  removeWaypoint(wp: DAWaypoint): void {
    const idx = this._controlPoints.findIndex(c => c.waypointId === wp.id);
    if (idx < 0) return;
    const cps = [...this._controlPoints];
    cps.splice(idx, 1);
    this.assignControlPoints(cps);
  }

  /** Move a waypoint by an absolute delta. The matching control point's
   *  coordinates and the glyph position both update; the polyline re-renders. */
  moveWaypoint(wp: DAWaypoint, dx: number, dy: number): void {
    const cp = this._controlPoints.find(c => c.waypointId === wp.id);
    if (!cp) return;
    cp.x += dx;
    cp.y += dy;
    wp.position = {x: cp.x, y: cp.y};
    this.refreshGeometry();
  }

  setWaypointPinned(wp: DAWaypoint, pinned: boolean): void {
    const cp = this._controlPoints.find(c => c.waypointId === wp.id);
    if (!cp) return;
    cp.pinned = pinned;
    wp.pinned = pinned;
  }

  /** Upgrade every plain control point (no waypointId) to a user-selectable
   *  waypoint glyph. Call after a router sets control points if you want the
   *  result to be interactively editable. Pinned waypoints are left alone. */
  promoteToWaypoints(): void {
    let changed = false;
    for (const cp of this._controlPoints) {
      if (!cp.waypointId) {
        cp.waypointId = nextId();
        changed = true;
      }
    }
    if (changed) this.assignControlPoints(this._controlPoints);
  }

  get waypoints(): DAWaypoint[] {
    return Array.from(this._waypointGlyphs.values());
  }

  setWaypointIndicatorsVisible(visible: boolean): void {
    this._waypointGlyphs.forEach(wp => wp.setIndicatorsVisible(visible));
  }

  /** Rebuild the `_waypointGlyphs` map from `_controlPoints`. Existing glyphs
   *  whose waypointId is still present are kept in place; new IDs get fresh
   *  glyphs; vanished IDs have their glyphs destroyed. The polyline is then
   *  redrawn. */
  private assignControlPoints(cps: EdgeControlPoint[]): void {
    // A self-loop never has router-only/hidden bends. This also migrates
    // snapshots produced by the old first-insertion behavior, where the two
    // default bends were serialized as plain points around one real waypoint.
    if (this.srcNode === this.destNode) {
      cps = cps.map(cp => cp.waypointId ? cp : {...cp, waypointId: nextId()});
    }
    this._controlPoints = cps;
    const presentIds = new Set<string>();
    for (const cp of cps) {
      if (!cp.waypointId) continue;
      presentIds.add(cp.waypointId);
      let glyph = this._waypointGlyphs.get(cp.waypointId);
      if (!glyph) {
        glyph = new DAWaypoint(cp.x, cp.y, cp.waypointId, {stroke: this._strokeColor});
        this._waypointGlyphs.set(cp.waypointId, glyph);
        this.group.add(glyph.konvaGroup);
      } else {
        glyph.position = {x: cp.x, y: cp.y};
      }
      glyph.pinned = !!cp.pinned;
    }
    for (const [id, glyph] of Array.from(this._waypointGlyphs.entries())) {
      if (!presentIds.has(id)) {
        glyph.konvaGroup.destroy();
        this._waypointGlyphs.delete(id);
      }
    }
    this.refreshGeometry();
  }

  /** Aim point at the src end of the polyline (first control point or, if
   *  none, the dest center). Used by `getPathPoints` for perimeter intersection. */
  private srcAnchor(): {x: number; y: number} {
    return this._controlPoints.length > 0
      ? this._controlPoints[0]
      : this.getNodeCenter(this.destNode);
  }

  private destAnchor(): {x: number; y: number} {
    return this._controlPoints.length > 0
      ? this._controlPoints[this._controlPoints.length - 1]
      : this.getNodeCenter(this.srcNode);
  }

  /** Place `count` control points evenly along the straight src→dest line.
   *  Used as starting positions for the physics sim. No-op for self-loops. */
  initializeStraightControlPoints(count: number): void {
    if (this.srcNode === this.destNode) return;
    if (count <= 0) {
      this.clearControlPoints();
      return;
    }
    const srcCenter = this.getNodeCenter(this.srcNode);
    const destCenter = this.getNodeCenter(this.destNode);
    const a = this.srcNode.getEdgePoint(destCenter.x, destCenter.y);
    const b = this.destNode.getEdgePoint(srcCenter.x, srcCenter.y);
    const pts: {x: number; y: number}[] = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      pts.push({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});
    }
    this.setControlPoints(pts);
  }

  /** Recompute the rendered Konva.Arrow points from current node positions
   *  and control points, and re-place labels from their path anchors.
   *  Cheaper than recreating the edge. */
  refreshGeometry(): void {
    this._line.points(this.renderPoints().flatMap(p => [p.x, p.y]));
    if (this._navFocused) this.applyNavFocus(); // underlay tracks the path
    if (this._isSelected) this.applySelectionBand();
    this.applyEdgeStroke(); // endpoints moved → gradient coords refresh
    this.positionLabels();
  }

  /** Toggle between polyline rendering (charged-spring) and smooth-curve
   *  rendering (Bezier-style spline through the control points). The
   *  underlying control points and arrow geometry are unchanged. */
  setSmoothRendering(smooth: boolean): void {
    this._renderTension = smooth ? this.SMOOTH_TENSION : 0;
    this._line.tension(this._renderTension);
    if (this._navFocused) this.applyNavFocus();
    if (this._isSelected) this.applySelectionBand();
  }

  get smoothRendering(): boolean {
    return this._renderTension > 0;
  }

  private getNodeCenter(node: DANode): {x: number; y: number} {
    return {
      x: node.konvaGroup.x() + node.NODE_WIDTH / 2,
      y: node.konvaGroup.y() + node.NODE_HEIGHT / 2,
    };
  }

  /** Keep absolute self-loop waypoints attached when their node is moved.
   *  Non-loop edges are re-routed after node movement, but self-loops are
   *  deliberately excluded from routers, so they translate with the node. */
  private syncSelfLoopPosition(): void {
    if (this.srcNode !== this.destNode || !this._selfLoopNodePosition) return;
    const current = {
      x: this.srcNode.konvaGroup.x(),
      y: this.srcNode.konvaGroup.y(),
    };
    const dx = current.x - this._selfLoopNodePosition.x;
    const dy = current.y - this._selfLoopNodePosition.y;
    if (dx === 0 && dy === 0) return;
    for (const cp of this._controlPoints) {
      cp.x += dx;
      cp.y += dy;
      if (cp.waypointId) {
        const glyph = this._waypointGlyphs.get(cp.waypointId);
        if (glyph) glyph.position = {x: cp.x, y: cp.y};
      }
    }
    this._selfLoopNodePosition = current;
  }

  private buildSelfLoopPoints(node: DANode): {x: number; y: number}[] {
    const x = node.konvaGroup.x();
    const y = node.konvaGroup.y();
    const width = node.NODE_WIDTH;
    const height = node.NODE_HEIGHT;
    const laneStep = Math.max(22, Math.min(width, height) * 0.25);
    const loopOffsetX = Math.max(28, width * 0.32) + this.selfLoopLane * laneStep;
    const loopOffsetY = Math.max(18, height * 0.2) + this.selfLoopLane * laneStep * 0.45;

    return [
      {x: x + width, y: y + height * 0.35},
      {x: x + width + loopOffsetX, y: y + height * 0.22 - loopOffsetY},
      {x: x + width + loopOffsetX, y: y + height * 0.78 + loopOffsetY},
      {x: x + width, y: y + height * 0.65},
    ];
  }

  get konvaGroup(): Konva.Group {
    return this.group;
  }

  get line(): Konva.Arrow {
    return this._line;
  }

  zIndex() {
    return this.group.zIndex();
  }
}

/** Insertion index that minimizes the total polyline length increase when
 *  splicing `pt` into the sequence `[src, ...cps, dest]`. Returns an index
 *  into `cps` (0..cps.length). For each candidate segment k (between point
 *  k-1 and k of the [src, ...cps, dest] sequence), insertion cost is
 *  |segStart→pt| + |pt→segEnd| − |segStart→segEnd|. The index returned is
 *  k − 1 clamped to [0, cps.length] so `cps.splice(idx, 0, pt)` produces
 *  the chosen sequence. */
export function bestInsertionIndex(
  src: {x: number; y: number},
  dest: {x: number; y: number},
  cps: readonly {x: number; y: number}[],
  pt: {x: number; y: number},
): number {
  const seq: {x: number; y: number}[] = [src, ...cps, dest];
  let bestK = 1;
  let bestCost = Infinity;
  for (let k = 1; k < seq.length; k++) {
    const a = seq[k - 1];
    const b = seq[k];
    const cost = Math.hypot(pt.x - a.x, pt.y - a.y)
               + Math.hypot(b.x - pt.x, b.y - pt.y)
               - Math.hypot(b.x - a.x, b.y - a.y);
    if (cost < bestCost) {
      bestCost = cost;
      bestK = k;
    }
  }
  // Insertion at array index = bestK - 1 so the chosen segment is split.
  return bestK - 1;
}

/** Splice `pinned` waypoints back into a fresh sequence of router beads.
 *  Each pinned point is inserted at the index that minimizes the polyline
 *  length increase (`bestInsertionIndex`). Pinned points are inserted in
 *  the order they appeared in the previous polyline; this matches the
 *  intuition that the order along the path is stable. */
export function mergePinnedIntoSequence(
  src: {x: number; y: number},
  dest: {x: number; y: number},
  fresh: EdgeControlPoint[],
  pinned: EdgeControlPoint[],
): EdgeControlPoint[] {
  const result: EdgeControlPoint[] = [...fresh];
  for (const p of pinned) {
    const idx = bestInsertionIndex(src, dest, result, p);
    result.splice(idx, 0, p);
  }
  return result;
}
