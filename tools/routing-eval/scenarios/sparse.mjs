import { placeNode, connect } from './_helpers.mjs';

// Rationale: Round-1 feedback flagged this scenario for "too many wiggles /
// not smooth enough" and "edges going behind nodes". Investigation
// confirmed the second problem was *structural*: the original spec wired
// two perfectly-vertical edges (n01->n21 and n02->n22) and one perfectly
// horizontal edge (n10->n13) through a 4x3 grid where intermediate nodes
// sat exactly on those straight-line paths. Every router that started
// from a straight chord either passed through the intermediate node
// bounding box (bezier-route, flexible-wire: hardFailCount 5/5) or
// wiggled wildly to dodge it (charged-spring: hardFailCount 3/5).
//
// Fix: widen the grid spacing (240 -> 280 px so adjacent boxes have a
// 160 px gap), then replace the five edges with "knight-move" spans
// (two columns over plus one row down, or vice versa). Each such span
// has slope +/-0.5 or +/-2; with this slope/spacing the straight chord
// between endpoints clears every non-incident node bbox by ~80 px on
// either side. The scenario still has only five edges in a low-density
// 12-node grid, but now the *correct* answer is "draw a clean
// near-straight curve". Routers that wiggle on this scenario after the
// fix are wiggling on their own merits, not because the input demands it.
//
// (We considered keeping the original "long-span corner-to-corner"
// edges, but at 4x3 the full diagonal slope 2/3 passes through both
// middle-row node bboxes regardless of grid spacing, since the geometric
// centre of the diagonal coincides with the centre of the grid. The
// knight-move alternative gives medium-length spans that are genuinely
// unobstructed.)

export const name = 'sparse';
export const description = '12 nodes on a 4x3 grid (280 px spacing, 160 px gap between adjacent box edges) with five "knight-move" edges (two columns plus one row). Each edge has a straight-line chord that clears every non-incident node bbox by ~80 px, so a competent router should produce a near-straight smooth drawing.';

export function build({ DANode, DAEdge }) {
  const startX = 180;
  const startY = 180;
  const stepX = 280;
  const stepY = 280;
  const grid = [];
  for (let row = 0; row < 3; row++) {
    const rowArr = [];
    for (let col = 0; col < 4; col++) {
      rowArr.push(placeNode(DANode, `n${row}${col}`, startX + col * stepX, startY + row * stepY));
    }
    grid.push(rowArr);
  }
  const edges = [];
  // Five "knight-move" spans. Each was hand-checked: the straight chord
  // between endpoints has slope +/-0.5 (two cols, one row) or +/-2 (one
  // col, two rows) and clears every non-incident node bbox by ~80 px
  // along the y-axis at the bbox column.
  // e0: top-left to mid-row-third (slope 0.5, clears n01 below and n11 above).
  edges.push(connect(DAEdge, 'e0', grid[0][0], grid[1][2]));
  // e1: top-right to mid-row-second (slope -0.5, mirror of e0).
  edges.push(connect(DAEdge, 'e1', grid[0][3], grid[1][1]));
  // e2: mid-left to bottom-third (slope 0.5).
  edges.push(connect(DAEdge, 'e2', grid[1][0], grid[2][2]));
  // e3: mid-right to bottom-second (slope -0.5).
  edges.push(connect(DAEdge, 'e3', grid[1][3], grid[2][1]));
  // e4: top-left to bottom-second (slope 2 / one col over, two rows down --
  // passes through the wide gap between n10 and n11).
  edges.push(connect(DAEdge, 'e4', grid[0][0], grid[2][1]));
  return { nodes: grid.flat(), edges };
}
