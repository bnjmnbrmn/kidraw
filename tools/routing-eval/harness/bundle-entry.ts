// Bundle entry the esbuild step compiles. We re-export each router and the
// metrics module under stable names so the harness can read them off a
// single CommonJS module via require().
//
// The esbuild build script substitutes our fake-da-node / fake-da-edge for
// the real ones via an `alias` map (see build-bundle.mjs).
//
// The old standalone routing algorithms were removed in commit df50448 (see
// tag `pre-routing-consolidation` for the prior state). Keep experimental
// routers registered here first so routing-eval can compare them before the
// app exposes them.

import {
  applyBezierFitWeightedChainEdges,
  DEFAULT_OPTIONS as BEZIER_FIT_WC_DEFAULTS,
  DEFAULT_WC_OPTIONS as BEZIER_FIT_WC_BASE_DEFAULTS,
} from '../../../src/app/drawing-area/bezier-fit-weighted-chain-edges';

import {
  applyDesiderataRouteEdges,
  DEFAULT_OPTIONS as DESIDERATA_DEFAULTS,
} from '../../../src/app/drawing-area/desiderata-route-edges';

import {
  applyIncrementalDesiderataRouteEdges,
  DEFAULT_OPTIONS as INCREMENTAL_DESIDERATA_DEFAULTS,
} from '../../../src/app/drawing-area/incremental-desiderata-route-edges';

import {
  computeRoutingMetrics,
  DEFAULT_WEIGHTS as METRIC_DEFAULTS,
} from '../../../src/app/drawing-area/edge-routing-metrics';

import { DANode } from './fake-da-node';
import { DAEdge } from './fake-da-edge';

export const Routers = {
  'bezier-fit-weighted-chain': {
    // The fit step's options + the underlying weighted-chain options live
    // under one envelope so the runner can override either side without
    // changing the uniform router-call shape.
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
  'desiderata': {
    apply: (
      nodes: any,
      edges: any,
      opts: any,
      log?: (msg: string) => void,
    ) =>
      applyDesiderataRouteEdges(
        nodes,
        edges,
        opts,
        log,
      ),
    defaults: {
      ...DESIDERATA_DEFAULTS,
      base: {
        fit: { ...DESIDERATA_DEFAULTS.base.fit },
        wc: { ...DESIDERATA_DEFAULTS.base.wc },
      },
    } as any,
  },
  'incremental-desiderata-v2': {
    // Returns an IncrementalRouterStats object the runner can record as
    // instrumentation (candidates, score calls, elapsed ms, budget-hit,
    // unclean edges). Other routers return void; the runner tolerates both.
    apply: (
      nodes: any,
      edges: any,
      opts: any,
      log?: (msg: string) => void,
    ) =>
      applyIncrementalDesiderataRouteEdges(
        nodes,
        edges,
        opts,
        log,
      ),
    defaults: {
      ...INCREMENTAL_DESIDERATA_DEFAULTS,
      local: { ...INCREMENTAL_DESIDERATA_DEFAULTS.local },
      budgets: { ...INCREMENTAL_DESIDERATA_DEFAULTS.budgets },
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
