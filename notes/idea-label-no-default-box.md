---
title: Labels without visible boxes by default
type: idea
---

# Labels without visible boxes by default

Today every `DALabel` renders a visible box around the text. The user wants the box to be off by default — text only, transparent background. The box stays available as an explicit style option ("highlighted label" / "boxed label").

Also: labels should be more obviously selectable (they're often skipped during selection passes). Verify the current selection path lands on labels at the same generous tolerance waypoints get, per [architecture-invariants](architecture-invariants.md) #11.
