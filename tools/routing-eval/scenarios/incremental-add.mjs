import { placeNode, connect } from './_helpers.mjs';

export const name = 'incremental-add';
export const description = 'Incremental routing benchmark: 4 corner nodes with diagonal edges TL→BR and TR→BL, plus a 5th center node and one edge from the center to the bottom-left corner. The verification driver pre-routes the two diagonals with the full bf-wc router, then routes the center edge with the incremental router and asserts the two diagonals stayed untouched while the center edge threads between them.';

export function build({ DANode, DAEdge }) {
  // 4 corner nodes in a 800x600 square.
  const tl = placeNode(DANode, 'TL', 200, 200);
  const tr = placeNode(DANode, 'TR', 800, 200);
  const bl = placeNode(DANode, 'BL', 200, 600);
  const br = placeNode(DANode, 'BR', 800, 600);
  // Center node — the incremental edge originates here.
  const center = placeNode(DANode, 'C', 500, 400);

  // The two pre-existing edges: diagonals.
  const diag1 = connect(DAEdge, 'TL_BR', tl, br);
  const diag2 = connect(DAEdge, 'TR_BL', tr, bl);
  // The incremental edge: center → BL. Has to thread between the diagonals.
  const incremental = connect(DAEdge, 'C_BL', center, bl);

  return {
    nodes: [tl, tr, bl, br, center],
    edges: [diag1, diag2, incremental],
    // Hint to the verification driver: which edge is "the one being added".
    // The default harness ignores this; the incremental-add-verify.mjs
    // driver reads it.
    incrementalTargetId: incremental.id,
  };
}
