---
title: A wide fan in the horizontal tree draws crossing edges
type: bug
status: open, Ben's call (2026-09-25)
---

# A wide fan in the horizontal tree draws crossing edges

`tools/qa/edges/tree-crossings.js` lays out an 11-way fan (plus two
cross-links) with Tree → and counts crossings you can see. It has asserted 0
and failed on purpose since 2026-08-29 (dev-status item 79); it measured 2
then and **4** on 2026-09-25. Ben's own graph measures 0.

## Why (inferred, 2026-09-25, measured in the running app)

- The fan's children fit their short labels and come out about 56px wide,
  so the tree's depth spacing (80% of the median width, floor 50) leaves a
  **31px gap** between the hub and the column of eleven children, which is
  about 820px tall.
- A straight line from the hub to a distant child therefore enters the
  column far from its target and clips its siblings. The layout hands each
  clipping line to the router (da-531, 2026-08-29), so 8 of 13 edges get
  bent, and the bends, planned one edge at a time, cross each other.
- For a straight line to reach child *k* without clipping, the hub has to
  sit roughly `(child half-width) × (vertical offset) / (child half-height)`
  to the left: about 430px for the farthest children here.

## Options (none taken; Ben's call)

1. **Widen the gap for tall fans** — size a level's depth gap from its
   fan's height. Straight, crossing-free lines, at the cost of width: da-531
   dropped exactly this because it made one of Ben's trees 1214px wide
   instead of 694.
2. **Route a fan as one problem** — give siblings' bends a shared order so
   they nest. Tried on 2026-08-29 with elbows and reverted: the smoothing
   through waypoints made nested elbows weave (19–34 crossings).
3. **Accept it** for fans this tall and short-labelled, and relax the check
   to "no crossings on Ben's kind of graph".

The check stays baselined (0 pass, 1 fail) until one is chosen.
