import { TestBed } from '@angular/core/testing';
import { DrawingLayer } from './drawing.layer';
import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { DAWaypoint } from './da-waypoint';
import { DACrosshairs } from './da-crosshairs.group';
import { lineSegmentIntersectsRect, closestPointOnSegment } from './utils';

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
      
      // Should connect from right edge of src to left edge of dest
      expect(Math.abs(points[0] - 100)).toBeLessThanOrEqual(1); // Source X (right edge)
      expect(Math.abs(points[1] - 50)).toBeLessThanOrEqual(1);   // Source Y (center)
      expect(Math.abs(points[2] - 200)).toBeLessThanOrEqual(1); // Dest X (left edge)
      expect(Math.abs(points[3] - 50)).toBeLessThanOrEqual(1);   // Dest Y (center)
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

  describe('DAWaypoint', () => {
    it('should create waypoint at correct position', () => {
      const wp = new DAWaypoint(100, 200);
      expect(wp.x).toBe(100);
      expect(wp.y).toBe(200);
      expect(wp.isSelected).toBe(false);
    });

    it('should start hidden', () => {
      const wp = new DAWaypoint(100, 200);
      expect(wp.group.visible()).toBe(false);
    });

    it('should become visible when selected', () => {
      const wp = new DAWaypoint(100, 200);
      wp.isSelected = true;
      expect(wp.group.visible()).toBe(true);
      expect(wp.isSelected).toBe(true);
    });

    it('should become visible via setVisibleForSelection(true)', () => {
      const wp = new DAWaypoint(100, 200);
      wp.setVisibleForSelection(true);
      expect(wp.group.visible()).toBe(true);
    });

    it('should hide when setVisibleForSelection(false) and not selected', () => {
      const wp = new DAWaypoint(100, 200);
      wp.setVisibleForSelection(true);
      wp.setVisibleForSelection(false);
      expect(wp.group.visible()).toBe(false);
    });

    it('should stay visible when setVisibleForSelection(false) but is selected', () => {
      const wp = new DAWaypoint(100, 200);
      wp.isSelected = true;
      wp.setVisibleForSelection(false);
      expect(wp.group.visible()).toBe(true);
    });

    it('should update position', () => {
      const wp = new DAWaypoint(100, 200);
      wp.x = 300;
      wp.y = 400;
      expect(wp.x).toBe(300);
      expect(wp.y).toBe(400);
    });
  });

  describe('DAEdge with waypoints', () => {
    it('should add waypoint to edge', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(200, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      const wp = new DAWaypoint(100, 50);
      edge.addWaypoint(wp);
      expect(edge.waypoints.length).toBe(1);
      expect(edge.waypoints[0]).toBe(wp);
    });

    it('should sort waypoints by position along edge', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(400, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      const wp1 = new DAWaypoint(300, 25);
      const wp2 = new DAWaypoint(100, 25);
      const wp3 = new DAWaypoint(200, 25);
      edge.addWaypoint(wp1);
      edge.addWaypoint(wp2);
      edge.addWaypoint(wp3);
      expect(edge.waypoints[0]).toBe(wp2);
      expect(edge.waypoints[1]).toBe(wp3);
      expect(edge.waypoints[2]).toBe(wp1);
    });

    it('should update selection style on main line', () => {
      const src = new DANode(0, 0, 'A');
      const dest = new DANode(200, 0, 'B');
      const edge = new DAEdge(src, dest, '');
      expect(edge.line.strokeWidth()).toBe(edge.STROKE_WIDTH_NORMAL);
      edge.isSelected = true;
      expect(edge.line.strokeWidth()).toBe(edge.STROKE_WIDTH_SELECTED);
    });
  });
});
