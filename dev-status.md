# dev-status

_Updated 2026-05-23. Branch: `main`._

> Read this at the start of every session for **where work currently stands**. Everything historical, topical, or design-rationale lives in [`notes/`](notes/) — see [`notes/README.md`](notes/README.md) for the Map of Content. Canonical instructions are in [`AGENTS.md`](AGENTS.md).

## Current focus

1. **Edge routing — auto-layout quality.** Five custom physics-based routers ship (`b → *`). Next push: integrate `libavoid-js` for obstacle-avoiding polyline routing whose bend output maps onto kidraw's existing waypoints. See [`notes/research-libavoid-integration.md`](notes/research-libavoid-integration.md). Longer-term R&D: polyline nudging — [`notes/research-polyline-nudging.md`](notes/research-polyline-nudging.md). Also queued: auto-tuning parameter sweeps ([`notes/idea-routing-auto-tune.md`](notes/idea-routing-auto-tune.md)) and fixing the bezier anti-parallel overlap ([`notes/bug-bezier-antiparallel-overlap.md`](notes/bug-bezier-antiparallel-overlap.md)).
2. **Doc / agent reorganization.** In progress. Pulling Claude-only memory into the repo, atomizing root .md/.txt into a `notes/` zettelkasten, and standing up specialist agents (`notes/agents/`). See [`notes/README.md`](notes/README.md). Tasks 9–11 of the reorg plan remain.
3. **Serialization.** Phases 1–4 + 6–9 of [`docs/serialization-plan.md`](docs/serialization-plan.md) shipped — Open / Save As / Export Zip / Cycle Display, cascade resolver, prompt-on-miss, v1→v2 localStorage migration. Phase 5 (FSA API for persistent file handles) and Phase 10 (dirty indicator + `beforeunload` polish) remain.

## Recent commits (10 most recent)

| Commit | Subject |
| :--- | :--- |
| `6e9a418` | Misc cleanup — valid-key-combos, dev-considerations, stale files |
| `92e2a10` | Atomize research files into notes/research-* and an idea note |
| `42faca5` | Atomize ideas / project todos / next.txt into idea notes |
| `58f3975` | Atomize design_notes.md into 9 zettel notes |
| `6a264c5` | Move stable specs to docs/ |
| `cf2e94c` | Migrate Claude-only memories into notes/ |
| `e032dca` | Scaffold AGENTS.md, notes/ zettelkasten, .claude/agents/ |
| `3050cdb` | Rename 'default' key profile to 'ijkl'; vim is now canonical |
| `223a254` | Snap new waypoints onto the existing edge polyline |
| `dc4fa1d` | Move waypoint toggle from `c` to `vv` (tap-v-twice) |

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
