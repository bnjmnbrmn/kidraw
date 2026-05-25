import { placeNode, connect } from './_helpers.mjs';

export const name = 'parallel-runs';
export const description = '4 pairs of nodes arranged so the natural straight-line edges run parallel to each other in a horizontal band. Probes parallel-close-pass quality: do edges visibly separate or do they look like a single thick line?';

export function build({ DANode, DAEdge }) {
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 4; i++) {
    const y = 250 + i * 80;
    const src = placeNode(DANode, `S${i}`, 200, y);
    const dst = placeNode(DANode, `D${i}`, 900, y);
    nodes.push(src, dst);
    edges.push(connect(DAEdge, `E${i}`, src, dst));
  }
  return { nodes, edges };
}
