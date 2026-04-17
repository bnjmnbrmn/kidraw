import { TestBed } from '@angular/core/testing';
import { DrawingLayer } from './drawing.layer';
import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { DACrosshairs } from './da-crosshairs.group';

describe('DrawingArea Integration Tests', () => {
  describe('Complete Workflows', () => {
    it('should create complete node-edge workflow', () => {
      const drawingLayer = new DrawingLayer();
      
      // Create nodes
      const node1 = new DANode(100, 100, 'Node 1');
      const node2 = new DANode(300, 100, 'Node 2');
      const node3 = new DANode(200, 200, 'Node 3');
      
      drawingLayer['daNodes'].push(node1, node2, node3);
      drawingLayer['daNodeGroup'].add(node1.konvaGroup);
      drawingLayer['daNodeGroup'].add(node2.konvaGroup);
      drawingLayer['daNodeGroup'].add(node3.konvaGroup);
      
      // Create edges
      const edge1 = new DAEdge(node1, node2, 'Edge 1-2');
      const edge2 = new DAEdge(node2, node3, 'Edge 2-3');
      
      drawingLayer['daEdges'].push(edge1, edge2);
      drawingLayer['daEdgeGroup'].add(edge1.konvaGroup);
      drawingLayer['daEdgeGroup'].add(edge2.konvaGroup);
      
      // Verify structure
      expect(drawingLayer['daNodes'].length).toBe(3);
      expect(drawingLayer['daEdges'].length).toBe(2);
      
      // Verify edge connections
      const edge1Points = edge1.line.points();
      expect(edge1Points.length).toBe(4);
      
      // Should connect from right edge of node1 to left edge of node2
      const w = node1.DEFAULT_NODE_WIDTH;
      const h = node1.DEFAULT_NODE_HEIGHT;
      expect(Math.abs(edge1Points[0] - (100 + w))).toBeLessThanOrEqual(5); // Source X (right edge)
      expect(Math.abs(edge1Points[1] - (100 + h / 2))).toBeLessThanOrEqual(5); // Source Y (center)
      expect(Math.abs(edge1Points[2] - 300)).toBeLessThanOrEqual(5); // Dest X (left edge)
      expect(Math.abs(edge1Points[3] - (100 + h / 2))).toBeLessThanOrEqual(5); // Dest Y (center)
    });

    it('should handle zoom and pan transformations', () => {
      const drawingLayer = new DrawingLayer();
      
      // Create a node at origin
      const node = new DANode(0, 0, 'test');
      drawingLayer['daNodes'].push(node);
      drawingLayer['daNodeGroup'].add(node.konvaGroup);
      
      // Apply transformations
      drawingLayer.x(100);  // Pan right
      drawingLayer.y(50);   // Pan down
      drawingLayer.scaleX(2);  // Zoom 2x
      drawingLayer.scaleY(2);
      
      // Create new node with transformations
      const crosshairsX = 400;
      const crosshairsY = 300;
      drawingLayer.createNewNode(crosshairsX, crosshairsY);
      
      const newNode = drawingLayer['daNodes'][1];
      
      // Verify transformation: (absoluteX - layerX) / scaleX
      const expectedX = (crosshairsX - 100) / 2 - (newNode.NODE_WIDTH / 2);
      const expectedY = (crosshairsY - 50) / 2 - (newNode.NODE_HEIGHT / 2);
      
      expect(Math.abs(newNode.konvaGroup.x() - expectedX)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(newNode.konvaGroup.y() - expectedY)).toBeLessThanOrEqual(0.1);
    });

    it('should handle selection and interaction workflow', () => {
      const drawingLayer = new DrawingLayer();
      
      // Create multiple nodes
      const nodes = Array.from({ length: 5 }, (_, i) => 
        new DANode(i * 120, i * 80, `Node ${i + 1}`)
      );
      
      nodes.forEach(node => {
        drawingLayer['daNodes'].push(node);
        drawingLayer['daNodeGroup'].add(node.konvaGroup);
      });
      
      // Select some nodes
      nodes[0].isSelected = true;
      nodes[2].isSelected = true;
      nodes[4].isSelected = true;
      
      // Verify selection
      const selectedNodes = drawingLayer.getSelectedDANodes();
      expect(selectedNodes.length).toBe(3);
      expect(selectedNodes[0]).toBe(nodes[0]);
      expect(selectedNodes[1]).toBe(nodes[2]);
      expect(selectedNodes[2]).toBe(nodes[4]);
      
      // Unselect all
      drawingLayer.unselectAll();
      
      const selectedNodesAfter = drawingLayer.getSelectedDANodes();
      expect(selectedNodesAfter.length).toBe(0);
      
      // Verify all nodes are unselected
      nodes.forEach(node => {
        expect(node.isSelected).toBe(false);
      });
    });

    it('should handle crosshairs positioning workflow', () => {
      const crosshairs = new DACrosshairs({ x: 400, y: 300 });
      
      // Test positioning
      expect(crosshairs.x).toBe(400);
      expect(crosshairs.y).toBe(300);
      
      // Test position updates
      crosshairs.x = 500;
      crosshairs.y = 400;
      
      expect(crosshairs.x).toBe(500);
      expect(crosshairs.y).toBe(400);
      
      // Test show/hide
      crosshairs.hide();
      expect(crosshairs.konvaGroup.visible()).toBe(false);
      
      crosshairs.show();
      expect(crosshairs.konvaGroup.visible()).toBe(true);
      
      // Test absolute position
      const absPos = crosshairs.getAbsolutePosition();
      expect(absPos.x).toBe(500);
      expect(absPos.y).toBe(400);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty drawing layer gracefully', () => {
      const drawingLayer = new DrawingLayer();
      
      // Should not crash when empty
      expect(drawingLayer.getSelectedDANodes().length).toBe(0);
      expect(drawingLayer.getSelectedDAEdges().length).toBe(0);
      
      // Should handle point detection with no nodes
      const nodesContainingPoint = drawingLayer.getDaNodesContainingPoint({ x: 100, y: 100 });
      expect(nodesContainingPoint.length).toBe(0);
    });

    it('should handle edge creation with invalid nodes', () => {
      const drawingLayer = new DrawingLayer();
      const validNode = new DANode(0, 0, 'valid');
      
      drawingLayer['daNodes'].push(validNode);
      
      // Should handle null/undefined gracefully
      expect(() => {
        drawingLayer.addEdge(validNode, null as any);
      }).toThrow();
      
      expect(() => {
        drawingLayer.addEdge(null as any, validNode);
      }).toThrow();
    });

    it('should handle crosshairs with invalid positions', () => {
      // Should handle negative positions
      const crosshairs1 = new DACrosshairs({ x: -100, y: -50 });
      expect(crosshairs1.x).toBe(-100);
      expect(crosshairs1.y).toBe(-50);
      
      // Should handle zero positions
      const crosshairs2 = new DACrosshairs({ x: 0, y: 0 });
      expect(crosshairs2.x).toBe(0);
      expect(crosshairs2.y).toBe(0);
      
      // Should handle large positions
      const crosshairs3 = new DACrosshairs({ x: 10000, y: 5000 });
      expect(crosshairs3.x).toBe(10000);
      expect(crosshairs3.y).toBe(5000);
    });
  });

  describe('Performance and Scale Testing', () => {
    it('should handle large number of nodes efficiently', () => {
      const drawingLayer = new DrawingLayer();
      const startTime = Date.now();
      
      // Create 100 nodes
      for (let i = 0; i < 100; i++) {
        const node = new DANode(i * 50, i * 30, `Node ${i}`);
        drawingLayer['daNodes'].push(node);
        drawingLayer['daNodeGroup'].add(node.konvaGroup);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
      expect(drawingLayer['daNodes'].length).toBe(100);
    });

    it('should handle complex edge networks', () => {
      const drawingLayer = new DrawingLayer();
      
      // Create a grid of nodes
      const gridSize = 10;
      const nodes: DANode[] = [];
      
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const node = new DANode(i * 150, j * 150, `Node ${i}-${j}`);
          nodes.push(node);
          drawingLayer['daNodes'].push(node);
          drawingLayer['daNodeGroup'].add(node.konvaGroup);
        }
      }
      
      // Create edges between adjacent nodes
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const currentIndex = i * gridSize + j;
          
          // Connect to right neighbor
          if (j < gridSize - 1) {
            const rightIndex = i * gridSize + (j + 1);
            const edge = new DAEdge(nodes[currentIndex], nodes[rightIndex], `Edge ${currentIndex}-${rightIndex}`);
            drawingLayer['daEdges'].push(edge);
            drawingLayer['daEdgeGroup'].add(edge.konvaGroup);
          }
          
          // Connect to bottom neighbor
          if (i < gridSize - 1) {
            const bottomIndex = (i + 1) * gridSize + j;
            const edge = new DAEdge(nodes[currentIndex], nodes[bottomIndex], `Edge ${currentIndex}-${bottomIndex}`);
            drawingLayer['daEdges'].push(edge);
            drawingLayer['daEdgeGroup'].add(edge.konvaGroup);
          }
        }
      }
      
      // Verify structure
      expect(drawingLayer['daNodes'].length).toBe(gridSize * gridSize);
      expect(drawingLayer['daEdges'].length).toBe(gridSize * (gridSize - 1) * 2);
      
      // Verify all edges have valid line points
      drawingLayer['daEdges'].forEach(edge => {
        expect(edge.line).toBeDefined();
        expect(edge.line.points().length).toBe(4);
      });
    });
  });
});

// Helper function for close comparisons
function toBeCloseTo(received: number, expected: number, tolerance?: number) {
  const pass = Math.abs(received - expected) <= (tolerance || 2);
  if (!pass) {
    throw new Error(`Expected ${expected} ± ${tolerance || 2}, but got ${received}`);
  }
}
