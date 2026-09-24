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

Reading the output: a baselined script prints its live counts and then the
baseline it is measured against — `12 passed, 3 failed (baseline 12 pass, 3
fail)`. Those are two independent totals, not a ratio. The `29/39 clean` on
the summary line *is* a fraction: scripts that came out clean, out of scripts
run.

The failures are a mix, and the mix matters:

- *Stale* — the app changed on purpose and the script was never updated.
  `nav-popup/nav-popup.js` (30 checks) looked like this: the key it pressed did
  nothing at all. (It was retired with `TRAVERSE_SMART` on 2026-09-24.)
- *Intended change, untold test* — `search/search-recenter.js` expects a match
  to land at the stage centre; it now lands 102px high, consistently, which
  looks deliberate.
- *Real regression* — `drag-and-grow/coarse-drag.js` found that Increase Node Size no
  longer resized anything (the command was retired on 2026-09-24, since no key
  sent it), and `drag-and-grow/grow-mode.js` finds held-Add wiring a node to
  itself.

Only the third kind is a bug, but all three read identically in the output,
so none can be waved away without looking.

## What the owed checks actually are

67 checks were owed as of 2026-09-17, but they are not 67 problems. Grouped by
apparent cause:

| Cause | Checks | Read |
|---|---:|---|
| Add/insert wires a node to **itself** | 22 | real bug. `grow-mode` gets `A→A`; `add-insert-taps` gets `{from: alpha, to: alpha}` and the app's own status says "Self loop added to alpha" |
| `nav-popup` fixture sits off-screen | 32 | unsure. Crosshairs at `(2320, −363)`; looks like the stale-fixture problem fixed in grid-overlay, but `binding-reorg` also reports root `f` renamed "Go" → "Move by Link" |
| Recentring lands 102px high | 5 | stale test. Two scripts, same number, every run; 102px looks like a deliberate viewport inset |
| Label anchoring | 4 | unsure. Coarse-right will not snap to a canonical stop; side cycles `below → on`; drag-right does not slide |
| Increase Node Size does nothing | 1 | real bug. Width identical before and after |
| Layout quality below the bar | 2 | unsure. Force-clear leaves 2 edges piercing nodes (expected 0); an 11-way fan draws 4 crossings |
| Label text lands at the wrong offset | 1 | possible bug. "Hello world" plus more came out as `Hello wnd quite a lot more text to stretch the boxorld` |
| `clipboard-yank-paste` throws | — | broken test. Two checks pass, then it exits non-zero with no failure line |

Two clusters hold 54 of the 67, and both sit in regions due for
restructuring — so the debt and the code are the same trip.

## Statuses

- **suite** — in the regression suite.
- **oneoff** — a snapshot of one day's work, kept for the record. Not a
  statement about how the app should behave now.

## Where these came from

Until 2026-09-16 these lived in `tools/` as 50 flat `repro-*.js` files —
"repro" for *reproduction*, the throwaway script you write to watch a bug fail.
They had outgrown the name: nearly all of them assert behaviour that is
supposed to hold, so they are tests, and the `da-161`-style ids in their old
filenames referred to issue numbers you cannot see from the app. The headers
inside each file still carry those ids, so the trail back is intact.

## Why these are scripts, not a test framework

Each file was written to chase one behaviour, with a header comment saying
what should happen and numbered checks that assert it. They read as
explanations, which a `*.spec.ts` full of fixtures would not, and they can be
run one at a time while a bug is being chased. The runner adds the only thing
they were missing: a way to run them together and get a single answer.
