import { TestBed } from '@angular/core/testing';
import { DrawingLayer } from './drawing.layer';
import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import {
  DALabel,
  aboveSideOffset,
  polylineArcLength,
  projectOntoPolyline,
  sampleAtT,
} from './da-label';
import { DACrosshairs } from './da-crosshairs.group';
import { lineSegmentIntersectsRect, closestPointOnSegment } from './utils';
import Konva from 'konva';

describe('DrawingArea Unit Tests', () => {
  describe('DANode', () => {
    it('should create node with correct position', () => {
      const node = new DANode(100, 200, 'test');
      
      expect(node.konvaGroup.x()).toBe(100);
      expect(node.konvaGroup.y()).toBe(200);
      expect(node.label.text()).toBe('test');
    });

    it('should handle selection state correctly', () => {
      const node = new DANode(0, 0, 'test');
      
      expect(node.isSelected).toBe(false);
      
      node.isSelected = true;
      expect(node.isSelected).toBe(true);
      expect(node.rect.strokeWidth()).toBe(node.STROKE_WIDTH_SELECTED);
      
      node.isSelected = false;
      expect(node.isSelected).toBe(false);
      expect(node.rect.strokeWidth()).toBe(node.STROKE_WIDTH_NORMAL);
    });

    it('should return correct client rect', () => {
      const node = new DANode(100, 100, 'test');
      const rect = node.getClientRect();
      
      expect(Math.abs(rect.x - 100)).toBeLessThanOrEqual(5);
      expect(Math.abs(rect.y - 100)).toBeLessThanOrEqual(5);
      expect(Math.abs(rect.width - node.NODE_WIDTH)).toBeLessThanOrEqual(5);
      expect(Math.abs(rect.height - node.NODE_HEIGHT)).toBeLessThanOrEqual(5);
    });

    it('should return correct z-index', () => {
      const node = new DANode(0, 0, 'test');
      const zIndex = node.zIndex();
      
      expect(typeof zIndex).toBe('number');
    });

    it('should resize node dimensions within bounds', () => {
      const node = new DANode(0, 0, 'test');

      expect(node.resizeBy(40)).toBe(true);
      expect(node.NODE_WIDTH).toBe(node.DEFAULT_NODE_WIDTH + 40);
      expect(node.NODE_HEIGHT).toBe(node.DEFAULT_NODE_HEIGHT + 40);
      expect(node.rect.width()).toBe(node.NODE_WIDTH);
      expect(node.rect.height()).toBe(node.NODE_HEIGHT);
      expect(node.label.width()).toBe(node.NODE_WIDTH);
      expect(node.label.height()).toBe(node.NODE_HEIGHT);
    });

    it('should clamp node resizing at min/max bounds', () => {
      const node = new DANode(0, 0, 'test');

      expect(node.resizeBy(10000)).toBe(true);
      expect(node.NODE_WIDTH).toBe(node.MAX_NODE_SIZE);
      expect(node.resizeBy(1)).toBe(false);

      expect(node.resizeBy(-10000)).toBe(true);
      expect(node.NODE_WIDTH).toBe(node.MIN_NODE_SIZE);
      expect(node.resizeBy(-1)).toBe(false);
    });

    it('should adjust node label font size within bounds', () => {
      const node = new DANode(0, 0, 'test');

      expect(node.adjustLabelFontSizeBy(6)).toBe(true);
      expect(node.FONT_SIZE).toBe(node.DEFAULT_FONT_SIZE + 6);
      expect(node.label.fontSize()).toBe(node.FONT_SIZE);

      expect(node.adjustLabelFontSizeBy(10000)).toBe(true);
      expect(node.FONT_SIZE).toBe(node.MAX_FONT_SIZE);
      expect(node.adjustLabelFontSizeBy(1)).toBe(false);

      expect(node.adjustLabelFontSizeBy(-10000)).toBe(true);
      expect(node.FONT_SIZE).toBe(node.MIN_FONT_SIZE);
      expect(node.adjustLabelFontSizeBy(-1)).toBe(false);
    });
  });

  describe('DAEdge', () => {
    it('should create edge between two nodes', () => {
      const srcNode = new DANode(0, 0, 'src');
      const destNode = new DANode(200, 100, 'dest');
      const edge = new DAEdge(srcNode, destNode, 'test');
      
      expect(edge.konvaGroup).toBeDefined();
      expect(edge.line).toBeDefined();
      expect(edge.isSelected).toBe(false);
    });

    it('should calculate correct edge-to-edge points', () => {
      const srcNode = new DANode(0, 0, 'src');
      const destNode = new DANode(200, 0, 'dest');
      const edge = new DAEdge(srcNode, destNode, 'test');

      const points = edge.line.points();
      expect(points.length).toBe(4);

      // Endpoints are pulled outward from the perimeter by ARROW_STANDOFF
      // along the line direction so the arrowhead doesn't clip behind the
      // node face on shallow approaches.
      const w = srcNode.DEFAULT_NODE_WIDTH;
      const h = srcNode.DEFAULT_NODE_HEIGHT;
      const standoff = edge.ARROW_STANDOFF;
      expect(Math.abs(points[0] - (w + standoff))).toBeLessThanOrEqual(1);
      expect(Math.abs(points[1] - h / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(points[2] - (200 - standoff))).toBeLessThanOrEqual(1);
      expect(Math.abs(points[3] - h / 2)).toBeLessThanOrEqual(1);
    });

    it('should handle selection state correctly', () => {
      const srcNode = new DANode(0, 0, 'src');
      const destNode = new DANode(200, 100, 'dest');
      const edge = new DAEdge(srcNode, destNode, 'test');
      
      expect(edge.isSelected).toBe(false);
      expect(edge.line.strokeWidth()).toBe(edge.STROKE_WIDTH_NORMAL);
      
      edge.isSelected = true;
      expect(edge.isSelected).toBe(true);
      expect(edge.line.strokeWidth()).toBe(edge.STROKE_WIDTH_SELECTED);
    });

    it('should return correct z-index', () => {
      const srcNode = new DANode(0, 0, 'src');
      const destNode = new DANode(200, 100, 'dest');
      const edge = new DAEdge(srcNode, destNode, 'test');
      const zIndex = edge.zIndex();
      
      expect(typeof zIndex).toBe('number');
    });

    it('should support self-loop edges with loop path points', () => {
      const node = new DANode(120, 80, 'self');
      const edge = new DAEdge(node, node, 'self-loop');

      const points = edge.line.points();
      expect(points.length).toBe(8);
      expect(points[0]).toBeCloseTo(node.konvaGroup.x() + node.NODE_WIDTH, 2);
      expect(points[6]).toBeCloseTo(node.konvaGroup.x() + node.NODE_WIDTH, 2);
      expect(points[1]).toBeLessThan(points[7]);

      expect(node.outgoingEdges).toContain(edge);
      expect(node.incomingEdges).toContain(edge);
    });
  });

  describe('DACrosshairs', () => {
    it('should create crosshairs at correct position', () => {
      const crosshairs = new DACrosshairs({ x: 100, y: 200 });
      
      expect(crosshairs.x).toBe(100);
      expect(crosshairs.y).toBe(200);
      expect(crosshairs.konvaGroup).toBeDefined();
    });

    it('should handle show/hide correctly', () => {
      const crosshairs = new DACrosshairs({ x: 0, y: 0 });
      
      crosshairs.hide();
      expect(crosshairs.konvaGroup.visible()).toBe(false);
      
      crosshairs.show();
      expect(crosshairs.konvaGroup.visible()).toBe(true);
    });

    it('should return correct absolute position', () => {
      const crosshairs = new DACrosshairs({ x: 100, y: 200 });
      const pos = crosshairs.getAbsolutePosition();
      
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(200);
    });

    it('should allow position updates', () => {
      const crosshairs = new DACrosshairs({ x: 0, y: 0 });
      
      crosshairs.x = 150;
      crosshairs.y = 250;
      
      expect(crosshairs.x).toBe(150);
      expect(crosshairs.y).toBe(250);
    });

    it('should update heading line points based on heading angle', () => {
      const crosshairs = new DACrosshairs({ x: 0, y: 0 });
      crosshairs.setHeading(Math.PI / 2);

      const headingLine = crosshairs.konvaGroup.getChildren()[3] as Konva.Line;
      const points = headingLine.points();

      expect(points[0]).toBe(0);
      expect(points[1]).toBe(0);
      expect(points[2]).toBeCloseTo(0, 3);
      expect(points[3]).toBeCloseTo(crosshairs.HEADING_LENGTH, 3);
    });

    it('should toggle heading line visibility', () => {
      const crosshairs = new DACrosshairs({ x: 0, y: 0 });
      const headingLine = crosshairs.konvaGroup.getChildren()[3] as Konva.Line;

      expect(headingLine.visible()).toBe(false);

      crosshairs.setHeadingVisible(true);
      expect(headingLine.visible()).toBe(true);

      crosshairs.setHeadingVisible(false);
      expect(headingLine.visible()).toBe(false);
    });
  });

  describe('DrawingLayer', () => {
    let drawingLayer: DrawingLayer;

    beforeEach(() => {
      drawingLayer = new DrawingLayer();
    });

    it('should create node with correct centering', () => {
      const crosshairsX = 400;
      const crosshairsY = 300;
      
      drawingLayer.createNewNode(crosshairsX, crosshairsY);
      
      const nodes = drawingLayer['daNodes'];
      expect(nodes.length).toBe(1);
      
      const node = nodes[0];
      const expectedX = crosshairsX - (node.NODE_WIDTH / 2);
      const expectedY = crosshairsY - (node.NODE_HEIGHT / 2);
      
      expect(Math.abs(node.konvaGroup.x() - expectedX)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(node.konvaGroup.y() - expectedY)).toBeLessThanOrEqual(0.1);
      expect(node.isSelected).toBe(true);
    });

    it('should handle coordinate transformations correctly', () => {
      // Simulate zoomed and panned state
      drawingLayer.x(100);  // Pan right
      drawingLayer.y(50);   // Pan down
      drawingLayer.scaleX(2);  // Zoom 2x
      drawingLayer.scaleY(2);
      
      const crosshairsX = 400;
      const crosshairsY = 300;
      
      drawingLayer.createNewNode(crosshairsX, crosshairsY);
      
      const node = drawingLayer['daNodes'][0];
      
      // Should transform: (absoluteX - layerX) / scaleX
      const expectedX = (crosshairsX - 100) / 2 - (node.NODE_WIDTH / 2);
      const expectedY = (crosshairsY - 50) / 2 - (node.NODE_HEIGHT / 2);
      
      expect(Math.abs(node.konvaGroup.x() - expectedX)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(node.konvaGroup.y() - expectedY)).toBeLessThanOrEqual(0.1);
    });

    it('should add edge between nodes', () => {
      const node1 = new DANode(0, 0, 'node1');
      const node2 = new DANode(200, 100, 'node2');
      
      drawingLayer['daNodes'].push(node1, node2);
      drawingLayer.addEdge(node1, node2);
      
      const edges = drawingLayer['daEdges'];
      expect(edges.length).toBe(1);
      
      const edge = edges[0];
      expect(edge.line).toBeDefined();
    });

    it('should find nodes containing point', () => {
      const node1 = new DANode(100, 100, 'node1');
      const node2 = new DANode(300, 300, 'node2');
      
      drawingLayer['daNodes'].push(node1, node2);
      
      // Point inside node1
      const nodesContainingPoint = drawingLayer.getDaNodesContainingPoint({ x: 150, y: 150 });
      expect(nodesContainingPoint.length).toBe(1);
      expect(nodesContainingPoint[0]).toBe(node1);
      
      // Point inside node2
      const nodesContainingPoint2 = drawingLayer.getDaNodesContainingPoint({ x: 350, y: 350 });
      expect(nodesContainingPoint2.length).toBe(1);
      expect(nodesContainingPoint2[0]).toBe(node2);
      
      // Point outside any node
      const nodesContainingPoint3 = drawingLayer.getDaNodesContainingPoint({ x: 50, y: 50 });
      expect(nodesContainingPoint3.length).toBe(0);
    });

    it('should handle selection and unselection', () => {
      const node1 = new DANode(0, 0, 'node1');
      const node2 = new DANode(200, 100, 'node2');
      
      drawingLayer['daNodes'].push(node1, node2);
      
      // Select nodes
      node1.isSelected = true;
      node2.isSelected = true;
      
      const selectedNodes = drawingLayer.getSelectedDANodes();
      expect(selectedNodes.length).toBe(2);
      
      // Unselect all
      drawingLayer.unselectAll();
      
      const selectedNodesAfter = drawingLayer.getSelectedDANodes();
      expect(selectedNodesAfter.length).toBe(0);
    });
  });

  describe('lineSegmentIntersectsRect', () => {
    // Rect from (10,10) to (30,30)
    const minX = 10, minY = 10, maxX = 30, maxY = 30;

    it('should detect horizontal line through rect', () => {
      expect(lineSegmentIntersectsRect(0, 20, 40, 20, minX, minY, maxX, maxY)).toBe(true);
    });

    it('should detect vertical line through rect', () => {
      expect(lineSegmentIntersectsRect(20, 0, 20, 40, minX, minY, maxX, maxY)).toBe(true);
    });

    it('should detect diagonal line through rect', () => {
      expect(lineSegmentIntersectsRect(0, 0, 40, 40, minX, minY, maxX, maxY)).toBe(true);
    });

    it('should detect line segment entirely inside rect', () => {
      expect(lineSegmentIntersectsRect(15, 15, 25, 25, minX, minY, maxX, maxY)).toBe(true);
    });

    it('should detect line starting inside rect', () => {
      expect(lineSegmentIntersectsRect(20, 20, 50, 50, minX, minY, maxX, maxY)).toBe(true);
    });

    it('should detect line ending inside rect', () => {
      expect(lineSegmentIntersectsRect(0, 0, 20, 20, minX, minY, maxX, maxY)).toBe(true);
    });

    it('should miss line fully above rect', () => {
      expect(lineSegmentIntersectsRect(0, 5, 40, 5, minX, minY, maxX, maxY)).toBe(false);
    });

    it('should miss line fully below rect', () => {
      expect(lineSegmentIntersectsRect(0, 35, 40, 35, minX, minY, maxX, maxY)).toBe(false);
    });

    it('should miss line fully left of rect', () => {
      expect(lineSegmentIntersectsRect(5, 0, 5, 40, minX, minY, maxX, maxY)).toBe(false);
    });

    it('should miss line fully right of rect', () => {
      expect(lineSegmentIntersectsRect(35, 0, 35, 40, minX, minY, maxX, maxY)).toBe(false);
    });

    it('should miss diagonal that passes corner but segment ends before rect', () => {
      expect(lineSegmentIntersectsRect(0, 0, 5, 5, minX, minY, maxX, maxY)).toBe(false);
    });

    it('should detect line touching rect edge', () => {
      expect(lineSegmentIntersectsRect(0, 10, 40, 10, minX, minY, maxX, maxY)).toBe(true);
    });

    it('should handle zero-length segment inside rect', () => {
      expect(lineSegmentIntersectsRect(20, 20, 20, 20, minX, minY, maxX, maxY)).toBe(true);
    });

    it('should handle zero-length segment outside rect', () => {
      expect(lineSegmentIntersectsRect(0, 0, 0, 0, minX, minY, maxX, maxY)).toBe(false);
    });

    it('should work with real demo edge - horizontal edge (150,150)-(350,150) vs crosshairs at (250,140)-(290,160)', () => {
      // Simulates crosshairs bbox centered at 270,150 with ~20px extent
      expect(lineSegmentIntersectsRect(150, 150, 350, 150, 250, 140, 290, 160)).toBe(true);
    });

    it('should miss when crosshairs are far from edge', () => {
      expect(lineSegmentIntersectsRect(150, 150, 350, 150, 400, 400, 440, 440)).toBe(false);
    });
  });

  describe('closestPointOnSegment', () => {
    it('should return start point when closest', () => {
      const p = closestPointOnSegment(0, 0, 10, 0, 20, 0);
      expect(p.x).toBe(10);
      expect(p.y).toBe(0);
    });

    it('should return end point when closest', () => {
      const p = closestPointOnSegment(30, 0, 10, 0, 20, 0);
      expect(p.x).toBe(20);
      expect(p.y).toBe(0);
    });

    it('should return midpoint for perpendicular projection', () => {
      const p = closestPointOnSegment(15, 10, 10, 0, 20, 0);
      expect(p.x).toBe(15);
      expect(p.y).toBe(0);
    });

    it('should handle vertical segment', () => {
      const p = closestPointOnSegment(5, 15, 0, 10, 0, 20);
      expect(p.x).toBe(0);
      expect(p.y).toBe(15);
    });

    it('should handle zero-length segment', () => {
      const p = closestPointOnSegment(5, 5, 10, 10, 10, 10);
      expect(p.x).toBe(10);
      expect(p.y).toBe(10);
    });

    it('should handle diagonal segment', () => {
      const p = closestPointOnSegment(0, 10, 0, 0, 10, 10);
      expect(p.x).toBeCloseTo(5, 5);
      expect(p.y).toBeCloseTo(5, 5);
    });
  });

  describe('DAEdge', () => {
    it('should update selection style on main line', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(200, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      expect(edge.line.strokeWidth()).toBe(edge.STROKE_WIDTH_NORMAL);
      edge.isSelected = true;
      expect(edge.line.strokeWidth()).toBe(edge.STROKE_WIDTH_SELECTED);
    });

    it('should return src+dest path points', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(400, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      const points = edge.getPathPoints();
      expect(points.length).toBe(2);
    });

    it('should weave control points between src and dest endpoints', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(400, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      edge.setControlPoints([{x: 200, y: 80}, {x: 300, y: -40}]);
      const points = edge.getPathPoints();
      expect(points.length).toBe(4);
      expect(points[1]).toEqual({x: 200, y: 80});
      expect(points[2]).toEqual({x: 300, y: -40});
    });

    it('should aim src endpoint toward first control point when bent', () => {
      // Node at origin, dest far right, control point above the line:
      // the src endpoint should leave from the top edge (toward the bend), not the right edge.
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(400, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      edge.setControlPoints([{x: 100, y: -200}]);
      const points = edge.getPathPoints();
      const w = src.DEFAULT_NODE_WIDTH;
      const h = src.DEFAULT_NODE_HEIGHT;
      // Top-edge exit: y near 0 (top), x somewhere in [0, w]
      expect(points[0].y).toBeLessThanOrEqual(1);
      expect(points[0].x).toBeGreaterThanOrEqual(0);
      expect(points[0].x).toBeLessThanOrEqual(w);
      expect(points[0].y).toBeLessThan(h / 2);
    });

    it('should evenly space control points along straight line', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(400, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      edge.initializeStraightControlPoints(3);
      const cps = edge.controlPoints;
      expect(cps.length).toBe(3);
      // Should be roughly evenly spaced between the two perimeter endpoints
      expect(cps[0].x).toBeLessThan(cps[1].x);
      expect(cps[1].x).toBeLessThan(cps[2].x);
      // y stays on the horizontal line
      cps.forEach(p => expect(Math.abs(p.y - src.DEFAULT_NODE_HEIGHT / 2)).toBeLessThanOrEqual(1));
    });

    it('clearControlPoints resets to straight line', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(400, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      edge.setControlPoints([{x: 200, y: 80}]);
      expect(edge.getPathPoints().length).toBe(3);
      edge.clearControlPoints();
      expect(edge.getPathPoints().length).toBe(2);
      expect(edge.controlPoints.length).toBe(0);
    });

    it('refreshGeometry rewrites Konva.Arrow points', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(400, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      edge.setControlPoints([{x: 200, y: 80}]);
      // setControlPoints already calls refreshGeometry → Konva line should have 6 numbers
      expect(edge.line.points().length).toBe(6);
    });
  });

  describe('DALabel', () => {
    it('should create label at correct position with text', () => {
      const label = new DALabel(100, 200, 'test');
      expect(label.x).toBe(100);
      expect(label.y).toBe(200);
      expect(label.label).toBe('test');
      expect(label.isSelected).toBe(false);
    });

    it('should be visible by default', () => {
      const label = new DALabel(100, 200, 'test');
      expect(label.group.visible()).toBe(true);
    });

    it('should handle selection state', () => {
      const label = new DALabel(100, 200, 'test');
      label.isSelected = true;
      expect(label.isSelected).toBe(true);
      label.isSelected = false;
      expect(label.isSelected).toBe(false);
    });

    it('should update label text', () => {
      const label = new DALabel(100, 200, 'old');
      label.label = 'new';
      expect(label.label).toBe('new');
    });

    it('should update position', () => {
      const label = new DALabel(100, 200, 'test');
      label.x = 300;
      label.y = 400;
      expect(label.x).toBe(300);
      expect(label.y).toBe(400);
    });

    it('should update position via position setter', () => {
      const label = new DALabel(100, 200, 'test');
      label.position = { x: 50, y: 75 };
      expect(label.position.x).toBe(50);
      expect(label.position.y).toBe(75);
    });

    it('should adjust font size within bounds', () => {
      const label = new DALabel(100, 200, 'test');
      const labelText = (label as any)._text as Konva.Text;

      expect(label.adjustFontSizeBy(8)).toBe(true);
      expect(labelText.fontSize()).toBe(label.DEFAULT_FONT_SIZE + 8);

      expect(label.adjustFontSizeBy(10000)).toBe(true);
      expect(labelText.fontSize()).toBe(label.MAX_FONT_SIZE);
      expect(label.adjustFontSizeBy(1)).toBe(false);

      expect(label.adjustFontSizeBy(-10000)).toBe(true);
      expect(labelText.fontSize()).toBe(label.MIN_FONT_SIZE);
      expect(label.adjustFontSizeBy(-1)).toBe(false);
    });
  });

  describe('DAEdge with labels', () => {
    it('should add label to edge', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(200, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      const label = new DALabel(100, 50, 'mid');
      edge.addLabel(label);
      expect(edge.labels.length).toBe(1);
      expect(edge.labels[0]).toBe(label);
    });

    it('should remove label from edge', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(200, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      const label = new DALabel(100, 50, 'mid');
      edge.addLabel(label);
      expect(edge.labels.length).toBe(1);
      edge.removeLabel(label);
      expect(edge.labels.length).toBe(0);
    });

  });

  describe('DrawingLayer removal', () => {
    let drawingLayer: DrawingLayer;

    beforeEach(() => {
      drawingLayer = new DrawingLayer();
    });

    it('should remove node and its connected edges', () => {
      const node1 = new DANode(0, 0, 'A');
      const node2 = new DANode(200, 0, 'B');
      drawingLayer['daNodes'].push(node1, node2);
      drawingLayer['daNodeGroup'].add(node1.konvaGroup);
      drawingLayer['daNodeGroup'].add(node2.konvaGroup);
      drawingLayer.addEdge(node1, node2);
      expect(drawingLayer.getDAEdges().length).toBe(1);

      drawingLayer.removeNode(node1);
      expect(drawingLayer['daNodes'].length).toBe(1);
      expect(drawingLayer.getDAEdges().length).toBe(0);
    });

    it('should remove edge', () => {
      const node1 = new DANode(0, 0, 'A');
      const node2 = new DANode(200, 0, 'B');
      drawingLayer['daNodes'].push(node1, node2);
      drawingLayer.addEdge(node1, node2);
      expect(drawingLayer.getDAEdges().length).toBe(1);

      drawingLayer.removeEdge(drawingLayer.getDAEdges()[0]);
      expect(drawingLayer.getDAEdges().length).toBe(0);
    });

    it('should remove edge references from src/dest nodes when removing edge', () => {
      const node1 = new DANode(0, 0, 'A');
      const node2 = new DANode(200, 0, 'B');
      drawingLayer['daNodes'].push(node1, node2);
      drawingLayer.addEdge(node1, node2);

      const edge = drawingLayer.getDAEdges()[0];
      expect(node1.outgoingEdges).toContain(edge);
      expect(node2.incomingEdges).toContain(edge);

      drawingLayer.removeEdge(edge);

      expect(node1.outgoingEdges).not.toContain(edge);
      expect(node2.incomingEdges).not.toContain(edge);
    });
  });

  describe('DALabel — path anchoring', () => {
    const horizontalLine = [
      {x: 0, y: 0},
      {x: 100, y: 0},
    ];
    const verticalLine = [
      {x: 50, y: 0},
      {x: 50, y: 100},
    ];
    const bentPolyline = [
      {x: 0, y: 0},
      {x: 50, y: 0},
      {x: 50, y: 50},
    ];

    it('polylineArcLength sums segment lengths', () => {
      expect(polylineArcLength(horizontalLine)).toBe(100);
      expect(polylineArcLength(verticalLine)).toBe(100);
      expect(polylineArcLength(bentPolyline)).toBe(100);
      expect(polylineArcLength([])).toBe(0);
      expect(polylineArcLength([{x: 0, y: 0}])).toBe(0);
    });

    it('sampleAtT lands at endpoints and midpoint of a horizontal line', () => {
      const start = sampleAtT(horizontalLine, 0);
      expect(start.basePoint.x).toBe(0);
      expect(start.basePoint.y).toBe(0);
      expect(start.tangent.x).toBe(1);
      expect(start.tangent.y).toBe(0);

      const mid = sampleAtT(horizontalLine, 0.5);
      expect(mid.basePoint.x).toBe(50);
      expect(mid.basePoint.y).toBe(0);

      const end = sampleAtT(horizontalLine, 1);
      expect(end.basePoint.x).toBe(100);
      expect(end.basePoint.y).toBe(0);
    });

    it('sampleAtT crosses the bend at t=0.5 on an L-shaped polyline', () => {
      const mid = sampleAtT(bentPolyline, 0.5);
      // Total length 100; the bend is at the 50-unit mark. t=0.5 lands
      // exactly on the bend (last point of segment 0 / first of segment 1).
      expect(mid.basePoint.x).toBeCloseTo(50, 5);
      expect(mid.basePoint.y).toBeCloseTo(0, 5);

      const threeQuarters = sampleAtT(bentPolyline, 0.75);
      // 75 units along: 50 in segment 0 (to the bend), 25 down segment 1.
      expect(threeQuarters.basePoint.x).toBeCloseTo(50, 5);
      expect(threeQuarters.basePoint.y).toBeCloseTo(25, 5);
      expect(threeQuarters.tangent.x).toBeCloseTo(0, 5);
      expect(threeQuarters.tangent.y).toBeCloseTo(1, 5);
    });

    it('projectOntoPolyline finds nearest point and signed offset', () => {
      // A point above the midpoint of the horizontal line: t=0.5, and
      // "above" by convention B is negative y on screen — so offset > 0
      // because positive offset means "above" (smaller-y direction).
      const above = projectOntoPolyline(horizontalLine, {x: 50, y: -8});
      expect(above.t).toBeCloseTo(0.5, 5);
      expect(above.offset).toBeCloseTo(8, 5);

      const below = projectOntoPolyline(horizontalLine, {x: 50, y: 8});
      expect(below.t).toBeCloseTo(0.5, 5);
      expect(below.offset).toBeCloseTo(-8, 5);
    });

    it('projectOntoPolyline picks the "left side is above" tie-break on vertical lines', () => {
      // Vertical line; "above" (positive offset) is the side with smaller x.
      const left = projectOntoPolyline(verticalLine, {x: 42, y: 50});
      expect(left.t).toBeCloseTo(0.5, 5);
      expect(left.offset).toBeCloseTo(8, 5);

      const right = projectOntoPolyline(verticalLine, {x: 58, y: 50});
      expect(right.t).toBeCloseTo(0.5, 5);
      expect(right.offset).toBeCloseTo(-8, 5);
    });

    it('applyAnchorFromPolyline places the label above the line for aboveSideOffset', () => {
      const lbl = new DALabel(0, 0, 'L');
      lbl.setAnchor({t: 0.5, offset: aboveSideOffset(lbl.RECT_HEIGHT)});
      lbl.applyAnchorFromPolyline(horizontalLine);
      // Midpoint of horizontal line is (50, 0). Convention B's normal
      // points toward smaller-y; aboveSideOffset is positive; so the
      // label lands at y < 0 (above the line on screen).
      expect(lbl.x).toBeCloseTo(50, 5);
      expect(lbl.y).toBeLessThan(0);
      expect(lbl.y).toBeCloseTo(-(lbl.RECT_HEIGHT / 2 + 4), 5);
    });

    it('round-trips an anchor through projectOntoPolyline + applyAnchorFromPolyline', () => {
      const lbl = new DALabel(0, 0, 'L');
      // Place at an arbitrary world point near the bent polyline.
      const worldPt = {x: 60, y: 20};
      const projected = projectOntoPolyline(bentPolyline, worldPt);
      lbl.setAnchor(projected);
      lbl.applyAnchorFromPolyline(bentPolyline);
      // The label should land back at (or near) worldPt — at minimum the
      // re-projected anchor of its new position should match the original.
      const reProjected = projectOntoPolyline(bentPolyline, {x: lbl.x, y: lbl.y});
      expect(reProjected.t).toBeCloseTo(projected.t, 3);
      expect(reProjected.offset).toBeCloseTo(projected.offset, 3);
    });

    it('label rides re-routes when DAEdge.refreshGeometry runs', () => {
      const src = new DANode(0, 0, 'S');
      const dest = new DANode(200, 0, 'D');
      const edge = new DAEdge(src, dest, '');
      // Place a label at t=0.5 with a known offset.
      const lbl = new DALabel(0, 0, 'mid');
      lbl.setAnchor({t: 0.5, offset: 0});
      edge.addLabel(lbl);
      edge.refreshGeometry();
      const polyBefore = edge.getPathPoints();
      const midBefore = {
        x: (polyBefore[0].x + polyBefore[polyBefore.length - 1].x) / 2,
        y: (polyBefore[0].y + polyBefore[polyBefore.length - 1].y) / 2,
      };
      expect(lbl.x).toBeCloseTo(midBefore.x, 1);
      expect(lbl.y).toBeCloseTo(midBefore.y, 1);

      // Move the dest node; the label should follow the new midpoint.
      dest.konvaGroup.x(400);
      dest.konvaGroup.y(100);
      edge.refreshGeometry();
      const polyAfter = edge.getPathPoints();
      const midAfter = {
        x: (polyAfter[0].x + polyAfter[polyAfter.length - 1].x) / 2,
        y: (polyAfter[0].y + polyAfter[polyAfter.length - 1].y) / 2,
      };
      expect(lbl.x).toBeCloseTo(midAfter.x, 1);
      expect(lbl.y).toBeCloseTo(midAfter.y, 1);
      // And the label actually moved.
      expect(lbl.x).not.toBeCloseTo(midBefore.x, 1);
    });
  });
});
