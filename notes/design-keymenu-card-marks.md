# What the marks on a key card mean

Each key on the keymenu card can carry three marks. They are independent, and
every one of them names something you can say out loud:

| Mark | Where | Means |
| :--- | :--- | :--- |
| Chamfer — a cut bottom-right corner | bottom right | The key **has children**: hold it and a submenu card slides in. |
| `↑` badge | bottom left | The key **fires when you let go**. Tap it and it acts; hold it for the children, if it has any. |
| `↺` badge | bottom left | The action **repeats** while the key is held. |

A key with a chamfer and no `↑` opens its submenu and does nothing else. A key
with both is an action-submenu: `Pan/Zoom...`, `Add...`, `Move by node...` —
tap to act, hold to open.

## Corners say nothing (2026-08-29, da-477)

Corner radius used to encode "this key also has an immediate action": rounded
for actions and action-submenus, square for pure submenus. Nobody read it —
including the person who designed the menu:

> I don't understand why some items in the key menu have rounded corners and
> some are squared off. For example, "Layout..." vs "Pan/Zoom..."

A 4px difference in radius is not a legible way to name a behaviour. Every card
now uses the same corner radius, and the distinction it was carrying moved onto
the `↑` badge, which action-submenus previously did not wear even though they
fire on release exactly like the keys that did. The badge moved to the bottom
left in the same change, so it cannot collide with the chamfer.

If a fourth thing ever needs saying on a card, give it a mark with a name — not
a shade, a radius, or a weight.
