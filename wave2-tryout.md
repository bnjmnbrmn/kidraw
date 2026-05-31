# Wave-2 prototype tryout — 2026-05-30

Both wave-2 agents ran but both hit the same harness problem: their
sandbox blocked every git mutation (`git commit`, `git merge`, `git rebase`)
and every node binary (`npx ng build`, `npx ng test`, `node …`). They also
got spawned from an old commit (`2b041b1`, **55 commits behind** current main
at `900fc13`) rather than from main. So they each landed a working tree
full of code, on a stale base, uncommitted, unverified.

I rebased each one's net delta onto current main, resolved one drift conflict,
ran `npx ng build` and the test suite, and committed. The fresh branches you'll
actually try out are:

| Prototype | Branch | Worktree | Tests |
| :--- | :--- | :--- | :--- |
| Compact keymenu | `wave2-keymenu` | `.claude/worktrees/wave2-keymenu` | 154/154 |
| Incremental edge routing | `wave2-routing` | `.claude/worktrees/wave2-routing` | 152/152 |

Each new branch is exactly 1 commit ahead of main. The original agent worktrees
(`agent-ae35a6e506522bc9b`, `agent-a48d88c39be377565`) still exist with the
agent's uncommitted work and the stale base — kept around for forensic
reference, but **don't try to run them**; they won't build against the old base.

---

## Prototype 1 — Compact keymenu (which-key-style side panel)

**Worktree:** `.claude/worktrees/wave2-keymenu`
**Branch:** `wave2-keymenu`
**Commit:** `7bbdcfa` Wave-2 compact keymenu prototype (which-key style side panel)
**Design doc:** `notes/idea-keymenu-compact-view.md`

### What it does

When the compact view is on, the bottom-screen Konva virtual keyboard collapses
and a slim `<aside>` panel on the right side shows the same active-submenu
data as `key → label` rows. The panel updates as you navigate submenus —
breadcrumb at top (e.g. `normal › Insert › ...`), a row of currently-held
prefix keys, then the sorted bindings list (letters → digits → other).
Label-edit mode shows a placeholder instead of enumerating 50 letter rows.

Full keyboard view is the **default**; compact is **opt-in** so you can A/B
them directly.

### How to try it

```bash
cd /home/bnjmnbrmn/projects/kidraw/.claude/worktrees/wave2-keymenu
npx ng serve --port "$(tools/worktree-port.sh)"
```

The script prints the port. Then in the browser:

- `http://localhost:<port>/` — full keyboard view (default; same as main).
- `http://localhost:<port>/?compact=1` — compact side-panel view.
- `http://localhost:<port>/?compact=0` — explicit override back to full.

The choice persists in localStorage (`kidraw-compact-view`) once set without a
URL param. Toggle programmatically from the dev console:

```js
// in the dev tools console
const svc = ng.getOwningComponent(document.querySelector('app-keymenu'))?.keyboardConfig;
svc.compactView = !svc.compactView;
```

### What to look at

1. **Switch the URL param, reload, navigate the keymenu.** Hold `f` — both
   views should show the Insert submenu's bindings; compact shows them as a
   simple text list, full renders them on virtual keys.
2. **Mode label still works.** Tap CapsLock to enter `normalCaps`; both views
   should reflect the mode change.
3. **Held prefixes.** Hold `f` then `t` (or whatever chord); compact's
   "currently held" row should populate.
4. **Label-edit.** Activate label-edit mode (e.g. by hold-`f` + tap-`;`,
   land a label, type); compact should show a placeholder rather than 50 key
   rows.

### Verify with tests

```bash
cd /home/bnjmnbrmn/projects/kidraw/.claude/worktrees/wave2-keymenu
npx ng test --watch=false --browsers=ChromeHeadless
```

Expect **154/154**. (Was 152 on main; +2 specs added for the compact view —
visibility and key-row enumeration.)

### Open questions punted by the agent

- **Highlight-on-press animation** in the compact panel — not implemented;
  documented as future work.
- **Spatial grouping** by physical keyboard row — documented as future work.
- **Dwell-triggered overlay** (proposal 3 in the design doc) — not
  implemented; can be added on top of the same data without restructuring.

### If you like it → merge to main

```bash
git -C /home/bnjmnbrmn/projects/kidraw merge --no-ff wave2-keymenu
```

### If you don't like it → abandon

```bash
git -C /home/bnjmnbrmn/projects/kidraw worktree remove --force .claude/worktrees/wave2-keymenu
git -C /home/bnjmnbrmn/projects/kidraw branch -D wave2-keymenu
```

---

## Prototype 2 — Incremental edge routing (route one, freeze rest)

**Worktree:** `.claude/worktrees/wave2-routing`
**Branch:** `wave2-routing`
**Commit:** `694edaf` Wave-2 incremental edge routing prototype (route one edge, freeze rest)
**Design doc:** `notes/idea-incremental-edge-routing.md`

### What it does

Today the keymenu's Route Edges command always re-routes **every** edge in
the graph. That makes the whole picture jump when you add one edge to a
complex graph. The prototype adds a NEW entry point that routes just one
edge while the rest stay byte-equal to where they were:

```ts
applyBezierFitWeightedChainEdgesForOne(
  nodes, edges, targetEdge, fitOpts, wcOpts, log?
)
```

Under the hood, each non-target edge is sampled at `segmentLength` arc-length
spacing along its existing polyline, those samples become "frozen" beads in
the weighted-chain simulator (zero mass for force integration purposes — they
stay where they were sampled), and the target edge's live beads see them as
walls via the existing bead-bead repulsion law. Only `targetEdge.setControlPoints(...)`
is ever called; nothing else is mutated.

