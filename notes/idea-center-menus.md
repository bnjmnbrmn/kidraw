---
title: Centered menus, and whether ex mode stays
type: idea
status: first version built 2026-09-25 (Open, Save As, Diagram Type); settings, styles, search not yet
---

# Centered menus, and whether ex mode stays

## Built, first version (2026-09-25)

Ben asked for the ranked list to be worked through and for best guesses on
design (Ben, 2026-09-25: "Make your best guess for design decisions — we will
come back and refine"). Every call below is **inferred, 2026-09-25**, and his
to overturn.

What you see: **File → Open…** and **File → Save As…** no longer use the
browser's prompt box. They open a list in the middle of the window, with a
field at the top. **File → Diagram Type…** (`q` then `y`) is new, and `:type`
on its own opens the same list.

- **Name: "center menu".** Ben's own words ("menus that pop up in the
  center"). Plain, and it names where the thing is, which the keymenu and the
  nav popup don't. Code: `src/app/center-menu/`.
- **Keys.** Typing filters (the same fuzzy matcher as the nav popup). Down /
  Up, Ctrl-J / Ctrl-K, and Ctrl-N / Ctrl-P where the browser passes them on
  (Chrome keeps Ctrl-N for itself) move. Enter chooses, Escape or Ctrl-[
  closes, Tab copies the highlighted row into the field. The mouse works too.
- **Modality: no normal/insert split.** The field always has the keyboard;
  there is nothing to type that isn't a filter or a name. The keymenu stands
  aside while a menu is open, flushes the key you held to open it, and shows
  the menu's keys with the caption "menu".
- **Save As is a text menu.** The field starts with the current file's name,
  selected. Enter saves under what is typed, unless you have moved onto one of
  the listed files, which means "replace that one". Tab puts a file's name in
  the field to edit it.
- **Placement is a per-menu property** (`placement: 'lower'`), for search.
  Search itself has not moved; it is still the bottom input.
- **Ex mode stays** for now, as the typed path into the same menus (`:type`
  opens the menu; `:w name` still saves without one).
- **Not a gesture** (`gestures.ts`). Gestures belong to the drawing area; a
  center menu belongs to the whole window and opens from the keymenu or the ex
  line, never mid-gesture. The keymenu's suspension is what keeps other keys
  out.
- **Not yet:** the settings menu, style sets, the vault as a browsable tree
  (Open lists every graph file by path), and moving search into one.

Checks: `center-menu.model.spec.ts` (list behavior),
`tools/qa/file/center-menus.js` (the three menus in the running app).


## What Ben said (Ben, 2026-09-24)

- He is not sure he likes having **ex mode**, at least as it is now. He wants
  menu and command systems that offer **more affordances**, meaning they show
  you what you can do rather than making you remember it.
- Soon he wants **more complex menus that pop up in the center of the
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
  so a centered Save As menu is the natural way to bring them back.
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
- **Modality.** What the keymenu shows while a centered menu is open, and
  whether the menu has a normal/insert split of its own (for example, typing
  filters the list, and `ctrl-n` / `ctrl-p` move).
- **Placement rule.** Most centered, search lower. Is that a per-menu
  property, or does a menu that needs the canvas visible declare it?

Related:
- [`discussion-interaction-surfaces.md`](discussion-interaction-surfaces.md):
  the May discussion of pick-from-a-set tasks the held chord doesn't fit
- [`idea-graph-management-ui.md`](idea-graph-management-ui.md)
- [`idea-quick-settings-panel.md`](idea-quick-settings-panel.md)
- [`idea-keymenu-discoverability.md`](idea-keymenu-discoverability.md)
