import {TestBed} from '@angular/core/testing';
import {DAEdge} from '../drawing-area/da-edge';
import {DrawingLayer} from '../drawing-area/drawing.layer';
import {DemoDataService} from './demo-data.service';

describe('DemoDataService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('ships the recovered live Next working graph as a built-in sample', () => {
    const service = TestBed.inject(DemoDataService);
    const drawingLayer = new DrawingLayer();

    expect(service.sampleGraphs).toContain(jasmine.objectContaining({
      id: 'next-working',
    }));

    service.loadGraph('next-working', drawingLayer);

    const nodes = drawingLayer.getDANodes();
    const edges = drawingLayer.getDAEdges();
    expect(nodes.length).toBe(22);
    expect(edges.length).toBe(16);
    expect(nodes.find(node => node.label.text() === 'Next')?.id).toBe('da-48');
    expect(nodes.find(node => node.label.text() === 'Bugs')?.id).toBe('da-4');

    const nextEdges = edges.filter(edge => edge.destNode.id === 'da-48');
    expect(nextEdges.map(edge => edge.id)).toEqual(['da-162', 'da-192', 'da-195', 'da-197']);
    expect(nextEdges.map(edge => edge.srcNode.id)).toEqual(['da-161', 'da-191', 'da-194', 'da-196']);
    expect(nodes.find(node => node.id === 'da-161')?.label.text())
      .toContain('get edge labels back onto the edge');
    expect(nodes.find(node => node.id === 'da-191')?.label.text())
      .toContain('should not result in vertical movement');
    expect(nodes.find(node => node.id === 'da-194')?.label.text())
      .toContain("only be between the crosshair's node and other nodes");
    expect(nodes.find(node => node.id === 'da-196')?.label.text())
      .toContain('should not cause movement');
    expect(nodes.find(node => node.id === 'da-198')?.label.text())
      .toBe('Remove snap-to item behavior during normal navigation');
    expect(edges.find(edge => edge.id === 'da-200')?.destNode.id).toBe('da-199');
    expect(edges.find(edge => edge.id === 'da-124')?.controlPoints).toEqual([]);
    expect(edges.find(edge => edge.id === 'da-160')?.controlPoints).toEqual([]);
    expect(edges.find(edge => edge.id === 'da-197')?.controlPoints[0])
      .toEqual(jasmine.objectContaining({
        x: 3492.145550718036,
        y: -436.14520355930534,
        waypointId: 'da-206',
      }));
  });

  it('ships the current keymenu event/state graph in place of the stale shortcut tree', () => {
    const service = TestBed.inject(DemoDataService);
    const drawingLayer = new DrawingLayer();

    service.loadGraph('modes', drawingLayer);

    const nodes = drawingLayer.getDANodes();
    const edges = drawingLayer.getDAEdges();
    const main = nodes.find(node => node.label.text() === 'Main Mode Menu')!;
    const panZoom = nodes.find(node => node.label.text() === 'Zoom/Pan')!;
    const held = nodes.filter(node => node.label.text() === '');
    const edgeLabels = (edge: DAEdge) => edge.labels.map(label => label.label);

    expect(nodes.length).toBe(4);
    expect(edges.length).toBe(10);
    expect(held.length).toBe(2);
    expect(edges.some(edge => edge.srcNode === main && edge.destNode === panZoom &&
      edgeLabels(edge).includes('r-down'))).toBeTrue();
    expect(edges.some(edge => edge.srcNode === panZoom && edge.destNode === main &&
      edgeLabels(edge).includes('r-up'))).toBeTrue();

    const zoomIn = edges.find(edge => edge.srcNode === panZoom &&
      edgeLabels(edge).includes('i-down / Zoom In'))!.destNode;
    const zoomOut = edges.find(edge => edge.srcNode === panZoom &&
      edgeLabels(edge).includes('o-down / Zoom Out'))!.destNode;
    expect(zoomIn.label.text()).toBe('');
    expect(zoomOut.label.text()).toBe('');
    expect(edges.some(edge => edge.srcNode === zoomIn && edge.destNode === zoomIn &&
      edgeLabels(edge).includes('key repeat fired / Zoom In'))).toBeTrue();
    expect(edges.some(edge => edge.srcNode === zoomOut && edge.destNode === zoomOut &&
      edgeLabels(edge).includes('key repeat fired / Zoom Out'))).toBeTrue();
    expect(edges.some(edge => edge.srcNode === zoomIn && edge.destNode === panZoom &&
      edgeLabels(edge).includes('i-up'))).toBeTrue();
    expect(edges.some(edge => edge.srcNode === zoomOut && edge.destNode === panZoom &&
      edgeLabels(edge).includes('o-up'))).toBeTrue();
    expect(edges.filter(edge => edge.destNode === main &&
      edgeLabels(edge).includes('r-up')).length).toBe(3);
    expect(drawingLayer.getDAEdges().every(edge => edge.labels.length === 1)).toBeTrue();
  });
});
