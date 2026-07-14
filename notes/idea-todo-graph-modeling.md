---
title: Todo-graph modeling — typed nodes/edges, derived semantics, scenario datasets
type: idea
status: brainstormed 2026-07-14 (Ben + Claude); next step = pick 2–3 scenario datasets to build
---

# Todo-graph modeling

**Prompt (Ben, 2026-07-14):** concentrate on realistic todo graphs. Category,
depends-on, and component-of relationships as typed nodes and links — what
else should we model, and what actual scenarios can we visualize?

This fleshes out the planned extension slots ("commands, keymenu entries,
node/edge kinds like todo `depends-on`, tags, validation" — dev-status
extensions item) with concrete requirements, and defines scenario datasets
for the layout/routing work and the `/shots/` gallery.

## Node types

| Type | Notes |
| :-- | :-- |
| **Task** | The atom. Status lifecycle: todo / doing / blocked / waiting / done / dropped. |
| **Category / Area** | Ongoing bucket, never completes (KiDraw, Condo, Family, BNY). Maybe a zone, not a node, once [idea-zones](idea-zones.md) lands. |
| **Project / Goal** | Completes; has a definition of done. |
| **Milestone** | Point-in-time marker dependency chains aim at. |
| **Person** | Who a task waits on / who owns it (contractor, board member). |
| **Decision** | A fork that blocks tasks until made; options are near-edges. |
| **Question / Unknown** | Answered by research tasks; distinct from a decision. |
| **Event / Deadline** | Dated: board meeting, eval appointment, due date. |
| **Resource / Reference** | Document, link, quote, estimate. |
| **Idea** | Unbaked; promotes to task/project. |
| **Recurring chore** | Never done, only done-until-next-time. |

## Edge types

| Type | Semantics |
| :-- | :-- |
| **depends-on** | Hard ordering: can't start A until B is done. Direction convention needed ("blocks" = reverse reading). |
| **component-of** | Decomposition; parent done ⇔ children done. **Tree-forming.** |
| **category** (belongs-to) | Grouping; possibly non-exclusive. |
| **waiting-on** | Task → person/external event. Distinct from depends-on: *you* can't unblock it. |
| **serves / motivates** | Task → goal it advances; exposes orphaned busywork. |
| **answers** | Research task → question. |
| **decides** | Decision → the tasks it unblocks. |
| **soft-ordering** | "Preferably after" — a scheduling preference. Keeping this distinct from depends-on avoids the classic todo-system conflation. |
| **spawned-by** | Provenance (meeting/conversation/note that created the task). |
| **conflicts-with / shares-resource** | Mutual exclusion or contention (same weekend, budget, contractor). |
| **supersedes / duplicate-of** | Task hygiene. |
| **at-location** | Errand batching (@hardware-store). |

## Derived semantics (the graph payoff → feature mapping)

- **Ready frontier** — tasks with all depends-on ancestors done: "what can I
  do now." Highlight/filter command.
- **Blocked propagation** — transitively blocked subtrees rendered dimmed;
  pairs with the gathering/collapse rework.
- **Critical path** to a milestone — longest dependency chain; highlight.
- **Waiting-on view** — everything gated on one person = gather by edge type.
- **Validation slot** — depends-on cycles are modeling errors; orphans with
  no category; done tasks with undone components.
- **Done-collapse** — fold completed subtrees (the collapse half of the
  gathering rework).

## Implications for the platform

- **Edge kinds need**: a `kind` field in the file format's edge semantics, a
  visual mapping per kind (line style / color / arrowhead via the style
  cascade — tagStyles is the near-fit), and traversal/gather awareness
  (follow only depends-on; gather components but not dependents). Typed
  traversal interacts with [idea-graph-nav-key-swap](idea-graph-nav-key-swap.md)
  ("siblings" = same-kind edges?).
- **Layout/routing**: component-of gives trees; depends-on adds cross-links —
  the current next.org graph is a *pure tree*, so typed cross-links move us
  into the tree+non-tree regime where the ordering optimizer and router
  actually get exercised ([idea-routing-post-layout-quality](idea-routing-post-layout-quality.md)).
