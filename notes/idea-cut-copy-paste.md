---
title: Cut / copy / paste
type: idea
---

# Cut / copy / paste

Across two domains:

- **Graph objects** — nodes, edges, waypoints, labels. Copy a subgraph; paste replicates with new ids; cut deletes after copying.
- **Text inside label-edit** — selection, cut, copy, paste within a label's text. Today label-edit is character-by-character.

Subgraph copy is the more interesting one: needs an internal representation distinct from the graph snapshot (which is whole-graph), and a way to position pasted nodes (offset from crosshairs?).
