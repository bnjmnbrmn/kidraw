---
title: Two rows of the add/insert ledger disagree with the code, and add-insert-taps.js follows the ledger
type: bug
status: resolved 2026-09-24 — the ledger was wrong on both rows (Ben)
---

# Two rows of the add/insert ledger disagree with the code

> **Resolved (Ben, 2026-09-24): the ledger is wrong in both cases.** Rows 1
> and 19 now describe the code: tap `i` over a node starts in vim normal mode,
> and `v` then `o` cycles four states. `add-insert-taps.js` was rewritten to
> match, and is clean without a baseline: it starts from the default directed
> edge and uses a real held Shift for `A`.

`tools/qa/drag-and-grow/add-insert-taps.js` has been below its baseline for
weeks (7 failures against 6). Most of its failures are not the app breaking:
the script follows the case ledger in
[`design-add-insert-model.md`](design-add-insert-model.md), and on two rows
the code has since gone another way (inferred, 2026-09-24 — from the script's
output, the code, and the commits named below; not a decision).

| Ledger row | Ledger says | Code does | Since |
|---|---|---|---|
| 1 — tap `i` over a node | edit node text (**vim insert**) | enters **vim normal** mode | `7d19c7f1`, 2026-08-06, "Enter existing text in Vim normal mode" (Codex, no reason given) |
| 19 — `v` then `o` on an edge | **3 states**, D → U → B; reversing an edge "a separate structural op, deferred" | **4 states**: forward → reversed → undirected → bidirectional | `9aea32e6`, 2026-07-20, from Ben's dogfooding ("Two findings from Ben's dogfooding, dispatched via the graph's Next node") |

The script also assumes a new edge starts **undirected**, and has done since
the default was undirected (`ba338305`, 2026-07-28). `1177d932` (2026-08-01,
"Implement five Next interaction refinements") made it **directed** again, so
the script's first `v`+`o` press now reverses the edge where it expects
"bidirectional". Five of its seven failures follow from that start; the other
two from row 1 (typed text lands as vim commands, not as text).

## What would settle it

- **Row 19** looks settled by Ben's dogfooding in July; the ledger row and the
  script were not updated with it. If so: update row 19, and have the script
  set its edge undirected before cycling (it tests the cycle, not the default).
- **Row 1** has no recorded reason. Either the ledger is stale (tap `i` edits
  in normal mode now, on purpose) or the change was not meant: Ben's call.

Nothing changed here overnight: a ledger row is a design record, and the
script is its check.

Related: row 6b of the same ledger drifted the same way and was corrected by
Ben on 2026-09-17 (see `AGENTS.md`, "Provenance").
