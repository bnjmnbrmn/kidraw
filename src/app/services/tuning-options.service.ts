import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import {
  ChargedSpringOptions,
  DEFAULT_OPTIONS as CHARGED_SPRING_DEFAULTS,
} from '../drawing-area/charged-spring-edges';
import {
  BezierRouteOptions,
  DEFAULT_OPTIONS as BEZIER_DEFAULTS,
} from '../drawing-area/bezier-route-edges';
import {
  BezierFitOptions,
  DEFAULT_OPTIONS as BEZIER_FIT_DEFAULTS,
} from '../drawing-area/bezier-fit-route-edges';
import {
  FlexibleWireOptions,
  DEFAULT_OPTIONS as FLEXIBLE_WIRE_DEFAULTS,
} from '../drawing-area/flexible-wire-edges';
import {
  WeightedChainOptions,
  DEFAULT_OPTIONS as WEIGHTED_CHAIN_DEFAULTS,
} from '../drawing-area/weighted-chain-edges';

/** A single tunable parameter in the slider UI: where it comes from
 *  (what routing/options group), its label, value range, and increment. */
export interface TuningSlider {
  group: 'charged-spring' | 'bezier-route' | 'bezier-fit' | 'flexible-wire' | 'weighted-chain';
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** True if the value should be rendered/edited as an integer. */
  integer?: boolean;
}

@Injectable({ providedIn: 'root' })
export class TuningOptionsService {
  /** Live, mutable options used by the routing modules. Mutated directly
   *  by the slider panel. */
  readonly chargedSpring: ChargedSpringOptions = { ...CHARGED_SPRING_DEFAULTS };
  readonly bezierRoute: BezierRouteOptions = { ...BEZIER_DEFAULTS };
  readonly bezierFit: BezierFitOptions = { ...BEZIER_FIT_DEFAULTS };
  readonly flexibleWire: FlexibleWireOptions = { ...FLEXIBLE_WIRE_DEFAULTS };
  readonly weightedChain: WeightedChainOptions = { ...WEIGHTED_CHAIN_DEFAULTS };

  /** Emits whenever any value changes. Subscribers (e.g. the drawing-area
   *  to auto-reroute) can react. The payload is which group changed. */
  readonly changes = new Subject<'charged-spring' | 'bezier-route' | 'bezier-fit' | 'flexible-wire' | 'weighted-chain'>();

