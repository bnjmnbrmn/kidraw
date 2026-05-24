import { placeNode, connect } from './_helpers.mjs';

export const name = 'mesh-3x3';
export const description = '3×3 grid of nodes with horizontal-right and vertical-down neighbor edges (12 edges). Tests routes that necessarily pass close to other obstacles.';

export function build({ DANode, DAEdge }) {
  const grid = [];
  const startX = 200;
  const startY = 200;
  const stepX = 220;
  const stepY = 220;
  for (let row = 0; row < 3; row++) {
    const rowArr = [];
    for (let col = 0; col < 3; col++) {
      const n = placeNode(DANode, `n${row}${col}`, startX + col * stepX, startY + row * stepY);
      rowArr.push(n);
    }
    grid.push(rowArr);
  }
  const edges = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (col + 1 < 3) {
        edges.push(connect(DAEdge, `h${row}${col}`, grid[row][col], grid[row][col + 1]));
      }
      if (row + 1 < 3) {
        edges.push(connect(DAEdge, `v${row}${col}`, grid[row][col], grid[row + 1][col]));
      }
    }
  }
  return { nodes: grid.flat(), edges };
}
