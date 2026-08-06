import {TestBed} from '@angular/core/testing';
import {DrawingLayer} from '../drawing-area/drawing.layer';
import {DemoDataService} from './demo-data.service';

describe('DemoDataService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

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
