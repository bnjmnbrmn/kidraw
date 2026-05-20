import Konva from 'konva';
import {DANode} from './da-node';
import {DALabel} from './da-label';
import {DAWaypoint} from './da-waypoint';
import {nextId} from './id-generator';
import {EdgeDirectedness, LineStyle} from './command.model';

/** An entry in `DAEdge._controlPoints`. Plain `{x,y}` bend points come from
 *  routers; user-placed waypoints additionally carry `waypointId` (linking
 *  to a `DAWaypoint` glyph) and `pinned` (whether routers should preserve
 *  the point's position when they re-route). */
export interface EdgeControlPoint {
  x: number;
  y: number;
  waypointId?: string;
  pinned?: boolean;
}

export class DAEdge {
  readonly id: string;
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  public readonly _line: Konva.Arrow;
  public readonly srcNode: DANode;
  public readonly destNode: DANode;
  private _labels: DALabel[] = [];
  private _waypointGlyphs: Map<string, DAWaypoint> = new Map();

  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
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
  /** Konva.Arrow's tension: 0 renders the points as a polyline (charged-spring
   *  routing). > 0 renders them as a smooth Catmull-Rom-derived curve through
   *  the same points (Bezier routing). Konva tracks the curve tangent for the
   *  arrowhead automatically. */
  private _renderTension: number = 0;
  public readonly SMOOTH_TENSION = 0.5;

  constructor(srcNode: DANode, destNode: DANode, label: string, id?: string,
              colors?: { stroke?: string; fill?: string }) {
    this.id = id ?? nextId();
    this.group = new Konva.Group();
    this.srcNode = srcNode;
    this.destNode = destNode;
    if (colors?.stroke) this._strokeColor = colors.stroke;
    if (colors?.fill) this._fillColor = colors.fill;

    srcNode.addOutgoingEdge(this);
    destNode.addIncomingEdge(this);

    this._line = new Konva.Arrow({
      points: this.calculatePoints(srcNode, destNode),
      stroke: this.stroke(),
      strokeWidth: this.strokeWidth(),
      fill: this._fillColor,
      pointerLength: this.POINTER_LENGTH,
      pointerWidth: this.POINTER_WIDTH,
    });
    this.group.add(this._line);
    this.applyDirectedness();
    this.applyLineStyle();
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this._line.strokeWidth(this.strokeWidth());
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
  }

  get labels(): DALabel[] {
    return this._labels;
  }

  addLabel(label: DALabel): void {
    this._labels.push(label);
    this.group.add(label.konvaGroup);
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
      return this.buildSelfLoopPoints(this.srcNode);
    }
    const srcAimTarget = this._controlPoints.length > 0
      ? this._controlPoints[0]
      : this.getNodeCenter(this.destNode);
    const destAimTarget = this._controlPoints.length > 0
      ? this._controlPoints[this._controlPoints.length - 1]
      : this.getNodeCenter(this.srcNode);
    const srcEdge = this.srcNode.getEdgePoint(srcAimTarget.x, srcAimTarget.y);
    const destEdge = this.destNode.getEdgePoint(destAimTarget.x, destAimTarget.y);
    return [
      this.applyArrowStandoff(srcEdge, srcAimTarget),
      ...this._controlPoints.map(p => ({x: p.x, y: p.y})),
      this.applyArrowStandoff(destEdge, destAimTarget),
    ];
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
    return this.getPathPoints().flatMap(p => [p.x, p.y]);
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
   *  new `DAWaypoint` glyph (caller is responsible for adding it to the
   *  Konva layer/group via `attachWaypointGlyph`). */
  insertWaypoint(point: {x: number; y: number}): DAWaypoint {
    const cps = [...this._controlPoints];
    const idx = bestInsertionIndex(this.srcAnchor(), this.destAnchor(), cps, point);
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

  get waypoints(): DAWaypoint[] {
    return Array.from(this._waypointGlyphs.values());
  }

  /** Rebuild the `_waypointGlyphs` map from `_controlPoints`. Existing glyphs
   *  whose waypointId is still present are kept in place; new IDs get fresh
   *  glyphs; vanished IDs have their glyphs destroyed. The polyline is then
   *  redrawn. */
  private assignControlPoints(cps: EdgeControlPoint[]): void {
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
    if (this.srcNode === this.destNode || count <= 0) {
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
   *  and control points. Cheaper than recreating the edge. */
  refreshGeometry(): void {
    this._line.points(this.getPathPoints().flatMap(p => [p.x, p.y]));
  }

  /** Toggle between polyline rendering (charged-spring) and smooth-curve
   *  rendering (Bezier-style spline through the control points). The
   *  underlying control points and arrow geometry are unchanged. */
  setSmoothRendering(smooth: boolean): void {
    this._renderTension = smooth ? this.SMOOTH_TENSION : 0;
    this._line.tension(this._renderTension);
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

  private buildSelfLoopPoints(node: DANode): {x: number; y: number}[] {
    const x = node.konvaGroup.x();
    const y = node.konvaGroup.y();
    const width = node.NODE_WIDTH;
    const height = node.NODE_HEIGHT;
    const loopOffsetX = Math.max(28, width * 0.32);
    const loopOffsetY = Math.max(18, height * 0.2);

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
