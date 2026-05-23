---
title: Rich text in nodes and labels (markdown, math)
type: idea
---

# Rich text in nodes and labels

Today node and label text is plain string.

- **Markdown** in node text — bold, italic, code, lists; mostly inline formatting.
- **Math** (LaTeX-ish or KaTeX) — longer term; useful for technical diagrams.

The renderer would need to handle multi-line and the node-resize / text-overflow logic would interact with rich text in non-obvious ways (e.g. line-wrap of bold runs).
