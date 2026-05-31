# Wave-1 prototype tryout — 2026-05-27

Two completed worktrees from the overnight run, neither merged. Both rebuilt off
`main` at `900fc13`. The harness's per-worktree port script gives each one its
own port automatically, so you can have both dev servers running side by side
in two terminals if you want to A/B them.

If a `node_modules` symlink isn't already present in the worktree, the first
`npx ng serve` will be slow; that's normal — Angular is just first-touching the
compiler cache. Both worktrees share the parent repo's `node_modules` via the
git-worktree hardlink, so you should not need to re-`npm install`.

---

## Prototype 1 — Edge labels (anchored, persistent)

**Worktree:** `.claude/worktrees/agent-a63b2b668683dc431`
**Branch:** `worktree-agent-a63b2b668683dc431`
**Design doc:** `notes/idea-edge-labels.md` in that worktree
**4 commits** (oldest → newest):

- `311a840` Design: edge labels (`idea-edge-labels.md`)
- `3b1da5f` Anchor edge labels to the polyline so they ride re-routes
- `f39766b` Persist label anchors through snapshot + file format
- `f01417a` Test: edge label anchoring + file-format round-trip

### What changed (in plain English)

Today's `ADD_LABEL` would drop a label at an absolute `(x, y)` and that label
stayed put when the edge re-routed (e.g. after dragging a node). The prototype
gives each label an **anchor**: a fractional position `t ∈ [0, 1]` along the
polyline's arc length plus a signed perpendicular `offset`. Whenever the edge
re-routes, the label is re-projected onto the new polyline at the same `t` and
the same offset — so it follows the curve. The anchor is persisted in the
file format (new `{t, offset, dx, dy}` shape on `labelOffsets`); the legacy
`{dx, dy}` shape is still read back, so old saves still load.

### How to try it

```bash
cd /home/bnjmnbrmn/projects/kidraw/.claude/worktrees/agent-a63b2b668683dc431
npx ng serve --port "$(tools/worktree-port.sh)"
```

The script prints the port. Open `http://localhost:<port>/` in a browser.

**Test sequence** (vim profile is the default):

1. **Build a tiny graph.** Hold `f` (insert submenu), then tap `d` (node) — a
   box appears. Move the crosshair with `h/j/k/l` to a new spot. Hold `f`
   again, tap `l` (edge), then a direction key (e.g. `l` if the new node is to
   the right of the first) to connect.
2. **Add a label.** Select the edge (one way: tap `c` to clear selection, then
   click on the edge in the canvas, or use whichever selection flow you prefer).
   With the edge selected, hold `f`, tap `;` (the `insert.label` key). A label
   placeholder appears at the edge midpoint and label-edit mode opens; type
   some text and double-Shift back out.
3. **The actual test — drag a node.** Select either endpoint, enter drag mode
   (hold `v`, direction keys), and move it somewhere that forces the edge to
   re-route through a different shape. **Watch the label.** Before this change
   it would stay at its old screen position, marooned away from the edge. With
   the anchor, it should ride the new midpoint of the new polyline.
4. **Save + reload to confirm persistence.** Use the misc submenu (hold `m`)
   to save the graph to a file, refresh the browser, and load it back. The
   label should still be anchored — drag a node again to confirm the anchor
   survived the round trip.

### How to verify with tests instead of the UI

```bash
cd /home/bnjmnbrmn/projects/kidraw/.claude/worktrees/agent-a63b2b668683dc431
npx ng test --watch=false --browsers=ChromeHeadless
```

Expect a clean run. Two relevant specs: `drawing-area.unit.spec.ts` (anchor
math + the "drag a node, label follows" integration test) and
`snapshot-mapping.spec.ts` (round-trip both label-offset shapes).

### If you like it → merge to main

From the repo root:

```bash
git -C /home/bnjmnbrmn/projects/kidraw merge --no-ff worktree-agent-a63b2b668683dc431
```

### If you don't like it → abandon

```bash
git -C /home/bnjmnbrmn/projects/kidraw worktree remove --force .claude/worktrees/agent-a63b2b668683dc431
git -C /home/bnjmnbrmn/projects/kidraw branch -D worktree-agent-a63b2b668683dc431
```

(The worktree is `locked`; the `--force` is what un-locks-and-removes it.)

---

## Prototype 2 — Keymenu modes: hybrid held + sticky

**Worktree:** `.claude/worktrees/agent-a622f853861ee616e`
**Branch:** `worktree-agent-a622f853861ee616e`
**Design doc:** `notes/idea-keymenu-mode-organization.md` in that worktree
**3 commits** (oldest → newest):

- `ce68c0a` Propose held-vs-sticky-mode reorg for the keymenu (idea note)
- `17800a5` Prototype sticky-insert mode (Proposal B)
- `8fd60d6` Prototype spatial Style page (Proposal C, narrow surface)

### What changed (in plain English)

