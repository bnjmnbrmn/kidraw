---
title: Diagonal-movement profile (2×2 cluster)
type: idea
---

# Diagonal-movement profile (2×2 cluster)

The shipping profiles ([vim, ijkl](architecture-key-profiles.md)) use one key per cardinal direction. Diagonal movement requires two simultaneous keypresses — works, but is awkward.

A profile arranged in a 2×2 or diagonal cluster (e.g. `e s d f`, or a numpad-style mapping) could allow each diagonal to be its own physical key. Worth prototyping once the rest of the interaction model has stabilized.

Open questions if we build it: how to render the visual keymap (the rectangular keymenu component assumes cardinal directions), and whether the gain in diagonal ergonomics is worth the loss of vim familiarity.