The existing all-edges router (`applyBezierFitWeightedChainEdges`) is
untouched — Route Edges still re-routes everything, as it did. The
incremental router is opt-in via the new function.

### How to try it

This prototype is **not wired into the production app yet** (per the
original spec — focus was on the primitive + verification, not UX). To
exercise it you run the verification driver:

```bash
cd /home/bnjmnbrmn/projects/kidraw/.claude/worktrees/wave2-routing
node tools/routing-eval/incremental-verify.mjs
```

What this does:
1. Constructs the `incremental-add` scenario (4 corners + center node;
   diagonals TL→BR and TR→BL, plus a 5th edge `C→BL`).
2. Full-routes the two diagonals with the existing all-edges router.
3. Snapshots the diagonals' control points.
4. Calls `applyBezierFitWeightedChainEdgesForOne` on the C→BL edge with
   the two diagonals as frozen siblings.
5. Asserts the diagonals' CPs are byte-equal to the pre-snapshot.
6. Reports any segment crossings between the target and frozen edges.
7. Writes `tools/routing-eval/incremental-verify-out/pre.svg` and
   `post.svg` for eyeballing the before/after.

Expected output: `PASS` lines for the frozen edges and a 2-CP target route,
and **one `WARN`** because the algorithm currently crosses TL→BR once at a
shallow angle. This is exactly the kind of issue flagged as a tunable in the
design doc — left as a follow-up.

Open the two SVGs side-by-side:

```bash
xdg-open tools/routing-eval/incremental-verify-out/pre.svg
xdg-open tools/routing-eval/incremental-verify-out/post.svg
```

(Or just `firefox`/`chromium` them.) Pre is the full-routed two diagonals;
post adds the incremental third edge without touching the diagonals.

### Verify with tests

```bash
cd /home/bnjmnbrmn/projects/kidraw/.claude/worktrees/wave2-routing
npx ng test --watch=false --browsers=ChromeHeadless
```

Expect **152/152** — same count as main, since the prototype's verification
is the standalone driver rather than a Karma spec (per the original spec).

### Open questions punted by the agent

- **Wiring into the keymenu / production app.** Out of scope per the spec.
  The natural next step is for `INSERT_EDGE` (or a follow-up command) to
  call `applyOne` on just the new edge instead of the all-edges router.
- **Sampling smoothed-render geometry vs raw polyline.** The agent samples
  `getPathPoints()` (the raw control-point polyline) rather than the
  Catmull-Rom-smoothed render curve, on the reasoning that the smoothed
  curve is render-only and skeleton collision is the right semantic.
- **The shallow crossing in the WARN.** Tuning the repulsion strength or
  adding a crossing-angle penalty as a follow-up may fix the one shallow
  crossing. Open question for the design doc to address.
- **Lane offset for parallel siblings with frozen members.** Kept simple
  for v1; documented as an open question in the design doc.

### If you like it → merge to main

```bash
git -C /home/bnjmnbrmn/projects/kidraw merge --no-ff wave2-routing
```

### If you don't like it → abandon

```bash
git -C /home/bnjmnbrmn/projects/kidraw worktree remove --force .claude/worktrees/wave2-routing
git -C /home/bnjmnbrmn/projects/kidraw branch -D wave2-routing
```

---

## What happened to the original agent worktrees

Both `.claude/worktrees/agent-ae35a6e506522bc9b/` (keymenu) and
`.claude/worktrees/agent-a48d88c39be377565/` (routing) are still on disk,
still locked, still pointing at `2b041b1`. The agent's uncommitted changes
are still in their working trees. The salvageable content was rebased into
the `wave2-*` branches described above; **nothing in the wave-2 prototypes
came from anywhere but the agents' own work**.

If you want to clean up after deciding what to do with each prototype:

```bash
# Remove the salvaged branch's worktree (whether you merged or not).
git -C /home/bnjmnbrmn/projects/kidraw worktree remove --force .claude/worktrees/agent-ae35a6e506522bc9b
git -C /home/bnjmnbrmn/projects/kidraw branch -D worktree-agent-ae35a6e506522bc9b
git -C /home/bnjmnbrmn/projects/kidraw worktree remove --force .claude/worktrees/agent-a48d88c39be377565
git -C /home/bnjmnbrmn/projects/kidraw branch -D worktree-agent-a48d88c39be377565
```

---

## Process notes (for a future me)

Two failure modes worth knowing about:

1. **The agent harness blocked all git mutations.** Both agents could read
   git state but couldn't `commit`, `merge`, `rebase`, or even run `node`
   or `npx`. They had to write their report by inspection rather than by
   actually building/testing. The `.claude/settings.local.json` permissions
   from the kidraw repo only apply when the parent session is *itself*
   running from kidraw; this parent session was running from
   `/home/bnjmnbrmn/projects/` so its sub-agents inherited the parent's
   (more restrictive) permissions.
2. **The auto-created worktree base was stale.** The Agent-tool's
   `isolation: "worktree"` made each worktree at `2b041b1` (May 23, 55
   commits behind current main on May 25). Branch naming
   `worktree-agent-<id>` suggests the harness reused a leftover branch
   from the previous overnight session rather than branching from main.
   In future, explicitly point the agent at the current main commit in the
   prompt, or move the parent session into the kidraw directory before
   spawning so it picks up the project's settings + the right default
   branch.
