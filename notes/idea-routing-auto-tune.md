---
title: Auto-tune edge-routing parameters on benchmark graphs
type: idea
---

# Auto-tune edge-routing parameters

For each routing algorithm (charged-spring, bezier-route, hybrid bezier-fit, flexible-wire, weighted-chain), find the best parameter set on each benchmark graph in `demo-data.service.ts` by sweeping parameters + RNG seeds and ranking via the `composite` score in `edge-routing-metrics.ts`.

- **Implementation idea.** A "Run sweep" button in the tuning panel that takes N random samples (cheaper than grid search), reports best, and lets the user load that setting.
- **Output.** A per-algorithm × per-graph table of best settings. Eventually update `DEFAULT_OPTIONS` in each routing module.

## A/B flow refinement

Related improvements for comparing routings:

- **Pre-built comparison sets** the user can click through ("all five algorithms on multi-edge at defaults", "weighted-chain across 8 RNG seeds", "hybrid vs weighted-chain at their respective best", …).
- **Better snapshot rendering.** Today `stage.toDataURL()` captures the live stage at whatever zoom / area is open. For comparison snapshots we want: 100 % zoom (no pan/zoom transform), a fixed render area larger than the typical viewport (e.g. 1024×768), and a dark-mode background. Render to an off-screen Konva stage with a fixed size + dark-mode palette; dump *that* stage's `toDataURL()`.
