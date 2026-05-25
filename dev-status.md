# dev-status

_Updated 2026-05-25. Branch: `main`._

> Read this at the start of every session for **where work currently stands**. Everything historical, topical, or design-rationale lives in [`notes/`](notes/) — see [`notes/README.md`](notes/README.md) for the Map of Content. Canonical instructions are in [`AGENTS.md`](AGENTS.md).

## Current focus

1. **Edge routing — consolidated to `bezier-fit-weighted-chain` (bf-wc).** The 5 other routing algorithms (charged-spring, bezier-route, bezier-fit-charged-spring, flexible-wire, weighted-chain) are removed from production. Tag [`pre-routing-consolidation`](#) (901c28d) preserves their state; resurrection notes at [`notes/algo-deprecated-routers.md`](notes/algo-deprecated-routers.md). The runtime tuning panel + a/b service are gone too — bf-wc uses its `DEFAULT_OPTIONS` for now. Next: build a metric explorer + pairwise weight calibration tool (Phase 2 of the plan at `~/.claude/plans/looks-good-i-want-iterative-whale.md`), then a per-graph optimizer, then (if optimization headroom warrants) a surrogate NN that predicts good starting parameters from graph features.
2. **Routing-eval harness** (`tools/routing-eval/`) — same infrastructure as before, now exposes only bf-wc. `run.mjs` for default-options runs (rate per cell); `sweep.mjs` for the dpTolerance sweep on dense+sparse; `tune-bf-wc.mjs` for the 2D dp × seg grid with zoom-on-double-click.
3. **Serialization.** Phases 1–4 + 6–9 of [`docs/serialization-plan.md`](docs/serialization-plan.md) shipped. Phase 5 (FSA API for persistent file handles) and Phase 10 (dirty indicator + `beforeunload` polish) remain.

## Routing-eval harness

The white-box harness runs bf-wc against a 12-scenario battery and dumps SVG + metrics + geometry per cell. Routers are called as pure functions via an esbuild alias for `./da-node` and `./da-edge` (the Konva-bound DA layer) → harness-local fakes; no runtime modification of the routers themselves.

- Harness: `node tools/routing-eval/run.mjs` (or `npm run routing-eval`).
- Sweep: `node tools/routing-eval/sweep.mjs` (single-knob bracketed values, grid viewer).
- 2D tune: `node tools/routing-eval/tune-bf-wc.mjs` (dp × seg grid, double-click any cell to zoom).
- Viewer: `python3 -m http.server -d tools/routing-eval 8765`, then open `http://localhost:8765/viewer/`.
- Output / metric definitions / scenario list: [`tools/routing-eval/README.md`](tools/routing-eval/README.md).

## Recent commits (10 most recent)

| Commit | Subject |
| :--- | :--- |
| `a6834ad` | Harness/sweep: drop the 5 removed routers, fix viewer-launch hint |
| `f398eb8` | Delete the 4 now-unused router source files + a spec |
| `a280a22` | Untrack accidentally-added worktrees + screenshot; harden gitignore |
| `df50448` | Consolidate routing to bf-wc; remove tuning panel + a/b service |
| `901c28d` | bezier-fit-weighted-chain: strip cps inside src/dest node bboxes |
| `3377ed5` | render-svg: shift arrow marker refX 9 → 10 so tip sits on node perimeter |
| `dfa26ff` | tune-bf-wc: double-click a cell to zoom |
| `05b2c6b` | Add tools/routing-eval/tune-bf-wc.mjs — 2D fine-tuning grid |
| `7485246` | Add bezier-fit-weighted-chain hybrid (harness-only) |
| `0070a4c` | Merge Phase B tuning sweeps (algo notes + sweep tool) |

## Dev commands

```bash
npm start                                              # dev server at localhost:4200
npx ng test --watch=false --browsers=ChromeHeadless   # run tests (do NOT use npm test)
npx ng build                                          # production build / type-check
```

**Test note:** `npm test` can hang. Always use `npx ng test --watch=false --browsers=ChromeHeadless`. Tests are at 152/152 after the consolidation (was 159; the deleted `charged-spring-edges.spec.ts` accounted for the difference).

## Where to read next

- [`AGENTS.md`](AGENTS.md) — canonical project / agent instructions.
- [`notes/README.md`](notes/README.md) — Map of Content for the project zettelkasten.
- [`docs/`](docs/) — stable long-form specs (file format, serialization plan, diagrams).
