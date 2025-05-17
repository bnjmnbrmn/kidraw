import Konva from "konva";

interface Point {
  x: number;
  y: number;
}

class LineSegment {
  constructor(public p1: Point, public p2: Point) {
  }

  private getLineIntersection(other: LineSegment): { x: number; y: number } | 'coincident' | 'parallel' {

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
        return (this.p1.x <= this.p2.x
          ? betweenIncl(this.p1.x, lineIntersection.x, this.p2.x)
          : betweenIncl(this.p2.x, lineIntersection.x, this.p1.x));

    }
  }
}

function betweenIncl(a: number, b: number, c: number) {
  return a <= b && b <= c;
}

/**
 * Extracts line segments from a Konva.Line node.
 */
function getLineSegments(lineNode: Konva.Line): LineSegment[] {
  const points = lineNode.points();
  const absoluteTransform = lineNode.getAbsoluteTransform();
  const segments: LineSegment[] = [];

  for (let i = 0; i < points.length - 2; i += 2) {
    const p1: Point = {x: points[i], y: points[i + 1]};
    const q1: Point = {x: points[i + 2], y: points[i + 3]};

    const transformedP1 = absoluteTransform.point(p1);
    const transformedQ1 = absoluteTransform.point(q1);

    segments.push(new LineSegment( transformedP1, transformedQ1));
  }
  return segments;
}

/**
 * Checks if a Konva.Line intersects the bounding box of a Konva.Group.
 */
export function doesLineIntersectGroup(lineNode: Konva.Line, groupNode: Konva.Group): boolean {
  const groupRect = groupNode.getClientRect();

  const topLeft = {x: groupRect.x, y: groupRect.y};
  const topRight = {x: groupRect.x + groupRect.width, y: groupRect.y};
  const bottomRight = {x: groupRect.x + groupRect.width, y: groupRect.y + groupRect.height};
  const bottomLeft = {x: groupRect.x, y: groupRect.y + groupRect.height};

  // Create segments for the group's bounding box
  const rectSegments: LineSegment[] = [
    new LineSegment(topLeft, topRight),
    new LineSegment(topRight, bottomRight),
    new LineSegment(bottomRight, bottomLeft),
    new LineSegment(bottomLeft, topLeft)
  ];

  const lineSegments = getLineSegments(lineNode);

  // 1. Broad-phase check: Check if bounding boxes even overlap
  const lineRect = lineNode.getClientRect();
  if (
    lineRect.x > groupRect.x + groupRect.width ||
    lineRect.x + lineRect.width < groupRect.x ||
    lineRect.y > groupRect.y + groupRect.height ||
    lineRect.y + lineRect.height < groupRect.y
  ) {
    return false;
  }

  for (const lineSeg of lineSegments) {
    for (const rectSeg of rectSegments) {
      if (lineSeg.intersectsWith(rectSeg)) {
        return true;
      }
    }
  }

  const firstSegment = lineSegments[0];
  if (firstSegment) {
    const firstPointX = firstSegment.p1.x;
    const firstPointY = firstSegment.p1.y;
    if (
      firstPointX >= groupRect.x &&
      firstPointX <= groupRect.x + groupRect.width &&
      firstPointY >= groupRect.y &&
      firstPointY <= groupRect.y + groupRect.height
    ) {
      return true;
    }
  }
  return false;
}
