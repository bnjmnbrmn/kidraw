---
title: Edge labels — positions, anchoring, routing impact
type: idea
---

# Edge labels — positions, anchoring, routing impact

Today's state ([as of 2026-05-26](dev-status.md)): there *is* an `ADD_LABEL`
command, a `DALabel` class with a transparent-by-default rectangle frame, an
`addLabel()` on `DAEdge`, label editing via the existing label-edit mode, and a
"slide label along edge" helper. The serialization round-trips a `text` per
label and an absolute `(dx, dy)` per label as `labelOffsets`. What is missing
and what this note designs:

1. Labels are stored as **absolute world coordinates** on the edge. They do
   *not* re-position when the edge re-routes (e.g. when bf-wc runs after a node
   drag). The slide-along-edge helper only moves a label *along* its current
   nearest segment — it does not re-anchor when the polyline geometry under it
   changes.
2. There is no notion of **above / on / below** the line.
3. There is no notion of **center / src-end / dest-end** position.
4. The label is always a Konva `Text` inside a (transparent) `Rect`. There is
   no rotation. The text is always horizontal regardless of edge tangent.
5. Routing (`bezier-fit-weighted-chain-edges.ts`) and the metrics
   (`edge-routing-metrics.ts`) know nothing about labels. They never appear in
   the routing-eval harness because the harness routes pure-fn edges, no
   labels.

Related notes — read these first; this note builds on them, does not duplicate:

- [decision-interaction-model](decision-interaction-model.md) — waypoints vs
  labels: a label is a "text annotation positioned along an edge"; the open
  question "edge label positioning algorithm (currently simple; can be richer)"
  is what this note answers.
- [idea-label-no-default-box](idea-label-no-default-box.md) — boxless by
  default. Already shipped (the `Rect` is transparent unless selected).
- [idea-label-edit-overhaul](idea-label-edit-overhaul.md) — editing UX is its
  own thread; this note assumes whatever overhaul ships eventually still emits
  the same "set label text" mutation.
- [idea-rich-text](idea-rich-text.md) — markdown/math in label text is
  orthogonal; assume plain string for now, but data model leaves room.
- [idea-richer-edges](idea-richer-edges.md) — parallel edges and self-loops
  affect *which polyline a label anchors to*, but the anchor model is the
  same.

---

## 1. The position matrix

The user phrased it as "center or ends (above or below or on the line)". This
naturally factors into two independent axes:

```
                along-axis (anchor)
                 ┌──────────┬──────────┬──────────┐
                 │  src-end │  center  │ dest-end │
across-axis      ├──────────┼──────────┼──────────┤
(side)  above    │   ▲      │    ▲     │    ▲     │
                 ├──────────┼──────────┼──────────┤
        on       │  ━━━━━   │  ━━━━━   │  ━━━━━   │
                 ├──────────┼──────────┼──────────┤
        below    │   ▼      │    ▼     │    ▼     │
                 └──────────┴──────────┴──────────┘
```

9 combinations. Each combination is a pair `(along, side)`:

- **`along`** ∈ {`src-end`, `center`, `dest-end`} — discrete enum *for v1*; a
  continuous `t ∈ [0, 1]` (fraction of polyline arc length) generalises later.
- **`side`** ∈ {`above`, `on-line`, `below`} — text is offset perpendicular to
  the local edge tangent by `+gap`, `0`, or `-gap` pixels where `gap` is half
  the text bbox height plus a small margin.

### What "above" means on a bent polyline

Pick a "canonical normal" so the label is on a consistent side as the user
rotates the diagram. Two reasonable conventions; **we adopt convention B**:

- **A (text-relative):** "above" = perpendicular to the tangent, in the
  direction that makes the text read left-to-right normally. Fragile on
  vertical edges (above means... left? right?).
- **B (world-relative):** "above" = the side whose perpendicular has a
  negative `y`-component (in Konva, smaller-y is up the screen). On a perfectly
  vertical edge we tie-break to the side with negative `x` (the "left" side of
  the screen). This is what users mean colloquially in left-to-right reading
  cultures; works the same for horizontal, diagonal, and vertical edges.

