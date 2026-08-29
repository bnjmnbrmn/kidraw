# Chord ergonomics: which same-hand pairs actually work

A keymenu chord is *hold a hub key, press a child key*. When both keys fall on
the same hand, the comfort of the chord is set by which fingers they use — not
by how far apart the keys are, and not by what the child key does elsewhere.

**The binding constraint is finger independence, not distance.** The middle and
ring fingers are the most tightly coupled pair on the hand: tendon and neural
coupling means moving one while the other is held down is genuinely hard.
Ring↔index and middle↔index are much freer.

Ben, 2026-08-29, on `w-d`:

> the middle and ring fingers are more tightly bound to each other, and moving
> them independently is difficult than, say, the ring finger and index finger,
> or even the index finger and middle finger

That is why `w-d` (hold ring, press middle) felt wrong and `w-q` (hold ring,
press pinky) is better, even though `q` is the pinky's key and `d` sits under a
stronger finger.

## The rule

Rank same-hand chords, best first:

1. **Different hands** — always fine, and the reason Add (`a`, left) pairs with
   `hjkl` (right).
2. **Index + anything** — the index finger is the most independent.
3. **Ring + pinky**, **middle + pinky** — the pinky is weak but not coupled to
   the finger being held.
4. **Middle + ring** — avoid. This is the pair to design *away* from.
5. **Same finger** — impossible, not merely awkward.

Left hand, QWERTY: `q a z` pinky · `w s x` ring · `e d c` middle · `r f v t g b`
index. Right hand mirrors it: `p ; /` pinky · `o l .` ring · `i k ,` middle ·
`u j m y h n` index.

So a hub on `w` (ring) should put its children on `q a z` (pinky) or the index
columns, and keep them off `e d c` (middle).

## Where this has bitten

- `w-d` Line Style → moved to `w-q` (da-453, `42f7958`). The first explanation
  written down for that move — that `d` is Fine Move at root — was wrong; root
  bindings are irrelevant inside a held submenu. The reason is the hand.
- The insert hub's shape/edge children (`d`/`s` under a held `a`) are pinky-hub
  with middle and ring children: acceptable, since the *hub* is the pinky.
  Flagged for dogfooding in [architecture-key-profiles](architecture-key-profiles.md).
- **Shape moved from `w-e` to `w-g`** (da-537, `2026-08-29`). "Don't seem to be
  able to apply the circle style at the moment" — and the command works fine
  when sent directly, so it was the chord. The style tree is three levels
  (`w` → category → value) and the first two are *both held*, so a category on
  `e` meant holding ring and middle together and tapping a third key. Every
  category is now pinky or index under the ring-finger hub: Shape `g`, Colour
  `r`, Overflow `f` (index), Line Style `q` (pinky). Worth re-checking any
  future three-level menu against this: the deeper the tree, the more fingers
  are already committed.
