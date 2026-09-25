---
title: What the first download is made of
type: analysis
status: measured 2026-09-25; router removed; the rest is Ben's call
---

# What the first download is made of

The ranked list said: "Load size: the first download is 1.07 MB against a
500 kB budget. Lazy-load Math and Markdown." Measured on 2026-09-25 with
`npx ng build --stats-json` (inferred, 2026-09-25, from the esbuild stats):

- **Math already loads lazily.** MathJax is its own 2.8 MB chunk
  (`math-renderer`), fetched only when a label contains math
  (`math-images.ts`, `loadMath`). It is not in the first download.
- **Markdown is tiny.** It is our own 341-line parser
  (`markdown-label.ts`), about 5 kB built. Splitting it off would cost more
  in complexity than it saves.

What the first download was, 1.03 MB raw (263 kB gzipped):

| | raw |
|:--|--:|
| Konva | 188 kB |
| Angular core | 128 kB |
| Angular router | 64 kB |
| js-yaml | 39 kB |
| zone.js | 34 kB |
| rxjs, platform-browser, common | 38 kB |
| our code (keymenu 49, drawing area 42, node 29, header 25, …) | ~490 kB |

## Done

- **The router is gone** (−64 kB). The CLI set it up with an empty route list
  and nothing used it. Now **955 kB raw, 244 kB gzipped**.

## Not done — options, Ben's call

Getting under 500 kB raw is not reachable by lazy-loading: Konva, Angular and
zone.js alone are ~350 kB, and the keyboard, canvas and header are needed on
the first frame.

1. **Raise the budget** to what a canvas app needs (say 1 MB warning, 1.5 MB
   error) and watch the gzipped size instead, which is what users download.
   Cheapest, and honest about what the number measures.
2. **Go zoneless** (Angular's signal-based change detection): −34 kB, but the
   Konva callbacks and timers that rely on zone.js would each need checking.
3. **Load js-yaml lazily** (−39 kB): the parser would become async, and plugins
   saved as YAML are read at startup, so they would load a moment later.
4. **Lazy-load the sample graphs** (−12 kB): small.