For the user-as-author the contract is: pressing "label above" puts the label
above the line in screen space, not in path-parameter space.

### "On-line" semantics

`on-line` does NOT mean text-on-path (curved baseline). Konva can't render
that cleanly without slicing the string into per-glyph rotated Texts, and we
explicitly punted that as out of scope. `on-line` means: the text bbox is
centered on the polyline tangent point, so the line visually passes *through*
the middle of the text. To keep the line from drawing over the glyphs, we
clear a small bbox-shaped hole in the underlying stroke — either by:

- drawing a transparent-fill background `Rect` behind the `Text` with size =
  text bbox + 4px margin (currently this is the default `Rect` shape, so we
  just turn its `fill` on with the layer background color for this case), or
- splitting the underlying Konva.Arrow's `points()` so the segment under the
  label is omitted. Pricier; punt to a follow-up.

v1 picks the first (background `Rect` matched to layer bg).

### What about rotation?

Two options:

- **R-horizontal:** label text always horizontal regardless of edge angle.
  Users almost always want this; it's how Graphviz, draw.io, mermaid render.
- **R-tangent:** label text follows the edge tangent (parallel to the line).
  Useful for tight diagrams; doesn't make sense for `on-line` (you'd read
  the text vertically on a vertical edge).

**v1: always horizontal.** Add a per-label `rotation: 'horizontal' | 'tangent'`
field reserved in the data model, default `'horizontal'`. v2 (or just a tag
style) flips it.

---

## 2. Data model

### Runtime (DALabel + DAEdge)

Replace today's absolute `(x, y)` storage with a path-anchored model.
Per-label fields:

```ts
interface DALabelAnchor {
  // Position along the edge's polyline, as a fraction of total arc length.
  // 0 = src endpoint, 1 = dest endpoint, 0.5 = midpoint. Re-evaluated every
  // time the edge re-routes.
  t: number;

  // Perpendicular offset in pixels (Konva layer coords). Signed; positive =
  // "above" by convention B. Routers don't touch this.
  offset: number;
}

interface DALabel {
  id: string;
  text: string;
  fontSize: number;
  anchor: DALabelAnchor;
  rotation?: 'horizontal' | 'tangent';  // default 'horizontal'
  // The triple (along-bucket, side-bucket, free) is derived from anchor.t,
  // anchor.offset, and the fontSize; not stored. See "Snapping" below.
}
```

Why fractional `t` not segment-index-plus-segment-t? Because re-routing can
add, remove, and reshape segments arbitrarily. Arc-length fraction is the
only path-relative parameterisation that survives a re-route gracefully (a
label at "60% of the way" stays at "60% of the way" regardless of how many
beads the router decides to insert).

### Snapping (along axis)

The user said "center or ends." Internally we store free `t ∈ [0, 1]`, but
the **add-label command places `t` at one of three buckets**:

