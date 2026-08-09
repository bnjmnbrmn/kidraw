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
    expect(nodes.length).toBe(18);
    expect(edges.length).toBe(13);
    expect(nodes.find(node => node.label.text() === 'Next')?.id).toBe('da-48');
    expect(nodes.find(node => node.label.text() === 'Bugs')?.id).toBe('da-4');

    const nextEdges = edges.filter(edge => edge.destNode.id === 'da-48');
    expect(nextEdges.map(edge => edge.id)).toEqual(['da-150', 'da-152', 'da-155']);
    expect(nextEdges.map(edge => edge.srcNode.id)).toEqual(['da-149', 'da-151', 'da-154']);
    expect(nodes.find(node => node.id === 'da-149')?.label.text())
      .toContain('Only have halfway point ghosts for the nodes that are currently visible');
    expect(nodes.find(node => node.id === 'da-151')?.label.text())
      .toContain('fine/normal/coarse movement sizes');
    expect(nodes.find(node => node.id === 'da-154')?.label.text())
      .toContain('drag-left should never move the label to the right');
    expect(edges.find(edge => edge.id === 'da-124')?.controlPoints[0])
      .toEqual(jasmine.objectContaining({
        x: 787.9005249843403,
        y: -626.9333456052141,
        waypointId: 'da-125',
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
