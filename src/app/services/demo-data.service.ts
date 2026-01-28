import { Injectable } from '@angular/core';
import { DANode } from '../drawing-area/da-node.group';
import { DAEdge } from '../drawing-area/da-edge.group';
import { DrawingLayer } from '../drawing-area/drawing.layer';

@Injectable({
  providedIn: 'root'
})
export class DemoDataService {
  
  createDemoGraph(drawingLayer: DrawingLayer) {
    // Create sample nodes
    const node1 = new DANode(100, 100, 'Start');
    const node2 = new DANode(300, 100, 'Process');
    const node3 = new DANode(500, 100, 'Decision');
    const node4 = new DANode(700, 100, 'End');
    const node5 = new DANode(300, 250, 'Action');
    const node6 = new DANode(500, 250, 'Result');

    // Add nodes to drawing layer using the internal node group
    drawingLayer['daNodeGroup'].add(node1);
    drawingLayer['daNodeGroup'].add(node2);
    drawingLayer['daNodeGroup'].add(node3);
    drawingLayer['daNodeGroup'].add(node4);
    drawingLayer['daNodeGroup'].add(node5);
    drawingLayer['daNodeGroup'].add(node6);
    
    // Track nodes in the layer's node array
    drawingLayer['daNodes'].push(node1, node2, node3, node4, node5, node6);

    // Create edges
    const edge1 = new DAEdge(node1, node2, '');
    const edge2 = new DAEdge(node2, node3, '');
    const edge3 = new DAEdge(node3, node4, '');
    const edge4 = new DAEdge(node2, node5, '');
    const edge5 = new DAEdge(node5, node6, '');
    const edge6 = new DAEdge(node6, node3, '');

    // Add edges to drawing layer using the internal edge group
    drawingLayer['daEdgeGroup'].add(edge1);
    drawingLayer['daEdgeGroup'].add(edge2);
    drawingLayer['daEdgeGroup'].add(edge3);
    drawingLayer['daEdgeGroup'].add(edge4);
    drawingLayer['daEdgeGroup'].add(edge5);
    drawingLayer['daEdgeGroup'].add(edge6);
    
    // Track edges in the layer's edge array
    drawingLayer['daEdges'].push(edge1, edge2, edge3, edge4, edge5, edge6);
  }
}
