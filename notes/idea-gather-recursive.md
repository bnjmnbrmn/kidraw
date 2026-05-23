---
title: Gather feature — recursive, with push-away
type: idea
---

# Gather feature

The current `gather` ( `g → h` ) animates immediate connected nodes close to the current node, restoring after 5 s or on next gather. It's useful but limited.

Wanted:

- **Recursive at least one level deeper** — gather neighbours-of-neighbours when the immediate set is small.
- **Push away.** When pulling neighbours in, push *other* nodes out of the way so the gathered set is actually visible. Today nearby unrelated nodes can occlude.
- **General layout application.** Gather is one specialised layout; the underlying primitives (force-directed, push-away) should be reusable as a "layout this subgraph" operation.