Today every submenu is a *held-key* submenu: hold `f`, see Insert; release `f`,
exit. The proposal explored four reorgs (A pure-sticky-modes, B hybrid, C
spatial pages, D emacs chords) and recommended **B**: keep the held-key submenu
for short tasks (style, layout, pan/zoom, etc.) and add **sticky** behaviour to
the genuinely-sustained ones (Insert, eventually Drag). The same trigger key
serves both: **hold** = legacy submenu, **tap** = sticky mode.

The prototype actually wires two of these up:

- **Sticky `insertMode`** — tap-`f` (no hold) enters a sticky mode. Movement
  keys still drive the crosshair; node-shape leaves drop a node and **stay in
  mode**. Re-tap `f` / Esc / double-Shift to exit. The mode label reads
  **"INSERT (sticky)"** in violet so you can tell where you are.
- **Spatial Style page** — tap-`w` (no hold) flips to a flat color picker
  (Red/Blue/Green/Orange/Purple/Default on their letter keys). Tap a color,
  it applies, you go back to `normal` automatically. Mode label:
  **"STYLE (page) — pick a color, return"** in pink.

Holding `f`/`w` still does the legacy thing. Nothing about the other submenus
changed.

### How to try it

```bash
cd /home/bnjmnbrmn/projects/kidraw/.claude/worktrees/agent-a622f853861ee616e
npx ng serve --port "$(tools/worktree-port.sh)"
```

(Different worktree → different port from prototype 1, so they can run at the
same time.)

**Test sequence — sticky insert:**

1. **Tap** `f` (don't hold). The mode label should switch to "INSERT (sticky)"
   in violet. The visual keyboard updates to show the insert submenu at the
   root.
2. While in sticky-insert: `h/j/k/l` still move the crosshair. Tap a node-shape
   leaf (e.g. `d`) → node appears, mode stays in sticky-insert. Move, drop
   another. Build a row of nodes without ever holding a key.
3. Exit with Esc, or re-tap `f`, or double-Shift.
4. **Confirm legacy still works:** hold-`f` then a direction key (the
   create-and-drag-and-then-labelEdit flow) — should behave exactly as before
   because any *held* action clears the tap-pending state before the keyup.

**Test sequence — Style page:**

1. Select a node first (so there's something to color).
2. **Tap** `w` (don't hold). Mode label should switch to "STYLE (page) — pick
   a color, return" in pink.
3. Tap a color letter (e.g. `r` for red). It applies and you return to normal
   automatically.
4. **Confirm legacy:** hold-`w` then a leaf — opens the nested style submenu
   as before.

A pre-baked keystroke probe is committed in the worktree:

```bash
node tools/playwright-screenshot.js --keys "f d j j j j j j j d j j j j j j d l l l l l l l l l d Escape"
```

That builds a small graph using only **taps** (no holds) on `f`, demonstrating
the sticky-insert flow end-to-end. Output goes to `tools/screenshots/`.

### How to verify with tests

```bash
cd /home/bnjmnbrmn/projects/kidraw/.claude/worktrees/agent-a622f853861ee616e
npx ng test --watch=false --browsers=ChromeHeadless
```

Should be 154/154 (was 152 on main; +1 spec per prototype).

### If you like it → merge to main

```bash
git -C /home/bnjmnbrmn/projects/kidraw merge --no-ff worktree-agent-a622f853861ee616e
```

### If you don't like it → abandon

```bash
git -C /home/bnjmnbrmn/projects/kidraw worktree remove --force .claude/worktrees/agent-a622f853861ee616e
git -C /home/bnjmnbrmn/projects/kidraw branch -D worktree-agent-a622f853861ee616e
```

---

## Open questions for the rating

You said you "haven't yet had a chance to do the rating" — so as you try
these, the things the prototypes deliberately punted on (and that need your
call before they're production-ready):

**Edge labels:**
- 3x3 picker UI for `(along, side)` is punted; v1 just drops at center, you
  drag from there.
- "On-line" rendering uses a background `Rect` matched to layer bg; we did
  *not* slice the underlying Konva.Arrow's `points()`. Looks fine in practice,
  but examine on dense crossings.
- Routing doesn't yet *avoid* labels — labels move WITH the edge but aren't
  treated as obstacles for other edges.

**Keymenu modes:**
- Sticky `dragMode` for `v` was deferred (Proposal B follow-up). Held-`v` is
  short enough in practice that the pattern is proven on insert and we don't
  need to do drag in the same change.
- The Style page is a narrow slice (one color picker). The full Proposal C
  would also expose a flat Shape page, Directedness page, Line-style page,
  with letter keys re-assigned — that's interface churn we punted.

---

## Wave-2 status (separate from these prototypes)

Wave-2 ran while you were out, hit harness problems, and I rebased the
salvageable work onto fresh branches. See **`wave2-tryout.md`** for the full
write-up. The two wave-2 prototypes are:

- **Compact keymenu** (which-key-style side panel) — branch `wave2-keymenu`,
  worktree `.claude/worktrees/wave2-keymenu`, 154/154 tests.
- **Incremental edge routing** (route one edge, freeze rest) — branch
  `wave2-routing`, worktree `.claude/worktrees/wave2-routing`, 152/152 tests
  plus a verification driver that PASSes with one shallow-crossing WARN.
