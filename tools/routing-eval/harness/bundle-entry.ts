// Bundle entry the esbuild step compiles. We re-export each router and the
// metrics module under stable names so the harness can read them off a
// single CommonJS module via require().
//
// The esbuild build script substitutes our fake-da-node / fake-da-edge for
// the real ones via an `alias` map (see build-bundle.mjs).
//
// Only bezier-fit-weighted-chain is exposed. The 5 other routing algorithms
// were removed in commit df50448 (see tag `pre-routing-consolidation` for
// the prior state). The bf-wc algorithm's weighted-chain physics base is
// imported transitively through bezier-fit-weighted-chain-edges.ts; we
// don't need a separate registration for weighted-chain here.

import {
  applyBezierFitWeightedChainEdges,
  applyBezierFitWeightedChainEdgesForOne,
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
    // Incremental variant: routes ONE target edge while leaving the others
    // as frozen wall samples. The verification driver invokes this via
    // Routers['bezier-fit-weighted-chain'].applyOne(...). Not registered as
    // a top-level algorithm key because the harness sweeps don't iterate
    // it — it has different inputs (needs a target-edge selector).
    applyOne: (
      nodes: any,
      edges: any,
      targetEdge: any,
      opts: { fit: any; wc: any },
      log?: (msg: string) => void,
    ) =>
      applyBezierFitWeightedChainEdgesForOne(
        nodes,
        edges,
        targetEdge,
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
