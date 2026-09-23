---
title: What "more readable" means here (Ben's refactoring taste)
type: process
---

# What "more readable" means here

Recorded from four side-by-side choices Ben made on real `drawing-area.component.ts`
code (Ben, 2026-09-17). Each was a genuine judgement call with a defensible
answer on both sides; these are the ones he picked.

## The four calls

**Method size: aim for ~8–10 lines, and invent an abstraction to get there.**
Offered a 75-line `dragNodesAndFollow` split three ways — an `Axis` object
giving ~8-line pieces, three plain ~25-line steps, or leaving it — Ben chose
the `Axis` object. A new concept is an acceptable price for small methods.
The stated limit is **no more than 10 lines**, with the caveat: *don't group
things in arbitrary ways.* The abstraction has to be real, not a bag.

**Prefer expressions to sequences of statements.** Offered three forms of
`gridSnapStep`, Ben chose the one that lifts the arithmetic to a pure
module-scope function and leaves the component method sequencing only the
side effects — over both the statement-with-local-function version and the
fully-inlined one. Note what this rejects: it is not "fewest lines". The
inlined version was shortest and lost, because it repeated the formula.

**Remove duplication with a higher-order helper.** For the three style
setters sharing a selection-else-hover-else-complain shape, Ben chose
`withTargetEdges(noun, apply)` over merely sharing the target lookup, and over
leaving them separate. Passing behaviour as a parameter is welcome.

**Prefer a named method to a named local.** For a once-used
`const hasSelection = ...`, Ben chose folding it into a `hasSelection()`
method over keeping the local and over inlining it. Naming a thing is good;
a method is the better place to put the name.

## The through-line

Push logic out of the component into pure, named, reusable units. Keep what
remains thin, and keep the side effects visible as effects. Small methods are
the goal, and a new abstraction is a fair price for them — provided it names
something real.

## What this does not say

*Superseded 2026-09-23:* Ben's plugin direction ([`design-plugins.md`](design-plugins.md))
has commands handled by registered owners rather than the switch, and a mapped
type turned out to keep the exhaustiveness below — so the switch became
per-owner handler slices (`command-handlers.ts`). Neither was a ruling on the
switch as such (inferred, 2026-09-23). The original paragraph, kept for the
record:

Ben has not ruled on how far to go with `dispatchCommand`, the 395-line flat
`switch`. It is one `case` per command and its `assertNever` gives
compile-time exhaustiveness; splitting it into grouped sub-dispatchers would
trade that guarantee for a smaller number. Left alone pending his call
(inferred, 2026-09-17 — from the absence of a decision, not from a decision).