- `src-end`   → `t ≈ 0.10` (10% in from the src endpoint — not 0% because we
  don't want the arrowhead clip)
- `center`    → `t = 0.50`
- `dest-end`  → `t ≈ 0.90`

The "drag a label along the edge" interaction snaps to the nearest bucket
when within a tolerance (say 8% of total arc length) and otherwise leaves `t`
free. Means: the user can place a label exactly mid-edge with a key, then
fine-tune by dragging if needed.

### Snapping (side axis)

Same idea for `offset`:

- `above`    → `offset =  +(label.height / 2 + 4px)`
- `on-line`  → `offset = 0`
- `below`    → `offset = −(label.height / 2 + 4px)`

User-controlled overrides allowed; drag snaps to the nearest bucket within
tolerance.

### Multiple labels per edge

The file format already supports `labels: EdgeLabel[]`. The runtime already
has `DAEdge._labels: DALabel[]`. So multiple labels per edge are already a
thing in storage — we just haven't designed the conflict-avoidance for
overlapping anchors. **v1 punt: no conflict avoidance. If the user puts two
labels at `center / above` they will overlap.** v2: stack them vertically by
order, or auto-rebucket to fill empty positions.

### File format

`EdgeSemantics.labels` is already an array of `{ text }`. Extend that with a
position hint that is conservative about cross-tool compatibility:

```ts
interface EdgeLabel {
  text: string;
  // Semantics: where along the edge does this label belong? Three buckets,
  // or "free" if the user dragged the label off a bucket. Default "center".
  along?: 'src-end' | 'center' | 'dest-end' | 'free';
  side?:  'above'   | 'on-line' | 'below'   | 'free';
}
```

`EdgeStyleProps.labelOffsets` keeps its parallel-array shape but its meaning
changes from "absolute world coords" to "the anchor's exact `t` and pixel
offset, when along/side are `'free'` (or always, as the precise position
hint)":

```ts
interface EdgeStyleProps {
  // ...existing fields
  // Parallel to EdgeSemantics.labels[]. Per label, the precise anchor on the
  // edge's polyline: t in [0,1] (arc-length fraction), offset in px.
  // The graph doc's along/side hint takes precedence if the renderer prefers
  // semantic placement; otherwise these are authoritative.
  labelOffsets?: { t: number; offset: number }[];
}
```

**Backwards compatibility.** Old files have `labelOffsets: { dx, dy }[]`.
On load: if `dx`/`dy` are present (not `t`/`offset`), treat them as absolute
world coords and project onto the edge polyline to derive `t` and `offset`.
Save in the new shape. The serialization tests cover the round-trip.

### Open question — bake or re-derive?

When a label snapped to `'src-end' / 'above'` gets saved: do we write
`{ along: 'src-end', side: 'above' }` and let the loader re-derive `t` =
0.10 / `offset` = +half-height-plus-margin? Or do we write both? Both is
safer (loaders that don't know `along/side` still position correctly).

---

## 3. Rendering

### Position computation

```
renderLabel(label, edge):
  polyline = edge.getPathPoints()             // [{x,y}, ...]
  arcLen   = sum of segment lengths
  target   = label.anchor.t * arcLen
  walk segments; find segment i and local t within it where accumLen == target
  basePt   = lerp(polyline[i], polyline[i+1], localT)
  tangent  = normalize(polyline[i+1] - polyline[i])
  normal   = perpendicular(tangent) chosen by convention B (see §1)
  pos      = basePt + normal * label.anchor.offset
  label.konvaGroup.position(pos)
  if label.rotation == 'tangent':
    rot = atan2(tangent.y, tangent.x)  (mod 180 so text isn't upside down)
    label.konvaGroup.rotation(rot * 180 / PI)
  else:
    label.konvaGroup.rotation(0)
```

For smooth-rendered edges (`tension > 0` Catmull-Rom), `getPathPoints()`
still returns the control polygon, not the rendered curve. The label rides
the *control polygon*, not the visual curve. For tension = 0.5 the divergence
is ≤ ~10% of segment length; acceptable for v1. Document as known issue;
fixable later by sampling the curve.

### Konva structure

`DALabel` already has a Konva.Group with a Rect and a Text. We:

1. Make `position` setter idempotent and driven only by
   `applyAnchorFromEdge(edge)`.
2. Add `applyAnchorFromEdge(edge)` to recompute and apply position from
   `anchor` against the edge's current `getPathPoints()`.
3. Call it any time:
   - the parent edge's geometry refreshes (`DAEdge.refreshGeometry()` →
     foreach label, applyAnchor)
   - the label's `anchor` is mutated
   - the label's `fontSize` changes (offset depends on bbox)

### Hit-test (selection)

Today `getLabelUnderCrosshairs()` checks the rect bbox at `label.x/y`. After
the change, label position is computed from `anchor + edge` — but
`label.x/y` are still valid (set by `applyAnchorFromEdge`), so the hit-test
keeps working unchanged. The selection tolerance is the same as
[architecture-invariants](architecture-invariants.md) #11 (waypoint hit-test
tolerance) per [idea-label-no-default-box](idea-label-no-default-box.md).

---

## 4. Interaction

### Adding a label

