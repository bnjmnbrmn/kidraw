import Konva from "konva";
import {IRect} from 'konva/lib/types';

export interface Point {
  x: number;
  y: number;
}

class LineSegment {
  constructor(public p1: Point, public p2: Point) {
  }

  public getLineIntersection(other: LineSegment): { x: number; y: number } | 'coincident' | 'parallel' {

    const x1 = this.p1.x;
    const x2 = this.p2.x;
    const y1 = this.p1.y;
    const y2 = this.p2.y;

    const A1 = y2 - y1;
    const B1 = x1 - x2;
    const C1 = A1 * x1 + B1 * y1; // or x1 * y2 - x2 * y1;

    const x3 = other.p1.x;
    const x4 = other.p2.x
    const y3 = other.p1.y;
    const y4 = other.p2.y


    const A2 = y4 - y3;
    const B2 = x3 - x4;
    const C2 = A2 * x3 + B2 * y3; // or x3 * y4 - x4 * y3;

    const denominator = A1 * B2 - A2 * B1;

    if (denominator === 0) {
      if ((A1 * C2 - A2 * C1 === 0) && (C1 * B2 - C2 * B1 === 0)) {
        return 'coincident';
      }
      return 'parallel';
    }

    const intersectionX = (B2 * C1 - B1 * C2) / denominator;
    const intersectionY = (A1 * C2 - A2 * C1) / denominator;

    return {x: intersectionX, y: intersectionY};
  }

  intersectsWith(other: LineSegment): boolean {
    let lineIntersection = this.getLineIntersection(other);
    switch (lineIntersection) {
      case "coincident":
        return (other.p1.x <= other.p2.x
          ? betweenIncl(other.p1.x, this.p1.x, other.p2.x) || betweenIncl(other.p1.x, this.p2.x, other.p2.x)
          : betweenIncl(other.p2.x, this.p1.x, other.p1.x) || betweenIncl(other.p2.x, this.p2.x, other.p1.x));
      case "parallel":
        return false;
      default:

        const thisMinX = Math.min(this.p1.x, this.p2.x);
        const thisMaxX = Math.max(this.p1.x, this.p2.x);
        const otherMinX = Math.min(other.p1.x, other.p2.x);
        const otherMaxX = Math.max(other.p1.x, other.p2.x);

        const thisMinY = Math.min(this.p1.y, this.p2.y);
        const thisMaxY = Math.max(this.p1.y, this.p2.y);
        const otherMinY = Math.min(other.p1.y, other.p2.y);
        const otherMaxY = Math.max(other.p1.y, other.p2.y);

        return (betweenIncl(thisMinX, lineIntersection.x, thisMaxX)
          && betweenIncl(otherMinX, lineIntersection.x, otherMaxX)
          && betweenIncl(thisMinY, lineIntersection.y, thisMaxY)
          && betweenIncl(otherMinY, lineIntersection.y, otherMaxY));

    }
  }
}

function betweenIncl(a: number, b: number, c: number) {
  return a <= b && b <= c;
}

/**
 * Extracts line segments from a Konva.Line node.
 */
function lineSegments(lineNode: Konva.Line): LineSegment[] {
  const points = lineNode.points();
  const absoluteTransform = lineNode.getAbsoluteTransform();
  const segments: LineSegment[] = [];

  for (let i = 0; i < points.length - 2; i += 2) {
    const p1: Point = {x: points[i], y: points[i + 1]};
    const q1: Point = {x: points[i + 2], y: points[i + 3]};

    const transformedP1 = absoluteTransform.point(p1);
    const transformedQ1 = absoluteTransform.point(q1);

    segments.push(new LineSegment(transformedP1, transformedQ1));
  }
  return segments;
}

function rectSegments(gR: IRect) {
  const gRTopLeft = {x: gR.x, y: gR.y};
  const gRTopRight = {x: gR.x + gR.width, y: gR.y};
  const gRBottomRight = {x: gR.x + gR.width, y: gR.y + gR.height};
  const gRBottomLeft = {x: gR.x, y: gR.y + gR.height};

  const gRSegments: LineSegment[] = [
    new LineSegment(gRTopLeft, gRTopRight),
    new LineSegment(gRTopRight, gRBottomRight),
    new LineSegment(gRBottomRight, gRBottomLeft),
    new LineSegment(gRBottomLeft, gRTopLeft)
  ];
  return gRSegments;
}

export function rectsIntersect(rectA: IRect, rectB: IRect) {
  return !(rectA.x > rectB.x + rectB.width ||
    rectA.x + rectA.width < rectB.x ||
    rectA.y > rectB.y + rectB.height ||
    rectA.y + rectA.height < rectB.y);
}

export function rectContainsPoint(rect: IRect, point: Point) {
  return point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height;
}

export function arrowPointForLineToGroup(line: Konva.Line, group: Konva.Group): Point | null {

  const lineSegs = lineSegments(line);
  const lastLineSeg = lineSegs[lineSegs.length - 1];

  const groupBoundingRect = group.getClientRect();

  if (!rectContainsPoint(groupBoundingRect, lastLineSeg.p2) || rectContainsPoint(groupBoundingRect, lastLineSeg.p1)) {
    return null;
  }

  const groupRectSegments = rectSegments(groupBoundingRect);

  let intersectionPoints: Point[] = []
  for (const groupRectSeg of groupRectSegments) {
    const lineIntersection: { x: number; y: number } | "coincident" | "parallel" = lastLineSeg.getLineIntersection(groupRectSeg);
    if (lineIntersection != "coincident" && lineIntersection != "parallel") {
      intersectionPoints.push(lineIntersection);
    }
  }

  return closest(intersectionPoints, lastLineSeg.p1)
}

function distSquared(p1: Point, p2: Point) {
  return (p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y);
}

function closest(points: Point[], p1: Point) {

  if (points.length === 0) {
    return null;
  }

  let closestPoint = points[0];
  let closestPointDistSquared = distSquared(p1, closestPoint);
  for (let i = 1; i < points.length; i++) {
    const currentPoint = points[i];
    const currentPointDistSquared = distSquared(p1, currentPoint);
    if (currentPointDistSquared < closestPointDistSquared) {
      closestPoint = currentPoint;
    }
  }

  return closestPoint;
}

/**
 * Checks if a Konva.Line intersects the bounding box of a Konva.Group.
 */
export function lineIntersectsGroupBoundingRect(line: Konva.Line, group: Konva.Group): boolean {
  const groupBoundingRect = group.getClientRect();
  const lineBoundingRect = line.getClientRect();

  if (!rectsIntersect(lineBoundingRect, groupBoundingRect)) {
    return false;
  }

  const lineSegs = lineSegments(line);
  const gRSegs = rectSegments(groupBoundingRect);

  for (const lineSeg of lineSegs) {
    for (const rectSeg of gRSegs) {
      if (lineSeg.intersectsWith(rectSeg)) {
        return true;
      }
    }
  }

  if ( rectContainsPoint(groupBoundingRect, lineSegs[0].p1)) {
    return true;
  }

  return false;
}
