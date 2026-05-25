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
  applyBezierFitWeightedChainEdges,
  DEFAULT_OPTIONS as BEZIER_FIT_WC_DEFAULTS,
  DEFAULT_WC_OPTIONS as BEZIER_FIT_WC_BASE_DEFAULTS,
} from '../../../src/app/drawing-area/bezier-fit-weighted-chain-edges';

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
    // bezier-fit takes two option objects (fit + charged-spring), so we
    // bundle them under one `defaults` envelope to fit the uniform router
    // interface. Round 2 (parameter sweeps) overrides either side by
    // passing a merged `{ fit, cs }` object as the third arg.
    apply: (
      nodes: any,
      edges: any,
      opts: { fit: any; cs: any },
      log?: (msg: string) => void,
    ) =>
      applyBezierFitChargedSpringEdges(
        nodes,
        edges,
        opts.fit,
        opts.cs,
        log,
      ),
    defaults: {
      fit: { ...BEZIER_FIT_DEFAULTS },
      cs: { ...CHARGED_SPRING_DEFAULTS },
    } as any,
  },
  'flexible-wire': {
    apply: applyFlexibleWireEdges as any,
    defaults: FLEXIBLE_WIRE_DEFAULTS as any,
  },
  'weighted-chain': {
    apply: applyWeightedChainEdges as any,
    defaults: WEIGHTED_CHAIN_DEFAULTS as any,
  },
  'bezier-fit-weighted-chain': {
    // Same two-object pattern as bezier-fit-charged-spring: the fit step's
    // options + the underlying weighted-chain options live under one envelope.
    apply: (
      nodes: any,
      edges: any,
      opts: { fit: any; wc: any },
      log?: (msg: string) => void,
    ) =>
      applyBezierFitWeightedChainEdges(
        nodes,
        edges,
        opts.fit,
        opts.wc,
        log,
      ),
    defaults: {
      fit: { ...BEZIER_FIT_WC_DEFAULTS },
      wc: { ...BEZIER_FIT_WC_BASE_DEFAULTS },
    } as any,
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
