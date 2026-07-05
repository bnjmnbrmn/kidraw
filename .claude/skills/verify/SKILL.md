---
name: verify
description: How to drive the running kidraw app for end-to-end verification (dev server + Playwright with real keyboard events).
---

# Verifying kidraw changes end-to-end

## Launch

```bash
npm start          # log server + ng serve at http://localhost:4200 (~40s first compile)
curl -s -o /dev/null -w '%{http_code}' http://localhost:4200   # poll for 200
```

`ng serve` hot-reloads on source edits (~5–10s); no restart needed between fix iterations.

## Drive (Playwright, repo already has @playwright/test)

Follow the pattern in `tools/playwright-screenshot.js` and `tools/repro-*.js`:

- Real key events via `page.keyboard.down/up` against `document.body` — the
  keymenu listens on document-level HostListeners. Vim profile is the default
  (`i` edit, `f` insert, `v` select, hjkl movement).
- Held-key chords: keydown trigger, wait ~250ms, keydown child, release child,
  release trigger.
- Load a sample graph: set `select.sample-graph-select` to e.g. `basic` and
  dispatch a bubbling `change` event.
- Inspect state: `window.ng.getComponent(document.querySelector('app-drawing-area'))`
  → `drawingLayer.getDANodes()/getDAEdges()/getSelectedDA*()`, node text via
  `n.label.text()`, crosshairs via `da.crosshairsLayer.crosshairsX()/Y()`.

## Gotchas (each cost a debugging round)

- **Teleporting the crosshairs** (setting `crosshairs.x/y` directly) bypasses
  the tween system; drain `da.tweens.forEach(t => t.finish()); da.tweens = []`
  first, or a stale finished tween will snap the position back on the next
  command that calls `finishTweens()`.
- **Mode probe:** use the keymenu's `keyMenu.currentMode.name` (component
  `app-keymenu`), NOT the header's `mode` chip — the chip goes stale after
  label-edit exits (see `notes/bug-header-mode-chip-stale.md`).
- **Exit label edit** with Escape, Escape (insert → vimNormal → normal).
- **Root `c` is Clear Selection**, not select. Select = tap `v`
  (additive MULTI_ITEM_SELECT; tap again on a selected item toggles it off).
- **Action keys auto-repeat instantly** (`initialRepeatDelayMs: 0`, 100ms
  interval): holding an action key ≥1 macrotask fires it at least twice.
  Keep synthetic holds short or expect repeats.
- **Edge hit points:** raw `getPathPoints()` control points often sit inside
  node boxes; interpolate along segments and pick a point clear of all node
  rects (and edge-label boxes) before probing "over an edge" behavior.
