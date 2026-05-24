# dev-status

_Updated 2026-05-24. Branch: `main`._

> Read this at the start of every session for **where work currently stands**. Everything historical, topical, or design-rationale lives in [`notes/`](notes/) — see [`notes/README.md`](notes/README.md) for the Map of Content. Canonical instructions are in [`AGENTS.md`](AGENTS.md).

## Current focus

1. **Edge routing — auto-layout quality.** Five custom physics-based routers ship (`b → *`). Round-1 characterization harness now in [`tools/routing-eval/`](tools/routing-eval/README.md) — runs every router against a 12-scenario battery, dumps SVG + metrics + geometry per cell, viewer captures 1–5 + comment per cell. Awaiting human rating pass; next agent round consumes `tools/routing-eval/feedback/feedback-<run>.json` for tuning sweeps and bug-fix targeting. Longer-term: integrate `libavoid-js` ([`notes/research-libavoid-integration.md`](notes/research-libavoid-integration.md)); polyline nudging R&D ([`notes/research-polyline-nudging.md`](notes/research-polyline-nudging.md)); fix bezier anti-parallel overlap ([`notes/bug-bezier-antiparallel-overlap.md`](notes/bug-bezier-antiparallel-overlap.md)).
2. **Doc / agent reorganization.** In progress. Pulling Claude-only memory into the repo, atomizing root .md/.txt into a `notes/` zettelkasten, and standing up specialist agents (`notes/agents/`). See [`notes/README.md`](notes/README.md). Tasks 9–11 of the reorg plan remain.
3. **Serialization.** Phases 1–4 + 6–9 of [`docs/serialization-plan.md`](docs/serialization-plan.md) shipped — Open / Save As / Export Zip / Cycle Display, cascade resolver, prompt-on-miss, v1→v2 localStorage migration. Phase 5 (FSA API for persistent file handles) and Phase 10 (dirty indicator + `beforeunload` polish) remain.

## Routing-eval harness (2026-05-24)

Round-1 infrastructure for evaluating the five edge-routing algorithms sits in [`tools/routing-eval/`](tools/routing-eval/README.md). Routers are called as pure functions by aliasing `./da-node` and `./da-edge` (the Konva-bound DA layer) to harness-local fakes at esbuild-bundle time — no runtime modification of the routers themselves.

- Harness: `node tools/routing-eval/run.mjs` (or `npm run routing-eval`).
- Viewer: `python3 -m http.server -d tools/routing-eval/viewer 8765`.
- Output / metric definitions / scenario list: [`tools/routing-eval/README.md`](tools/routing-eval/README.md).

## Recent commits (10 most recent)

| Commit | Subject |
| :--- | :--- |
| `08d8ab8` | Preserve viewer comment when clearing a cell rating |
| `8d0997f` | Apply routing-eval round-1 review fixes (harness side) |
| `79c24d6` | Document routing-eval, wire dev-status at it |
| `3cf180f` | Add routing-eval viewer: per-cell rating UI + feedback download |
| `1040378` | Add routing-eval harness: pure-function router calls + scenario battery |
| `faa5637` | Final pass — verify reorg + tidy MOC pointer to agents/README |
| `3d4d759` | Add tools/worktree-port.sh for parallel-worktree dev servers |
| `ace1a82` | Write 13 agent specs (notes/agents/ + .claude/agents/) |
| `70e3f23` | Shrink dev-status.md and trim AGENTS.md to point into notes/ |
| `6e9a418` | Misc cleanup — valid-key-combos, dev-considerations, stale files |

## Dev commands

```bash
npm start                                              # dev server at localhost:4200
npx ng test --watch=false --browsers=ChromeHeadless   # run tests (do NOT use npm test)
npx ng build                                          # production build / type-check
```

**Test note:** `npm test` can hang. Always use `npx ng test --watch=false --browsers=ChromeHeadless`. Tests are at 159/159 as of this writing.

## Where to read next

- [`AGENTS.md`](AGENTS.md) — canonical project / agent instructions.
- [`notes/README.md`](notes/README.md) — Map of Content for the project zettelkasten.
- [`docs/`](docs/) — stable long-form specs (file format, serialization plan, diagrams).
