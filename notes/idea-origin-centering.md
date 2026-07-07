---
title: Normalize graph coordinates around the origin?
type: idea
---

# Normalize graph coordinates around the origin?

User instinct (2026-07-07, while debugging "opened graph is off-screen"):
maybe the graph should always be centered on (0,0), so zoom/pan behavior is
predictable and files don't accumulate arbitrary coordinate offsets.

**Why we didn't do it on save:** normalizing on every write would translate
*every* node/waypoint/label coordinate whenever the bounding box shifts
(adding a node on the right moves everything's stored x). That churns diffs
and the LLM round-trip — the two things the vault exists for.

**What we did instead:** every load path (`centerViewOnContent()`) pans the
view to the content bounding-box center and recenters the crosshairs, so
where the coordinates live no longer matters when opening. Zoom is anchored
at the crosshairs, so after an open the zoom keys orbit the graph, not empty
space.

**Still plausible later:** an explicit, user-invoked "Normalize coordinates"
command (layout-family) that rewrites coordinates once, deliberately — useful
before publishing/sharing a file, harmless to diffs if run as its own commit.
Related: the unshipped `view` field in the file format (viewport save/restore
per display) would let an authored presentation pick its own framing.