Today: `f → l` (add → label) opens `ADD_LABEL`. The crosshairs must be
*on* an edge; the label is placed where the crosshairs intersect that edge.

Proposed v1 keep this entry point — just route the new label through
`anchor` not absolute coords. The placement bucket is the `(along, side)`
combo nearest to where the crosshairs sit on the edge.

### Choosing which of the 9 positions

Three options ranked by minimum-disruption:

1. **Just-add-and-drag.** Existing model. After `ADD_LABEL` the label exists
   at the crosshairs' projection. The user drags it (already supported via
   the slide-along-edge helper) to refine. Add a perpendicular drag to flip
   sides.
2. **Quick-jump keys after add.** While the label is selected, single keys
   reposition it: `[` / `]` jump to src-end/dest-end, `=` to center; `j` /
   `k` / `;` set side to above/below/on. Mnemonic-light but discoverable
   from the menu.
3. **Submenu picker on add.** `f → l` opens a 3x3 grid of glyphs; pick
   `qwe asd zxc` for `src-above center-above dest-above / src-on center-on
   dest-on / src-below center-below dest-below`. Visually obvious but heavy
   for a frequent action.

**v1 chooses (1).** It's a strict superset of what works today; the others
layer on top. The keymenu agent owns whether to add (2) or (3) later.

### Editing the label text

No change. The existing label-edit mode (`handleEditSelected` →
`started-label-editing-mode`) already routes keystrokes into
`DALabel.appendText` / `deleteLastChar`. Works for edge labels because
edge labels *are* `DALabel`s.

### Dragging

- **Along** the edge: existing `slideLabelAlongEdge`. After the move, update
  `anchor.t` to match the new position; if within snap tolerance of a bucket,
  set `along` to that bucket.
- **Across** the edge (perpendicular): new helper that updates
  `anchor.offset` (and `side` if snapped). v1 punt: only `slideAlongEdge` is
  wired; `offset` is set at insertion and on side-flip key only.

---

## 5. Routing impact

Two angles.

### 5a. Labels move *with* the edge when it re-routes

**Yes, this is the whole point of arc-length anchoring.** Every code path
that mutates an edge's polyline must invoke `applyAnchorFromEdge` on each of
the edge's labels afterward. The two existing paths:

- `DAEdge.refreshGeometry()` — already called every time `_controlPoints`
  changes, every time a node moves. Add a loop at the end:
  `this._labels.forEach(l => l.applyAnchorFromEdge(this))`.
- Direct `_line.points(...)` mutation (none in code today, but be careful).

That's it. Once anchored, labels track re-routes automatically. The
`metrics.compute` and `applyBezierFitWeightedChainEdges` flows don't need
any new hooks — they go through `setControlPoints` → `assignControlPoints` →
`refreshGeometry`.

### 5b. Should labels be treated as routing obstacles?

**v1: no.** Reasons:

- Labels are user-typed text. Their bbox is unstable: enlarges as the user
  types, shrinks on backspace. Re-routing on each keystroke would be very
  surprising.
- Labels can be hidden by the user (zoom-out level), turned off in
  `tagStyles`, etc. Treating them as obstacles couples render-only state to
  routing.
- bf-wc's obstacle model is currently node bboxes (see
  `bezier-fit-weighted-chain-edges.ts` and `edge-routing-metrics.ts` —
  neither mentions labels). Adding a new obstacle category is a graph-auto-
  layout agent task, not a drawing-area task.

What we can do cheaply: **stash label bboxes as advisory rects on
`DAEdge`**, available for the router to consult if it ever wants to. v1
doesn't actually consult them, but v2 can opt in by:

- a new `EdgeRoutingHints` parameter on `applyBezierFitWeightedChainEdges`
  containing the label rect per edge,
- adding a `labelClearance` term to `edge-routing-metrics.ts` that penalises
  edges passing through their own label's bbox,
- having the user accept that label positions are "sticky": the router
  routes around them, the user can drag a label to a different bucket and
  the router re-routes around the new position on next layout pass.

For now: spec stays in this note as v2. No code.

### 5c. Edge re-routing should not move labels off-screen

