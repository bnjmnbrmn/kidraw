---
title: "Next edge out" doesn't seem to work
type: bug
status: needs-verification
---

# "Next edge out" doesn't seem to work

User report: the "next edge out" traversal action (in the graph-move submenu) doesn't appear to be working.

Needs verification: traverse functions were rewritten in the 2026-05-10 session ("Graph traversal fixed — `g→n` and `g→p` now emit `TRAVERSE_OUTGOING_NEXT` and `TRAVERSE_INCOMING_NEXT`"). The report may pre-date that fix. Repro: open the basic sample, move crosshairs onto a node with multiple outgoing edges, enter graph-move submenu, press the outgoing-next key, observe.

If still broken, suspect the traversal index map (`outgoingTraversalIndexByNode`) or the cycle logic. See [idea-test-coverage-gaps](idea-test-coverage-gaps.md) — traversal index cycling is on the untested list.