- **Categories** may ultimately be zones (containers) rather than nodes —
  see [idea-zones](idea-zones.md); model as nodes for now.

## Type mechanics + what the real data showed (Ben + Claude, 2026-07-14)

- **Types are tags, not exclusive classes.** A node can be `task` + `goal`
  (Ben: "maybe some nodes should be tagged both"). Equivalently: goal and
  question are *specializations* of task — they have status and can be
  worked — while category and note are not tasks at all. Tag-set semantics
  give us both readings for free and match the file format's existing
  `tags` field.
- **Classifying the actual next.org graph** (`tools/next-typed-viz.js`)
  found: 5 categories (Next, Pre-MVP, Post-MVP, Polish/ergonomics,
  Development accelerants), **11 questions** (label ends in `?` is a
  surprisingly reliable heuristic), 1 goal (Compete with Obsidian), 39
  tasks, and a type we hadn't listed: **5 note/commentary nodes** ("Should
  be relatively easy", "I guess this could refer to…") — annotations with
  no action in them. Notes render small and should cull first when zoomed
  out ([idea-semantic-zoom-importance](idea-semantic-zoom-importance.md)).
- **Visual mapping v0** (shape+size only; fill/stroke blocked on
  [bug-style-colors-not-persisted](bug-style-colors-not-persisted.md)):
  category = big box w/ 30px font, goal = circle, question = diamond,
  note = small 10px box, task = plugin default. Rendered dark-theme in the
  `/shots/` gallery (`…-next-typed` runs).

## Means vs. ends (Ben, 2026-07-14: "not sure how useful")

Decision sketch: **model it structurally, not as a task attribute.** A means
is a task whose value flows through its outgoing `serves`/`component-of`/
`depends-on` edges; an end-in-itself is a **value sink** (usually a Goal
node; occasionally a task flagged intrinsic). Tasks that are both just have
both properties — no special case.

- **Primary payoff — task garbage collection**: when an end completes or is
  dropped, walk the serves chains backward and offer to sweep tasks that
  *only* served it (the "third contractor quote" zombie after the estimate
  was approved). A cascade review list tools structurally can't do.
- Secondary: motivation surfacing (traverse chore → why it exists) and
  pruning leverage (cut weak-ended means first; never cut sinks).
- **Adoption rule**: orphanhood is *visible, not forbidden* — a validation
  highlight ("serves nothing"), never mandatory metadata; one edge fixes it.
- **Empirical test**: build the KiDraw-dev dataset with serves edges (roadmap
  items genuinely serve MVP/dogfooding goals) and keep the concept only if
  the orphan-sweep proves useful there.

## Scenario datasets (ordered by shape diversity)

1. **KiDraw development itself** — workstreams as categories, the
   interaction-model roadmap as depends-on chains, real decisions and ideas.
   Deep + wide; ground truth known. Best first dataset.
2. **Condo Q3** — people-heavy, shallow: tasks waiting-on owners/contractor/
   property manager, the construction-estimate decision, the board meeting
   as a dated event. Bipartite-ish; nothing like dev work structurally.
3. **Ethan's eval process** — a pure dated dependency chain (referral →
   appointment → report → school meeting). Tests deadline rendering and
   chain layouts. *Family data: local only, never in the public gallery.*
4. **Birthday party / baby prep** — parallel subtrees converging on a hard
   date; the small-project archetype.
5. **Software release checklist** — generic, publishable demo (build → test
   → tag → deploy + rollback decision) for a public example dataset.
6. **Errands / home maintenance** — recurring lifecycle + at-location
   batching; tests contexts.

## Next steps

- Pick 2–3 scenarios and build them as `.kidraw.yaml` datasets (KiDraw-dev +
  Condo first: maximally different shapes); add them to the layout gallery
  battery.
- Spec the `kind` field for edge semantics in the file format (small,
  additive) and the visual mapping through the cascade.
- Decide direction conventions (depends-on vs blocks) before datasets bake
  them in.
