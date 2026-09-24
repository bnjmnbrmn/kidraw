---
title: Centred menus, and whether ex mode stays
type: idea
status: open — direction set by Ben, design not started
---

# Centred menus, and whether ex mode stays

## What Ben said (Ben, 2026-09-24)

- He is not sure he likes having **ex mode**, at least as it is now. He wants
  menu and command systems that offer **more affordances**, meaning they show
  you what you can do rather than making you remember it.
- Soon he wants **more complex menus that pop up in the centre of the
  window, above the drawing area**. These are for things the keymenu can't hold:
  - exploring files in the **vault**
  - choosing particular **styles, or sets of styles**, because there is a
    limit to how many style options fit under `w`
  - setting the **file type** (the diagram type)
  - a **Save As** menu
  - the **main settings**, so they can be reached without the mouse
  - **search**, with a caveat: the main part of the drawing area has to stay
    visible, so this one probably sits **lower on the screen** than the others
- Navigation and selection will probably use **`ctrl-n` / `ctrl-p` and
  Enter**, maybe not exclusively, and maybe the menus should be more
  **modal**, the way editing the graph is.
- **New terminology** will be needed.

## What exists today (inferred, 2026-09-24, from the code)

- The ex line (`:w`, `:e`, `:o`, `:type`, …) is the only keyboard way into
  save, open, new and the diagram type. Save As, Export as zip and cycling the
  display lost their keys in the August menu cull. Their commands were retired
  on 2026-09-24 (see [`idea-retire-unsent-commands.md`](idea-retire-unsent-commands.md)),
  so a centred Save As menu is the natural way to bring them back.
- `/` search is a bottom-of-window input (`graph-search.ts`), which already
  fits Ben's "keep the drawing visible" constraint.
- Settings are a mouse-driven header panel.
- The nav popup (`nav-popup-model.ts`, `nav-popup-layout.ts`) is the nearest
  existing thing to a keyboard-driven list with a highlighted row. Its layout
  and viewport clamping could be a starting point, not a design.

## Open questions (inferred, 2026-09-24; none decided)

- **Terminology.** What these are called, as distinct from the keymenu
  (the key overlay), its submenus, and the nav popup. "Palette", "panel",
  "picker" and "dialog" each carry baggage from other tools.
- **Ex mode's fate.** Does it go away, stay as a power-user shortcut into the
  same menus (`:w` as a quick path to Save), or become one of them (a
  command palette with typed filtering)?
- **Modality.** What the keymenu shows while a centred menu is open, and
  whether the menu has a normal/insert split of its own (for example, typing
  filters the list, and `ctrl-n` / `ctrl-p` move).
- **Placement rule.** Most centred, search lower. Is that a per-menu
  property, or does a menu that needs the canvas visible declare it?

Related:
- [`discussion-interaction-surfaces.md`](discussion-interaction-surfaces.md):
  the May discussion of pick-from-a-set tasks the held chord doesn't fit
- [`idea-graph-management-ui.md`](idea-graph-management-ui.md)
- [`idea-quick-settings-panel.md`](idea-quick-settings-panel.md)
- [`idea-keymenu-discoverability.md`](idea-keymenu-discoverability.md)
