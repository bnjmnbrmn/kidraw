# What the marks on a key card mean

Each key on the keymenu card can carry three marks. They are independent, and
every one of them names something you can say out loud:

| Mark | Where | Means |
| :--- | :--- | :--- |
| Chamfer — a cut bottom-right corner | bottom right | The key **has children**: hold it and a submenu card slides in. |
| Lift arrow | lower right | The key **fires when you let go**. On a held-surface card, the arrow sits on an outlined hole so the original held key remains visible below. |
| `↺` badge | bottom left | The action **repeats** while the key is held. |

Ordinary release actions carry the arrow on their key. A drawing-area-owned
held surface does not draw a second copy of the hub: it cuts a hole in the
upper card, shows the held key from the card below, and draws the release cue
around that hole.

## Corners say nothing (2026-08-29, da-477)

Corner radius used to encode "this key is an action-submenu rather than a plain
submenu": rounded for actions and action-submenus, square for pure submenus.
Nobody read it — including the person who designed the menu:

> I don't understand why some items in the key menu have rounded corners and
> some are squared off. For example, "Layout..." vs "Pan/Zoom..."

A 4px difference in radius is not a legible way to name a behaviour. Every card
uses the same corner radius now.

The first attempt at rehousing that meaning gave action-submenus the `↑` badge.
That was wrong, and Ben caught it:

> But Pan/zoom doesn't do anything when you press it, besides open the submenu,
> right?

Correct. An action-submenu's action is wired as its **key-down** handler, so
`↑` ("fires when you let go") is false for all of them — and the actions
themselves are three different animals:

| Key | What its action actually does on key-down |
| :--- | :--- |
| `v` Select+Drag | Acts at once: selects what is under the crosshairs, enters drag mode. |
| `a` Add | Arms a gesture. Whether it was a tap (quick add) or a hold (grow) is resolved by the drawing area on release. |
| `r` Pan/Zoom | Keeps the crosshairs visible while the key is held (da-257). Press and release it and nothing happens. |
| `g` Move by node | Same shape as `r`: shows the node grid while held. |

## Held hubs: preserve the physical gesture

The root card still does not pretend that every action-submenu has the same
release behavior: `v`, `a`, `r`, and `g` remain different animals. Once `a`
has actually opened a drawing-area-owned grow surface, however, the UI knows
the concrete gesture. The upper card therefore uses a release slot at `a`
instead of the old duplicate key labelled “Release: …”.

This makes both facts visible at once:

- the readable `a / Add` cap below says which physical key is still down;
- the cutout, dashed outline, and lift arrow say that letting it go resolves
  the current grow action.

If a fourth thing ever needs saying on a card, give it a mark with a name — not
a shade, a radius, or a weight.
