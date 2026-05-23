---
title: Naming — edges vs links
type: idea
---

# Naming — "edges" vs "links"

The code uses *edge* (graph-theoretic). The user-facing language is sometimes *link*, which feels lighter-weight and may be more discoverable for non-graph-savvy users.

Decision is pending. Costs of renaming are non-trivial (lots of `DAEdge` references, command kinds like `INSERT_EDGE`), but a search-and-replace + grep can do most of it.