  /** The set of sliders rendered in the panel. Range/step/label are tuned
   *  by hand to match the defaults' working ranges. */
  readonly sliders: TuningSlider[] = [
    // Hybrid (charged-spring → Bezier-fit)
    { group: 'bezier-fit', key: 'dpTolerance', label: 'DP tolerance (px)', min: 0, max: 30, step: 0.1 },
    // Bezier
    { group: 'bezier-route', key: 'maxControlPoints', label: 'Max control points', min: 0, max: 8, step: 1, integer: true },
    { group: 'bezier-route', key: 'minImprovementPerPoint', label: 'Min improvement / point', min: 0, max: 500, step: 5 },
    { group: 'bezier-route', key: 'obstaclePenaltyK', label: 'Obstacle penalty K', min: 0, max: 50, step: 0.5 },
    { group: 'bezier-route', key: 'lengthPenaltyK', label: 'Length penalty K', min: 0, max: 5, step: 0.05 },
    { group: 'bezier-route', key: 'clearance', label: 'Clearance', min: 0, max: 80, step: 1, integer: true },
    { group: 'bezier-route', key: 'laneSpacing', label: 'Lane spacing', min: 0, max: 60, step: 1, integer: true },
    { group: 'bezier-route', key: 'optimizeIterations', label: 'Optimize iters', min: 0, max: 300, step: 5, integer: true },
    { group: 'bezier-route', key: 'optimizeStepSize', label: 'Optimize step size', min: 0, max: 5, step: 0.05 },
    { group: 'bezier-route', key: 'curveSamples', label: 'Curve samples', min: 5, max: 200, step: 1, integer: true },
    // Charged-spring
    { group: 'charged-spring', key: 'beadsPerEdge', label: 'Beads / edge', min: 2, max: 1500, step: 1, integer: true },
    { group: 'charged-spring', key: 'iterations', label: 'Iterations', min: 10, max: 2000, step: 10, integer: true },
    { group: 'charged-spring', key: 'smoothingK', label: 'Smoothing K', min: 0, max: 2, step: 0.02 },
    { group: 'charged-spring', key: 'chargeK', label: 'Charge K', min: 0, max: 30000, step: 100 },
    { group: 'charged-spring', key: 'insideKickK', label: 'Inside-obstacle kick', min: 0, max: 500, step: 5 },
    { group: 'charged-spring', key: 'damping', label: 'Damping', min: 0, max: 0.99, step: 0.01 },
    { group: 'charged-spring', key: 'dt', label: 'Time step (dt)', min: 0.05, max: 2, step: 0.05 },
    { group: 'charged-spring', key: 'clearance', label: 'Clearance', min: 0, max: 80, step: 1, integer: true },
    { group: 'charged-spring', key: 'pruneEpsilon', label: 'Prune epsilon', min: 0, max: 10, step: 0.1 },
    { group: 'charged-spring', key: 'maxVelocity', label: 'Max velocity', min: 1, max: 200, step: 1, integer: true },
    { group: 'charged-spring', key: 'laneSpacing', label: 'Lane spacing', min: 0, max: 60, step: 1, integer: true },
    { group: 'charged-spring', key: 'edgeRepulsionK', label: 'Sibling repulsion K', min: 0, max: 2000, step: 10 },
    { group: 'charged-spring', key: 'edgeRepulsionMaxDist', label: 'Sibling repulsion max dist', min: 0, max: 200, step: 1, integer: true },
    { group: 'charged-spring', key: 'anchorK', label: 'Anchor K', min: 0, max: 2.5, step: 0.02 },
    { group: 'charged-spring', key: 'chargeRampLength', label: 'Charge ramp length', min: 0, max: 30, step: 1, integer: true },
    // Elastic wire (b → /)
    { group: 'flexible-wire', key: 'initialBeadCount', label: 'Initial beads / edge', min: 2, max: 200, step: 1, integer: true },
    { group: 'flexible-wire', key: 'iterations', label: 'Iterations', min: 10, max: 2000, step: 10, integer: true },
    { group: 'flexible-wire', key: 'remeshInterval', label: 'Remesh interval', min: 0, max: 200, step: 1, integer: true },
    { group: 'flexible-wire', key: 'targetSegmentLength', label: 'Target segment len', min: 2, max: 80, step: 1, integer: true },
    { group: 'flexible-wire', key: 'splitThresholdRatio', label: 'Split threshold ratio', min: 1, max: 3, step: 0.05 },
    { group: 'flexible-wire', key: 'mergeThresholdRatio', label: 'Merge threshold ratio', min: 0.05, max: 1, step: 0.05 },
    { group: 'flexible-wire', key: 'maxBeadsPerEdge', label: 'Max beads / edge', min: 4, max: 1000, step: 10, integer: true },
    { group: 'flexible-wire', key: 'smoothingK', label: 'Smoothing K', min: 0, max: 2, step: 0.02 },
    { group: 'flexible-wire', key: 'segmentSpringK', label: 'Segment spring K', min: 0, max: 1.2, step: 0.02 },
    { group: 'flexible-wire', key: 'chargeK', label: 'Charge K', min: 0, max: 30000, step: 100 },
    { group: 'flexible-wire', key: 'insideKickK', label: 'Inside-obstacle kick', min: 0, max: 500, step: 5 },
    { group: 'flexible-wire', key: 'damping', label: 'Damping', min: 0, max: 0.99, step: 0.01 },
    { group: 'flexible-wire', key: 'dt', label: 'Time step (dt)', min: 0.05, max: 2, step: 0.05 },
    { group: 'flexible-wire', key: 'clearance', label: 'Clearance', min: 0, max: 80, step: 1, integer: true },
    { group: 'flexible-wire', key: 'pruneEpsilon', label: 'Prune epsilon', min: 0, max: 30, step: 0.1 },
    { group: 'flexible-wire', key: 'maxVelocity', label: 'Max velocity', min: 1, max: 200, step: 1, integer: true },
    { group: 'flexible-wire', key: 'laneSpacing', label: 'Lane spacing', min: 0, max: 60, step: 1, integer: true },
    { group: 'flexible-wire', key: 'edgeRepulsionK', label: 'Sibling repulsion K', min: 0, max: 5000, step: 25 },
    { group: 'flexible-wire', key: 'edgeRepulsionMaxDist', label: 'Sibling repulsion max dist', min: 0, max: 200, step: 1, integer: true },
    { group: 'flexible-wire', key: 'anchorK', label: 'Anchor K (0 = rubber-band)', min: 0, max: 2.5, step: 0.02 },
    { group: 'flexible-wire', key: 'tautnessK', label: 'Tautness (chord pull)', min: 0, max: 2.5, step: 0.02 },
    { group: 'flexible-wire', key: 'chargeRampLength', label: 'Charge ramp length', min: 0, max: 30, step: 1, integer: true },
    // Weighted chain (b → .)
    { group: 'weighted-chain', key: 'segmentLength', label: 'Segment length', min: 0.02, max: 60, step: 0.02 },
    { group: 'weighted-chain', key: 'initialSlackFactor', label: 'Initial slack factor', min: 1, max: 4, step: 0.05 },
    { group: 'weighted-chain', key: 'iterations', label: 'Iterations', min: 10, max: 2000, step: 10, integer: true },
    { group: 'weighted-chain', key: 'pbdIterations', label: 'PBD substeps', min: 1, max: 50, step: 1, integer: true },
    { group: 'weighted-chain', key: 'endpointForce', label: 'Endpoint weight', min: 0, max: 200, step: 1 },
    { group: 'weighted-chain', key: 'chargeK', label: 'Charge K', min: 0, max: 30000, step: 100 },
    { group: 'weighted-chain', key: 'insideKickK', label: 'Inside-obstacle kick', min: 0, max: 500, step: 5 },
    { group: 'weighted-chain', key: 'damping', label: 'Damping (friction)', min: 0, max: 0.99, step: 0.01 },
    { group: 'weighted-chain', key: 'dt', label: 'Time step (dt)', min: 0.05, max: 2, step: 0.05 },
    { group: 'weighted-chain', key: 'clearance', label: 'Clearance', min: 0, max: 80, step: 1, integer: true },
    { group: 'weighted-chain', key: 'maxVelocity', label: 'Max velocity', min: 1, max: 200, step: 1, integer: true },
    { group: 'weighted-chain', key: 'laneSpacing', label: 'Lane spacing', min: 0, max: 60, step: 1, integer: true },
    { group: 'weighted-chain', key: 'edgeRepulsionK', label: 'Cross-edge repulsion K', min: 0, max: 5000, step: 25 },
    { group: 'weighted-chain', key: 'edgeRepulsionMaxDist', label: 'Cross-edge repulsion max dist', min: 0, max: 200, step: 1, integer: true },
    { group: 'weighted-chain', key: 'drainInterval', label: 'Drain interval', min: 0, max: 200, step: 1, integer: true },
    { group: 'weighted-chain', key: 'chargeRampLength', label: 'Charge ramp length', min: 0, max: 30, step: 1, integer: true },
    { group: 'weighted-chain', key: 'initialJitter', label: 'Initial jitter (px)', min: 0, max: 50, step: 0.5 },
    { group: 'weighted-chain', key: 'rngSeed', label: 'RNG seed', min: 1, max: 1000, step: 1, integer: true },
  ];

  private optionsObjFor(group: TuningSlider['group']): any {
    switch (group) {
      case 'charged-spring': return this.chargedSpring;
      case 'bezier-route': return this.bezierRoute;
      case 'bezier-fit': return this.bezierFit;
      case 'flexible-wire': return this.flexibleWire;
      case 'weighted-chain': return this.weightedChain;
    }
  }

  getValue(s: TuningSlider): number {
    return this.optionsObjFor(s.group)[s.key];
  }

  setValue(s: TuningSlider, value: number): void {
    const obj = this.optionsObjFor(s.group);
    const v = s.integer ? Math.round(value) : value;
    if (obj[s.key] === v) return;
    obj[s.key] = v;
    this.changes.next(s.group);
  }
}
