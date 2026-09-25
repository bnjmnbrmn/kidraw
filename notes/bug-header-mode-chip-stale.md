---
title: Header mode chip goes stale after exiting label edit
type: bug
status: obsolete 2026-09-25
---

# Header mode chip goes stale after exiting label edit

The header's mode badge is only reset to `normal` by the
`exit-label-editing-mode` notification, but the drawing area emits that
notification **only from undo/redo** (`handleUndo`/`handleRedo`). The normal
exits — Escape–Escape and Shift+Enter — are handled keymenu-side: the keymenu
switches its own mode and emits the `EXIT_LABEL_EDIT_MODE` *command*, but
nothing updates `headerComponent.mode`. Result: after leaving label edit the
header still shows "LABEL EDIT" (or "labelEditVimNormal") while the keymenu
overlay correctly shows `normal`.

Repro: tap `i` over empty canvas (enters label edit), Escape twice, look at
the header badge vs. the keymenu overlay's mode caption.

Candidate fix: emit `exit-label-editing-mode` from the drawing area's
`exitLabelEditMode()` handler (it runs on every exit path since the keymenu
always sends the command). Check that `AppComponent`'s handler calling
`keymenuComponent.exitToNormalMode()` is idempotent when the keymenu already
switched itself.

Found 2026-07-05 while verifying the context-sensitive `i` key with a
Playwright harness that used the header chip as its mode probe.

## Obsolete 2026-09-25 (inferred, 2026-09-25)

The header no longer shows a mode badge: it was dropped in the header
redesign of 2026-08-31 (`9488060d`), and the mode now shows only as the
keymenu's caption, which does follow Escape–Escape and Shift+Enter. The
header's `mode` field was still being written but nothing displayed it, so it
was removed on 2026-09-25 rather than fixed. If Ben wants a mode badge back in
the header, it should read the keymenu's mode, not keep its own copy.
