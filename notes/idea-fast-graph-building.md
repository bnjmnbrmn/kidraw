---
title: Fast graph building
type: idea
---

# Fast graph building

The goal is to make adding a connected node feel as fast as adding a bullet point in org-mode / markdown — minimal keystrokes, no manual edge creation.

- **Directional insert chord.** One chord (e.g. `f → d → j/k/l/h` in vim) auto-creates a node *and* an edge from the current node in that direction (below / above / right / left). Rapid linear or grid graph building.
- **Vertical linked node series.** A "list mode" where each new line creates a new node connected to the previous, like nested bullets.
- **Back-reference edges with auto-routing.** When a later node refers back to an earlier one, the edge should auto-route *around* intervening nodes instead of slicing through them.
- **Auto-placement.** Smart positioning for the new node — relative to the previous node, snapped to a grid step, in the natural reading direction.
