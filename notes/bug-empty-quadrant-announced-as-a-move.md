---
title: An empty quadrant is announced as a move in that direction
type: bug
---

# An empty quadrant is announced as a move in that direction

In Move by Link, pressing a direction whose quadrant holds no links leaves the
focus where it was — and then reports it under the pressed direction's name.
With one east link focused, pressing north says:

```
north: <label of the east node>
```

The status line names a direction the link is not in (inferred, 2026-09-18 —
from reading `moveLinkQuadrant` while extracting `link-nav-controller.ts`; not
observed in the app).

## Why it happens

`moveLinkQuadrant` in `graph-nav.ts` has a corner-crossing branch for a
perpendicular press. It sorts the links **in the requested quadrant** and takes
the nearest to the corner:

```ts
const corner = [...candidates]
  .filter(c => linkQuadrant(c.direction) === requested)
  .sort(...)[0];
return {id: corner?.id ?? focused.id, traverse: false};
```

When the requested quadrant is empty, `corner` is `undefined` and it falls back
to `focused.id`. The caller cannot tell that apart from a real corner crossing:
it gets a non-null id, re-focuses it, and emits
`` `${direction}: ${label}` ``.

The `'No link in the ${direction} quadrant.'` message in `LinkNavController`
is therefore close to unreachable. It needs `move.id` to be null, which the
corner branch never returns — so it only fires when there is no focus at all,
and entering the mode always establishes one when the node has any links.

## What the design note says

[Move by Link — quadrant navigation](design-move-by-link-quadrants.md) covers
the corner crossing ("moving up from the top East link chooses the easternmost
North link") but is silent on what a press into an *empty* quadrant should do.
So this is a gap in the design, not a contradiction of it.

## Which is right?

Unknown — Ben's call.

Staying put is defensible: there is nothing in that direction, so nothing should
move, and the dashed quadrant overlay already shows that the quadrant is empty.
What is hard to defend is *announcing* it as `north: …`, which reads as if the
walk went north. Three ways out, in increasing order of change:

1. Keep the behaviour, fix the message — say nothing, or say the quadrant is
   empty. Smallest change; makes the existing unreachable message reachable.
2. Distinguish the cases in `LinkQuadrantMove` — a `stayed: true` flag, or
   returning null id, so the caller knows the difference between "crossed a
   corner to this link" and "there was nothing, have the old one back".
3. Decide a press into an empty quadrant should do something else entirely
   (scan on round the compass, say).

`link-nav-controller.spec.ts` deliberately pins none of this; a comment there
points here.
