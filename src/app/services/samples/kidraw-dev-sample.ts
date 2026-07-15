/** The kidraw-dev sample graph — KiDraw development as a typed non-tree
 *  todo graph (40 nodes, 59 edges, 15 multi-parent). AUTHORITATIVE copy:
 *  tools/typed-dataset.js extracts this literal for the gallery/metrics
 *  tools, and DemoDataService loads it through the real file pipeline
 *  (parse → tagStyles cascade → snapshot), so the sample doubles as an
 *  end-to-end exercise of the typed-todo file format
 *  (notes/idea-todo-graph-modeling.md). */
export const KIDRAW_DEV_SAMPLE_YAML = `
# KiDraw development as a typed todo graph — the first NON-TREE scenario
# dataset (notes/idea-todo-graph-modeling.md). Node types via tags
# (goal/category/question/note/task), edge kinds via tags (component-of /
# depends-on / serves / note). depends-on points prerequisite → dependent
# (flow of enablement); component-of points parent → part.
#
# Deliberately non-tree: ~14 nodes have more than one incoming edge
# (depends-on cross-links between categories, serves edges into goals).
kidraw: 1
type: todo-graph
styles:
  - name: default
    tagStyles:
      category: {shape: box, w: 280, h: 100, fontSize: 30}
      goal: {shape: circle, w: 190, h: 190, fontSize: 20}
      question: {shape: diamond, w: 240, h: 130, fontSize: 14}
      note: {shape: box, w: 160, h: 50, fontSize: 10}
    nodes:
      g0: {x: -320.31, 'y': -500.75}
      g1: {x: -349.214, 'y': 1896.25}
      c0: {x: -937.396, 'y': 49.25}
      c1: {x: -319.724, 'y': -2400.75}
      c2: {x: -332.263, 'y': -1500.75}
      c3: {x: -354.624, 'y': -0.75}
      c4: {x: -394.214, 'y': 786.25}
      c5: {x: -371.375, 'y': 2499.25}
      c6: {x: -392.556, 'y': -900.75}
      c7: {x: -313.857, 'y': 1499.25}
      t1: {x: 229.199, 'y': -2900.75}
      t2: {x: 187.786, 'y': -2700.75}
      t3: {x: 223.556, 'y': -2500.75}
      t4: {x: 222.421, 'y': -2300.75}
      t5: {x: 217.503, 'y': 1299.25}
      t6: {x: 187.786, 'y': 1499.25}
      t7: {x: 196.332, 'y': -700.75}
      t8: {x: 230.447, 'y': -1500.75}
      t9: {x: 206.62, 'y': -1700.75}
      t10: {x: 212.971, 'y': -100.75}
      t11: {x: 258.809, 'y': -300.75}
      t12: {x: 187.786, 'y': 99.25}
      t13: {x: 220.665, 'y': 299.25}
      t14: {x: 236.869, 'y': 2099.25}
      t15: {x: 200.608, 'y': 1099.25}
      t16: {x: 217.028, 'y': 699.25}
      t17: {x: 187.786, 'y': 499.25}
      t18: {x: 234.952, 'y': 2299.25}
      t19: {x: 224.39, 'y': 2499.25}
      t20: {x: 218.145, 'y': 2699.25}
      t21: {x: 224.541, 'y': -1100.75}
      t22: {x: 235.714, 'y': -900.75}
      t23: {x: 187.786, 'y': -1900.75}
      t24: {x: 199.367, 'y': 1699.25}
      q1: {x: 207.786, 'y': -2100.75}
      q2: {x: 207.786, 'y': -1300.75}
      q3: {x: 220.292, 'y': 899.25}
      q4: {x: 210.035, 'y': 2899.25}
      n1: {x: -956.214, 'y': -3300.75}
      n2: {x: -956.214, 'y': 3299.25}
    edges:
      e42: {waypoints: [{x: 488.482, 'y': -875.75}]}
      e45: {waypoints: [{x: 540.011, 'y': 581.375}, {x: 496.586, 'y': 1749.25}]}
      e49: {waypoints: [{x: 540.011, 'y': 67.125}, {x: 496.586, 'y': -1662.05}]}
      e51: {waypoints: [{x: 109.261, 'y': 575.075}, {x: 135.698, 'y': 1521.1}, {x: 158.986, 'y': 2467.125}]}
      e60: {waypoints: [{x: 22.625, 'y': -255.147}]}
      e62: {waypoints: [{x: -70.74, 'y': -509.55}]}
      e63: {waypoints: [{x: -23.714, 'y': -1010.961}, {x: -12.441, 'y': -710.422}]}
      e67: {waypoints: [{x: 44.91, 'y': 1847.893}]}
      e70: {waypoints: [{x: -587.432, 'y': -1471.156}]}
semantics:
  nodes:
    g0: {label: "MVP launch", tags: [goal]}
    g1: {label: "Compete with Obsidian", tags: [goal]}
    c0: {label: "KiDraw", tags: [category]}
    c1: {label: "Routing", tags: [category]}
    c2: {label: "Keymenu", tags: [category]}
    c3: {label: "Serialization", tags: [category]}
    c4: {label: "Navigation & gather", tags: [category]}
    c5: {label: "Todo modeling", tags: [category]}
    c6: {label: "Trad/large menus", tags: [category]}
    c7: {label: "Styling", tags: [category]}
    t1: {label: "Post-layout routing profile", tags: [task]}
    t2: {label: "No-new-crossings vs straight baseline", tags: [task]}
    t3: {label: "Straight-line reversion pass", tags: [task]}
    t4: {label: "Degree-aware fan demands", tags: [task]}
    t5: {label: "Fix color round-trip to canvas", tags: [task]}
    t6: {label: "Type-to-color mapping for todo graphs", tags: [task]}
    t7: {label: "Design trad/large-menu interaction", tags: [task]}
    t8: {label: "Fix held-chord order bugs", tags: [task]}
    t9: {label: "Key-command binding language", tags: [task]}
    t10: {label: "Dirty indicator + beforeunload", tags: [task]}
    t11: {label: "Vault fuzzy finder", tags: [task]}
    t12: {label: "Multi-file save preserving style imports", tags: [task]}
    t13: {label: "Edge kind field in file format", tags: [task]}
    t14: {label: "Ready-frontier highlight", tags: [task]}
    t15: {label: "Nav-corridor reservation in gather", tags: [task]}
    t16: {label: "Push-away for gather column", tags: [task]}
    t17: {label: "Typed traversal: follow only depends-on", tags: [task]}
    t18: {label: "Status lifecycle on tasks", tags: [task]}
    t19: {label: "Serves-edge orphan sweep", tags: [task]}
    t20: {label: "Build condo scenario dataset", tags: [task]}
    t21: {label: "Style-definition large menu", tags: [task]}
    t22: {label: "Open/Save large menus", tags: [task]}
    t23: {label: "Kind-aware spanning forest in tree layout", tags: [task]}
    t24: {label: "Semantic zoom: importance floors", tags: [task]}
    q1: {label: "Departure tangent or endpoint bearing?", tags: [question]}
    q2: {label: "Sticky tier mode instead of held chords?", tags: [question]}
    q3: {label: "n/p siblings, j/k in-out swap?", tags: [question]}
    q4: {label: "Are categories zones or nodes?", tags: [question]}
    n1: {label: "Chord bugs bite tier chords too", tags: [note]}
    n2: {label: "Label-ends-with-? found 11 questions", tags: [note]}
  edges:
    # component-of spine (parent → part) — the tree-layout skeleton.
    e0: {from: c0, to: c1, tags: [component-of]}
    e1: {from: c0, to: c2, tags: [component-of]}
    e2: {from: c0, to: c3, tags: [component-of]}
    e3: {from: c0, to: c4, tags: [component-of]}
    e4: {from: c0, to: c5, tags: [component-of]}
    e5: {from: c0, to: c6, tags: [component-of]}
    e6: {from: c0, to: c7, tags: [component-of]}
    e7: {from: c0, to: g0, tags: [component-of]}
    e8: {from: c0, to: g1, tags: [component-of]}
    e10: {from: c1, to: t1, tags: [component-of]}
    e11: {from: c1, to: t2, tags: [component-of]}
    e12: {from: c1, to: t3, tags: [component-of]}
    e13: {from: c1, to: t4, tags: [component-of]}
    e14: {from: c1, to: q1, tags: [component-of]}
    e15: {from: c7, to: t5, tags: [component-of]}
    e16: {from: c7, to: t6, tags: [component-of]}
    e17: {from: c2, to: t8, tags: [component-of]}
    e18: {from: c2, to: t9, tags: [component-of]}
    e19: {from: c2, to: q2, tags: [component-of]}
    e20: {from: c3, to: t10, tags: [component-of]}
    e21: {from: c3, to: t11, tags: [component-of]}
    e22: {from: c3, to: t12, tags: [component-of]}
    e23: {from: c3, to: t13, tags: [component-of]}
    e24: {from: c4, to: t15, tags: [component-of]}
    e25: {from: c4, to: t16, tags: [component-of]}
    e26: {from: c4, to: t17, tags: [component-of]}
    e27: {from: c4, to: q3, tags: [component-of]}
    e28: {from: c5, to: t14, tags: [component-of]}
    e29: {from: c5, to: t18, tags: [component-of]}
    e30: {from: c5, to: t19, tags: [component-of]}
    e31: {from: c5, to: t20, tags: [component-of]}
    e32: {from: c5, to: q4, tags: [component-of]}
    e33: {from: c6, to: t7, tags: [component-of]}
    e34: {from: c6, to: t21, tags: [component-of]}
    e35: {from: c6, to: t22, tags: [component-of]}
    e36: {from: c1, to: t23, tags: [component-of]}
    e37: {from: c7, to: t24, tags: [component-of]}
    # depends-on cross-links (prerequisite → dependent): the non-tree part.
    e40: {from: t2, to: t3, tags: [depends-on]}
    e41: {from: t7, to: t11, tags: [depends-on]}
    e42: {from: t7, to: t21, tags: [depends-on]}
    e43: {from: t7, to: t22, tags: [depends-on]}
    e44: {from: t13, to: t17, tags: [depends-on]}
    e45: {from: t13, to: t14, tags: [depends-on]}
    e46: {from: t18, to: t14, tags: [depends-on]}
    e47: {from: t18, to: t19, tags: [depends-on]}
    e48: {from: t5, to: t6, tags: [depends-on]}
    e49: {from: t13, to: t23, tags: [depends-on]}
    e50: {from: t8, to: q2, tags: [depends-on]}
    e51: {from: t13, to: t20, tags: [depends-on]}
    # serves (task → goal it advances).
    e60: {from: t10, to: g0, tags: [serves]}
    e61: {from: t11, to: g0, tags: [serves]}
    e62: {from: t7, to: g0, tags: [serves]}
    e63: {from: t8, to: g0, tags: [serves]}
    e64: {from: t14, to: g1, tags: [serves]}
    e65: {from: t19, to: g1, tags: [serves]}
    e66: {from: t6, to: g1, tags: [serves]}
    e67: {from: t24, to: g1, tags: [serves]}
    # note attachments.
    e70: {from: n1, to: t8, tags: [note]}
    e71: {from: n2, to: q4, tags: [note]}
`;
