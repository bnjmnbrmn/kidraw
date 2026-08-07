import {TestBed} from '@angular/core/testing';
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
    expect(nodes.length).toBe(19);
    expect(edges.length).toBe(11);
    expect(nodes.find(node => node.label.text() === 'Next')?.id).toBe('da-48');
    expect(nodes.find(node => node.label.text() === 'Bugs')?.id).toBe('da-4');

    const nextEdges = edges.filter(edge =>
      edge.srcNode.id === 'da-48' || edge.destNode.id === 'da-48');
    expect(nextEdges.map(edge => edge.id).sort()).toEqual([
      'da-132', 'da-138', 'da-140', 'da-142', 'da-144',
    ]);
  });

  it('ships the current keymenu event/state graph in place of the stale shortcut tree', () => {
    const service = TestBed.inject(DemoDataService);
    const drawingLayer = new DrawingLayer();

    service.loadGraph('modes', drawingLayer);

    const nodeText = drawingLayer.getDANodes().map(node => node.label.text());
    expect(nodeText).toContain('Fresh bound\nkeydown');
    expect(nodeText).toContain('Repeat\nscheduled');
    expect(nodeText).toContain('Held submenu\npath [K]');
    expect(nodeText).toContain('labelEdit\nVim normal');
    expect(nodeText).toContain('surface\ngrow-placement');
    expect(nodeText).not.toContain('Insert...\n(f)');

    const labels = drawingLayer.getDAEdges().flatMap(edge => edge.labels.map(label => label.label));
    expect(labels).toContain('keydown K · bound + not already held');
    expect(labels).toContain('keyup K · prefix pop');
    expect(labels).toContain('timer tick');
    expect(labels).toContain('tap i over existing node / label');
    expect(labels).toContain('TRAVERSE_SMART · open popup-state');
    expect(labels).not.toContain('Move by Link opens popup-state');
    expect(labels).toContain('release add / Enter · create + edit');
    expect(drawingLayer.getDAEdges().every(edge => edge.labels.length === 1)).toBeTrue();
  });
});
