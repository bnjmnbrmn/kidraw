---
title: Keymenu visual polish
type: idea
---

# Keymenu visual polish

Polish items for the keymenu's visual rendering, none on the critical path.

- **Card color progression.** Current card background array is somewhat arbitrary. A gradual hue shift (slate → blue → indigo → violet as depth increases) would make the stack hierarchy more intuitive. Worth experimenting with 5–6 levels since insert+drag already hits depth 3.
- **Card transition direction.** Today cards slide in from the right. Sliding from the direction of the pressed key (e.g. left-side key → slides from left) would create a spatial relationship between physical key and resulting card.
- **Held-key hole styling.** The transparent hole punch works but a subtle glow or coloured border around the cutout would reinforce "where you are."
- **Blank key styling by purpose.** Distinguish "available for future binding" (dashed) from "structurally empty" (no visual). Reduces visual noise.
- **Key shape language.** Action / submenu / action+submenu / release-action keys could have distinct visual shapes (rounded vs cut corners). High-impact for learnability.
- **Modifier keys & number row.** Render Shift / Alt / Ctrl and the number row in the visible keyboard overlay.
- **Color-blind accessibility.** Textures / patterns on cards as an alternative encoding to colour alone.
- **Slide animation tuning.** Direction, duration, easing, delay — all tunable.
