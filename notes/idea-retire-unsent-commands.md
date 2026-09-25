---
title: 31 commands no key sends
type: idea
status: done 2026-09-24 — all 31 retired (Ben's call)
---

# 31 commands no key sends

> **Done (Ben, 2026-09-24): retire them all**, with a note that **Gather**
> should come back soon: the first version "didn't quite get it right"
> (see [`idea-gather-recursive.md`](idea-gather-recursive.md)). Retired in six
> commits on `refactor/readability` (`cf87eb94` Gather, `23f47883` steering,
> `322156ce` style, `9bab9a7f` file/menu/structure, `fd28d016` TRAVERSE_SMART).
> `drawing-area.component.ts` went from 3,965 to 3,374 lines. Features that
> left with no other way in: opening a file from disk (zip import too),
> downloading one, exporting a zip, cycling displays, routing one selected
> edge. Save As and the others are candidates for the centered menus
> ([`idea-center-menus.md`](idea-center-menus.md)); `lib/file-format/zip-bundle`
> was kept for that.

Of the 125 `DACommandType` kinds, 31 are sent by nothing in the app — not the
keymenu, the header, the shell, the ex line or the agent. Their handlers are
reachable only from specs and browser scripts, which call `handleCommand`
directly (inferred, 2026-09-24 — a search of `src/app` for each kind outside
its handlers, specs and the model, then `git log -S` for when its sender went;
the ex line and the agent call methods directly and were checked too).

Most lost their key on purpose in the August menu culls, and the handlers
simply stayed. Retiring a command removes its handler and whatever only it
reaches, which is the cheapest way to shrink the drawing area further. None
was removed overnight: which of these features come back on a key is a
product decision.

## Unbound on purpose, handler left behind

| Command(s) | Unbound by | What it would free |
|---|---|---|
| `GATHER_CONNECTED_NODES`, `UNGATHER` | da-529, `fa4e4a1f` (2026-08-29) | `gather-controller.ts` (~700 lines; nothing else calls it) — dev-status already has this as Ben's call |
| `EDIT_SELECTED`, `OPEN_FILE`, `SAVE_FILE_AS`, `EXPORT_ZIP`, `CYCLE_DISPLAY`, `SET_DIAGRAM_TYPE`, `APPLY_EDGE_ROUTING` | "Menu cull: Layout, File, Select+Drag…", `85b8dc53` (2026-08-29) | the ex line covers save (`:w`), open (`:e`, `:o`), new and `:type`; export as zip, save as and cycling the display have no other way in; `handleEditSelected` (~50); routing a selection |
| `TOGGLE_NODE_SHAPE` | `cc9b776a` (2026-08-28) | the "temporary" Circle/Box toggle and its default-shape flip |
| `SET_EDGE_DIRECTEDNESS` | `78944a54` (2026-08-28) | a setter (`v` then `o` cycles instead) |
| `SET_DEFAULT_EDGE_DIRECTEDNESS`, `SET_DEFAULT_LINE_STYLE` | `719b7a8c` (2026-08-28) | changing the direction and line style new edges start with |
| `DELETE` | da-272, `0cdf651a` (2026-08-26): `x` became Cut | nothing — Cut deletes through the same code |

## Replaced by another gesture

- **`TRAVERSE_SMART`** — root `f` became Move by Link (`d4efde83`,
  2026-08-03). The nav popup's navigation mode (`traverseSmart`,
  `openNavPopup`, walk mode, `navCommitTo`, ~250 lines) is reachable only by
  tests; the popup itself stays, for grow mode's target and type popups.
  `tools/qa/nav-popup/nav-popup.js` still drives it with `f`, which is why it
  passes 6 of 37.
- **`CONNECT_SELECTED_NODES`** — grow mode connects existing nodes (ledger
  row 7 in `design-add-insert-model.md`); only `labels/connect-focus.js`
  sends it, to draw a link to test the landing.

## No sender found

History under today's paths (`keymenu/`, `lib/`, `header/`,
`app.component.ts`) shows none; they may have had one before a file moved.

- Steering: `STEER_FORWARD`, `STEER_BACKWARD`, `STRAFE_LEFT`, `STRAFE_RIGHT`,
  `ROTATE_HEADING_LEFT`, `ROTATE_HEADING_RIGHT`, `INCREASE_MOVE_SPEED`,
  `DECREASE_MOVE_SPEED` — with the heading state behind them.
- `SNAP_TO_NEAREST_NODE` (`snapToNearestNode`, ~30 lines).
- Sizes: `INCREASE_`/`DECREASE_SELECTED_NODE_SIZE`,
  `INCREASE_`/`DECREASE_SELECTED_TEXT_SIZE` — node and text size have no
  keys at all. Their code was fixed on 2026-09-24 (`2297de2b`: the node-size
  pair acted on the node underneath where nodes overlap) without anyone being
  able to press them.
- `OPEN_INSERT_SUBMENU` (no handler either: the "stranded" kind),
  `SAVE_GRAPH_AS`.

## If some go

Retire them the way `SINGLE_ITEM_TOGGLE_SELECT` went on 2026-09-23: the kind,
its handler, what only it reached, and the browser checks that drive it
(`nav-popup.js`, `gather-fisheye.js`, parts of `style/style-commands.js`,
`connect-focus.js`'s setup), each in its own commit.