The arc-length anchoring already handles this: a label at `t=0.5` is always
mid-arc, regardless of length. Edge cases:

- **Edge becomes very short** (nodes pushed together). Label bbox may
  overflow node bboxes. Acceptable — render anyway; the user will resolve
  manually.
- **Edge becomes very long** (nodes pulled apart). Label stays at `t=0.5`,
  which is what the user expects.
- **Self-loop.** `getPathPoints()` returns a 4-point loop; arc-length
  parameterisation works fine. `t=0.5` ends up on the far side of the loop.
  Reasonable.

---

## 6. Auto-layout impact

The auto-layout flow (`applyLayout` → `graph-layout.ts`) places nodes
according to graph topology + node bboxes. Today it does not consult labels.

Should it?

- **No for v1.** Same reasoning as routing: label bboxes are unstable,
  user-typed, and would couple layout to text content.
- **Maybe for v2** if users complain about labels overlapping non-incident
  nodes. The fix would be: when computing node-collision avoidance, *also*
  reserve a small bbox around each edge for its labels (computed from
  `anchor.t` and the straight node-to-node segment). This is approximate but
  cheap.

For now: not blocking; spec as future work, no code.

---

## 7. Open questions for the user

1. **Convention for "above"** — confirm convention B (world-relative,
   smaller-y is "above"). If they expect text-relative, the math is the same
   but the binding labels swap on vertical edges.
2. **Bucket positions.** v1 picks `t = 0.10 / 0.50 / 0.90` for src-end /
   center / dest-end. The 0.10 vs 0.0 choice is to clear the arrowhead;
   that's a guess. If users want the label *right at* the arrowhead, change
   to 0.05.
3. **Multi-label conflict avoidance.** v1: none, two labels at the same
   bucket overlap. v2: stack vertically? auto-rebucket? Punt for now.
4. **`on-line` rendering.** v1: opaque background `Rect` matching layer bg.
   Alternative: split the underlying Konva.Arrow. The split-arrow approach
   is cleaner but invasive. Confirm we're OK with the background-`Rect`
   approach.
5. **`rotation: 'tangent'` for `on-line`.** Tangent-rotated on-line labels
   on vertical edges read sideways. Is that OK or should `on-line` force
   `horizontal`?
6. **Label-as-obstacle in routing.** Worth doing in v2? The cost is a
   stickier-feeling router (it routes around your labels); the benefit is
   no overlap. Could be a `tagStyle` (`routing.avoidLabels: true`).
7. **Auto-layout label awareness.** Same question for the layout side.
   Defer until users complain.
8. **File format compatibility.** If we change `labelOffsets` from
   `{dx, dy}` to `{t, offset}`, we need a migration. Versioning question:
   bump `kdStyle` to 2? Or treat the field shape as polymorphic? v1 plan:
   polymorphic — accept both shapes on load, write the new shape on save.
   Bump `kdStyle` when the next breaking change lands.

---

## v1 scope (this PR)

What ships in this branch:

- Data model: `DALabel.anchor: { t, offset }`, `rotation` reserved.
- `DAEdge.refreshGeometry()` re-applies all label anchors.
- `addLabel()` derives `t` and `offset` from crosshairs projection onto
  edge polyline; defaults `side='above'` (positive offset by half-bbox +
  4px).
- `DALabel` always horizontal (no rotation).
- Existing `slideLabelAlongEdge` updates `anchor.t` after sliding.
- Serialization: load understands both old (`dx/dy`) and new (`t/offset`)
  shapes; save writes new. Round-trip test.
- Re-route (bf-wc, node-drag) does not orphan labels — they ride the
  polyline.

What is intentionally out of scope for v1 (covered above):

- 3x3 picker UX. Just-add-and-drag for now.
- Side flip key. Drag perpendicular not wired.
- `on-line` rendering. Default to `above`.
- Label-as-obstacle (routing and layout).
- Multi-label conflict avoidance.
- Tangent rotation.
- Curved-baseline (text-on-path) rendering — explicitly out of scope per
  task brief; Konva can't do it cleanly.
