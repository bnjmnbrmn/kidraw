# What the marks on a key card mean

Each key on the keymenu card can carry three marks. They are independent, and
every one of them names something you can say out loud:

| Mark | Where | Means |
| :--- | :--- | :--- |
| Chamfer — a cut bottom-right corner | bottom right | The key **has children**: hold it and a submenu card slides in. |
| `↑` badge | bottom left | The key **fires when you let go**. Tap it and it acts; hold it for the children, if it has any. |
| `↺` badge | bottom left | The action **repeats** while the key is held. |

Only action keys carry a badge. A chamfered key is a hub, and hubs are not
badged — see the open question below for why.

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

## Open question: how to mark a hub that also acts

`v` and `a` do something a plain hub does not, and nothing on the card says so.
That is a real gap, not a resolved design — but it wants a mark that says which
of the three behaviours a key has, and it is entangled with the Layout-menu
cleanup Ben is thinking through (da-451). Left unmarked deliberately rather
than marked wrongly.

If a fourth thing ever needs saying on a card, give it a mark with a name — not
a shade, a radius, or a weight.
