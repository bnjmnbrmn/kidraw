---
title: Overlapping-nodes handling
type: idea
---

# Overlapping-nodes handling

When two nodes occupy the same space (after a drag, after a load, after an auto-layout), what should happen?

Options on the table:

- **Z-cycle.** Tab / shortcut cycles which node is "on top" under the crosshairs.
- **Push-apart.** Detect overlaps and nudge nodes outward to separate them. Easy to implement; can be jarring.
- **Block insertion.** Refuse to create a node where it would overlap an existing one. Restrictive but predictable.

Currently the behaviour is whichever node is z-on-top wins for selection; no push-apart.
