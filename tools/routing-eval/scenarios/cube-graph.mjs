import { placeNode, connect } from './_helpers.mjs';

export const name = 'cube-graph';
export const description = 'The graph of a 3D cube (Q3): 8 nodes at the corners of a cube projected to 2D, with 12 edges along the cube edges. Planar but tricky — the projection creates many parallel and near-parallel edges.';

export function build({ DANode, DAEdge }) {
  // 4 back face nodes (offset up-right to simulate depth) + 4 front face nodes.
  const f = 200; // front face origin
  const dx = 400, dy = 400;        // face size
  const ox = 150, oy = -150;       // back face offset
  const front = {
    bl: placeNode(DANode, 'fbl', f, f + dy),
    br: placeNode(DANode, 'fbr', f + dx, f + dy),
    tr: placeNode(DANode, 'ftr', f + dx, f),
    tl: placeNode(DANode, 'ftl', f, f),
  };
  const back = {
    bl: placeNode(DANode, 'bbl', f + ox, f + dy + oy),
    br: placeNode(DANode, 'bbr', f + dx + ox, f + dy + oy),
    tr: placeNode(DANode, 'btr', f + dx + ox, f + oy),
    tl: placeNode(DANode, 'btl', f + ox, f + oy),
  };
  const edges = [];
  // Front face (4 edges).
  edges.push(connect(DAEdge, 'fbl-fbr', front.bl, front.br));
  edges.push(connect(DAEdge, 'fbr-ftr', front.br, front.tr));
  edges.push(connect(DAEdge, 'ftr-ftl', front.tr, front.tl));
  edges.push(connect(DAEdge, 'ftl-fbl', front.tl, front.bl));
  // Back face (4 edges).
  edges.push(connect(DAEdge, 'bbl-bbr', back.bl, back.br));
  edges.push(connect(DAEdge, 'bbr-btr', back.br, back.tr));
  edges.push(connect(DAEdge, 'btr-btl', back.tr, back.tl));
  edges.push(connect(DAEdge, 'btl-bbl', back.tl, back.bl));
  // Depth edges (4 edges).
  edges.push(connect(DAEdge, 'fbl-bbl', front.bl, back.bl));
  edges.push(connect(DAEdge, 'fbr-bbr', front.br, back.br));
  edges.push(connect(DAEdge, 'ftr-btr', front.tr, back.tr));
  edges.push(connect(DAEdge, 'ftl-btl', front.tl, back.tl));
  return {
    nodes: [front.bl, front.br, front.tr, front.tl, back.bl, back.br, back.tr, back.tl],
    edges,
  };
}
