# Browser tests

Black-box tests that drive the real app in a real browser: they load KiDraw at
`localhost:4200`, send real key and mouse events, and read state back through
`window.ng.getComponent`. Between them they cover the interaction behaviour
that unit specs can't reach — held-key modes, drag, grid navigation, the
keymenu — which is exactly the behaviour most at risk when
`drawing-area.component.ts` is restructured.

```bash
npm start                      # in another terminal: the app must be running
npm run qa                     # the regression suite
npm run qa -- --region keys    # one region
npm run qa -- --only nav-popup # one script
npm run qa -- --list           # what exists, and what is quarantined
npm run qa -- --all            # everything, dated snapshots included
```

On a machine with no system Chrome, point `CHROME_BIN` at one (the Puppeteer
cache under `~/.cache/puppeteer/chrome/*/chrome-linux64/chrome` will do).

## How to use it when refactoring

`suite.mjs` tags every script with the **region** of the app it guards. Before
moving a region's code:

1. `npm run qa -- --region <region>` and get it green *first*. A failure you
   inherit is indistinguishable from one you cause.
2. Move the code.
3. Run the region again, then the whole suite.

A region with few scripts is a region with little cover — treat that as a
reason to write one before refactoring, not as permission to skip the step.

## Baselines, and the debt they record

Sixteen of the 42 scripts were already failing the first time they were run
together, on 2026-09-16 — nothing had run them as a set in months, so nobody
knew. They were not deleted and not quietly skipped. Each carries a
`baseline` in `suite.mjs` recording what it scored that day, and passes here
by not getting **worse**.

That keeps two things true at once: the suite is usable today as a
"don't make it worse" net, and the summary still says out loud how many
checks are owed.

**A baseline is a debt, not a pass.** The region it sits in is only partly
protected. Fixing the script, or the app, means deleting the baseline line —
that is the only way the number goes down.

The failures are a mix, and the mix matters:

- *Stale* — the app changed on purpose and the script was never updated.
  `repro-nav-popup.js` (30 checks) looks like this: the key it presses does
  nothing at all now.
- *Intended change, untold test* — `repro-search-recenter.js` expects a match
  to land at the stage centre; it now lands 102px high, consistently, which
  looks deliberate.
- *Real regression* — `repro-coarse-drag.js` finds that Increase Node Size no
  longer resizes anything, and `repro-grow-mode.js` finds held-Add wiring a
  node to itself.

Only the third kind is a bug, but all three read identically in the output,
so none can be waved away without looking.

## Statuses

- **suite** — in the regression suite.
- **oneoff** — a snapshot of one day's work, kept for the record. Not a
  statement about how the app should behave now.

## Why these are scripts, not a test framework

Each file was written to chase one behaviour, with a header comment saying
what should happen and numbered checks that assert it. They read as
explanations, which a `*.spec.ts` full of fixtures would not, and they can be
run one at a time while a bug is being chased. The runner adds the only thing
they were missing: a way to run them together and get a single answer.
