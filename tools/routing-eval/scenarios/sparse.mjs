import { placeNode, connect } from './_helpers.mjs';

export const name = 'sparse';
export const description = '12 nodes on a 4×3 grid with only 5 long-span edges. Tests behavior in low-density layouts where each edge has room and obstacle pressure is mild.';

export function build({ DANode, DAEdge }) {
  const startX = 200;
  const startY = 200;
  const stepX = 240;
  const stepY = 240;
  const grid = [];
  for (let row = 0; row < 3; row++) {
    const rowArr = [];
    for (let col = 0; col < 4; col++) {
      rowArr.push(placeNode(DANode, `n${row}${col}`, startX + col * stepX, startY + row * stepY));
    }
    grid.push(rowArr);
  }
  const edges = [];
  // Long spans deliberately chosen to cross other nodes' rows
  edges.push(connect(DAEdge, 'e0', grid[0][0], grid[2][3])); // diagonal across
  edges.push(connect(DAEdge, 'e1', grid[0][3], grid[2][0])); // other diagonal
  edges.push(connect(DAEdge, 'e2', grid[1][0], grid[1][3])); // horizontal full-row
  edges.push(connect(DAEdge, 'e3', grid[0][1], grid[2][1])); // vertical full-col
  edges.push(connect(DAEdge, 'e4', grid[0][2], grid[2][2])); // another vertical
  return { nodes: grid.flat(), edges };
}
