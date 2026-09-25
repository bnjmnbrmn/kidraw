---
title: A list of interaction modes on the drawing area
type: idea
status: built 2026-09-24 (Ben: "go ahead and build this")
---

# A list of interaction modes on the drawing area

> **Built (Ben, 2026-09-24: "go ahead and build this").** `interaction-modes.ts`
> holds the list: grow, Move by Link, area select, and Move by Node's held
> session. A mode starting cancels the one that is on; a load, a sample and
> an undo or redo cancel whatever is on; raw keys go to the active mode.
> Checked by `tools/qa/selection/interaction-modes.js` (it errors on the old
> code) and `interaction-modes.spec.ts`.
>
> The two open questions below were settled by the agent building it
> (inferred, 2026-09-24), and are Ben's to overturn:
> - **Held-chord modes keep their keymenu commands.** The list tracks and
>   cancels them but does not route their commands. Moving them to raw keys
>   would duplicate what the keymenu does for them (display, profiles).
> - **Text editing is not a mode here.** It has its own vim sub-modes and
>   a much larger surface.
> - Also: the interface has no `surface` field yet. Grow changes its surface
>   several times within one hold, so a single field did not fit; it still
>   reports surfaces through `popup-state`. The resize handle stays out: it is
>   a hover affordance that captures a drag, not a mode of its own.

## The question (Ben, 2026-09-24)

Would it make sense for the drawing-area component to have a list of
"overlays" for things like grow mode and Move by Node or Move by Link
navigation? Maybe that is how it already works.

## What exists (inferred, 2026-09-24, from the code)

Half of it does.

- **The visuals share a lifecycle.** `overlay.ts` gives the transient Konva
  decorations one show/clear contract: the hover trace, the label-edit lens,
  the landing ghost, the goal line, and (inside their controllers) the grow
  ghost and the Move by Link quadrant lines. That settled which layer each one
  repaints; it says nothing about who owns the keyboard.
- **The modes are separate controllers, wired by hand.** Grow
  (`grow-controller.ts`), Move by Link (`link-nav-controller.ts`), Move by
  Node (`navigation-grid-controller.ts`), area select (`area-select.ts`) and
  the resize handle (`resizeTargetNode`, still in the component) each hold an
  "am I on" flag. The component asks each one in the places that care:
  `dragKey` checks area select and then the resize handle, Move by Node's host
  asks whether grow is active, and exit paths clear each one separately.
- **Keyboard ownership works two ways.** Some modes are held keymenu chords
  and get their keys as commands (Move by Link, Move by Node). Others suspend
  the keymenu and take raw keys through document listeners (grow, the agent
  panel, reading). The `KeyboardSurface` union and `popup-state` notification
  carry that second kind to the keymenu, which shows the surface's keys.
- Nothing enforces that only one mode is on at a time. It holds today because
  the entry gestures happen not to overlap.

## A proposal (inferred, 2026-09-24; Ben's call)

One list of modes, at most one active, each implementing a small interface:

```ts
interface InteractionMode {
  readonly surface: KeyboardSurface | null; // what the keymenu shows, if it steps aside
  readonly active: boolean;
  keyDown?(event: KeyboardEvent): boolean;  // true = handled
  keyUp?(event: KeyboardEvent): boolean;
  cancel(): void;                           // Esc, a load, undo, another mode starting
}
```

What it would buy:
- **The component stops asking.** Key routing, "is anything in progress?"
  and "cancel whatever it is" each become one loop over the list, instead of
  a check per mode at each site.
- **One-at-a-time becomes a rule.** Starting a mode cancels the active one,
  instead of relying on gestures not overlapping.
- **A place for what is coming.** The centered menus Ben wants
  ([`idea-center-menus.md`](idea-center-menus.md)) are another keyboard owner
  with a surface, and would slot in as a mode rather than as a new special case.
  Plugins may want to contribute one too ([`design-plugins.md`](design-plugins.md)).

What to decide first:
- Whether the held-chord modes (Move by Link, Move by Node) move to raw keys
  like grow did, or keep arriving as keymenu commands with the list only
  tracking which one is active.
- Whether text editing counts as a mode. It owns the keyboard but has its own
  vim sub-modes and a much larger surface, so it may be better left out.

Related: [`architecture-mode-hierarchy.md`](architecture-mode-hierarchy.md)
(the keymenu's four modes, which are a different axis),
[`discussion-interaction-surfaces.md`](discussion-interaction-surfaces.md).
