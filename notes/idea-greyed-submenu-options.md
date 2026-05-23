---
title: Visualize greyed-out submenu options
type: idea
---

# Visualize greyed-out submenu options

Some submenu actions are only valid in certain contexts — e.g. the "edge" option in the insert submenu requires two selected nodes; "label" requires an edge under the crosshairs. Today the keymenu shows these actions identically whether or not they'll do anything; pressing an invalid action silently no-ops (or emits a status message after the fact).

Better: render currently-invalid actions as visually muted (grey, lower opacity) so the user knows up-front. This depends on the keymenu component being able to ask the drawing area "is this action valid right now?" — a contract that doesn't fully exist yet.

Not on the critical path; flagged from the held-key-modes design discussion. See [decision-interaction-model](decision-interaction-model.md).
