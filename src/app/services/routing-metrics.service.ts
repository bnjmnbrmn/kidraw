import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DANode } from '../drawing-area/da-node';
import { DAEdge } from '../drawing-area/da-edge';
import {
  computeRoutingMetrics,
  DEFAULT_WEIGHTS,
  MetricWeights,
  RoutingMetrics,
} from '../drawing-area/edge-routing-metrics';

/** Holds the latest routing-quality metrics. The drawing-area component
 *  calls compute() after each routing run; the tuning panel subscribes
 *  to render the live values. Phase 6 will fit the weights from A/B
 *  picks; for now they're the hand-tuned defaults. */
@Injectable({ providedIn: 'root' })
export class RoutingMetricsService {
  weights: MetricWeights = { ...DEFAULT_WEIGHTS };
  readonly metrics$ = new BehaviorSubject<RoutingMetrics | null>(null);

  compute(nodes: DANode[], edges: DAEdge[]): void {
    this.metrics$.next(computeRoutingMetrics(nodes, edges, this.weights));
  }

  clear(): void {
    this.metrics$.next(null);
  }
}
