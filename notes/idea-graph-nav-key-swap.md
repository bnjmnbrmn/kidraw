---
title: Graph nav — maybe swap n/p and j/k roles
type: idea
status: undecided (Ben, 2026-07-13 — "not sure"; dogfood the current scheme first)
---

# Graph nav: n/p for siblings, j/k for in/out of edges?

Verbatim from Ben (2026-07-13): "maybe want to use n and p for going between
siblings and j and k to go into and out of edges (switch things). Not sure."

## Current mapping (vim profile, since the traversal rework)

| Key | Action |
| :-- | :-- |
| `n` / `p` | Jump Outgoing / Jump Incoming — pick an edge, then *move along it* |
| `j` / `k` | Next / Prev Edge — cycle the focused edge clockwise/ccw |

## The proposed swap

| Key | Action |
| :-- | :-- |
| `n` / `p` | between **siblings** |
| `j` / `k` | **into / out of** edges (the movement) |

Mnemonic case for the swap: vim `n`/`p` are next/prev — cycling siblings *is*
a next/prev operation; vim `j`/`k` are down/up — descending into / climbing
out of the graph reads as vertical travel. Under the current mapping the
mnemonics are arguably backwards (`n` "next" does movement, `j`/`k` do
cycling).

## To clarify before implementing

- **"Siblings" of what?** (a) sibling *edges* at the current node — today's
  Next/Prev Edge, making this a pure key swap; or (b) sibling *nodes* — jump
  directly between children of the same parent without going back through
  the parent (a genuinely new traversal move, natural on trees: cousins
  along the ring). If (b), it composes well with gathering and tree layouts,
  and the edge-cycling function still needs keys somewhere.
- Whether `j`/`k` as in/out keeps the outgoing/incoming asymmetry (`j` =
  continue forward, `k` = reverse per Q2) or becomes strictly
  descend/ascend.
- ijkl profile mapping (`n`/`p` same; `k`/`i` currently Next/Prev Edge).

Decision deferred until the current scheme has been dogfooded on the todo
graph. Related: dev-status Current-focus item 13 (traversal rework),
[idea-gather-recursive](idea-gather-recursive.md) (nav-aware gathering).
