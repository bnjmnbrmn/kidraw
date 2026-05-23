---
title: Movement acceleration
type: idea
---

# Movement acceleration

Crosshairs move at a fixed pace per keypress today, with grid tiers (`fine` / `normal` / `coarse`) for explicit step size. An *accelerating* movement — held movement key speeds up over time, decelerates on release — would feel more natural for traversing large diagrams.

Care needed so that single taps still produce a single grid step (no acceleration during the first ~100 ms of a hold).
