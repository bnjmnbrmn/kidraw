// Bundle entry the esbuild step compiles. We re-export each router and the
// metrics module under stable names so the harness can read them off a
// single CommonJS module via require().
//
// The esbuild build script substitutes our fake-da-node / fake-da-edge for
// the real ones via an `alias` map (see build-bundle.mjs).

import {
  applyChargedSpringEdges,
  DEFAULT_OPTIONS as CHARGED_SPRING_DEFAULTS,
} from '../../../src/app/drawing-area/charged-spring-edges';

import {
  applyBezierRouteEdges,
  DEFAULT_OPTIONS as BEZIER_ROUTE_DEFAULTS,
} from '../../../src/app/drawing-area/bezier-route-edges';

import {
  applyBezierFitChargedSpringEdges,
  DEFAULT_OPTIONS as BEZIER_FIT_DEFAULTS,
} from '../../../src/app/drawing-area/bezier-fit-route-edges';

import {
  applyFlexibleWireEdges,
  DEFAULT_OPTIONS as FLEXIBLE_WIRE_DEFAULTS,
} from '../../../src/app/drawing-area/flexible-wire-edges';

import {
  applyWeightedChainEdges,
  DEFAULT_OPTIONS as WEIGHTED_CHAIN_DEFAULTS,
} from '../../../src/app/drawing-area/weighted-chain-edges';

import {
  computeRoutingMetrics,
  DEFAULT_WEIGHTS as METRIC_DEFAULTS,
} from '../../../src/app/drawing-area/edge-routing-metrics';

import { DANode } from './fake-da-node';
import { DAEdge } from './fake-da-edge';

export const Routers = {
  'charged-spring': {
    apply: applyChargedSpringEdges as any,
    defaults: CHARGED_SPRING_DEFAULTS as any,
  },
  'bezier-route': {
    apply: applyBezierRouteEdges as any,
    defaults: BEZIER_ROUTE_DEFAULTS as any,
  },
  'bezier-fit-charged-spring': {
    // bezier-fit takes two option objects (fit + charged-spring) so we wrap
    // it into a single-options entry to fit the uniform router interface.
    apply: (nodes: any, edges: any, _opts: any, log?: (msg: string) => void) =>
      applyBezierFitChargedSpringEdges(
        nodes,
        edges,
        BEZIER_FIT_DEFAULTS as any,
        CHARGED_SPRING_DEFAULTS as any,
        log,
      ),
    defaults: { ...BEZIER_FIT_DEFAULTS } as any,
  },
  'flexible-wire': {
    apply: applyFlexibleWireEdges as any,
    defaults: FLEXIBLE_WIRE_DEFAULTS as any,
  },
  'weighted-chain': {
    apply: applyWeightedChainEdges as any,
    defaults: WEIGHTED_CHAIN_DEFAULTS as any,
  },
};

export const Metrics = {
  compute: computeRoutingMetrics as any,
  weights: METRIC_DEFAULTS as any,
};

export const Fake = {
  DANode,
  DAEdge,
};
