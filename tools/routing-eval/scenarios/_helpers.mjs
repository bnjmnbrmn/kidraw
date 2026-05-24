// Shared helpers each scenario uses to construct nodes/edges via the
// fake DA classes from the bundle. The bundle is loaded once by run.mjs
// and the resolved {DANode, DAEdge} pair is passed in.

/** Build a node centered at (cx, cy) so positions read naturally. The
 *  scenario writer can think in centers; we convert to top-left coords
 *  the way DANode expects (`konvaGroup.x()/y()` is the top-left). */
export function placeNode(DANode, id, cx, cy, opts = {}) {
  const w = opts.width  ?? 120;
  const h = opts.height ?? 120;
  return new DANode(id, cx - w / 2, cy - h / 2, { width: w, height: h, shape: opts.shape ?? 'box' });
}

/** Convenience: edge constructor as a small helper so scenarios stay terse. */
export function connect(DAEdge, id, src, dest) {
  return new DAEdge(id, src, dest);
}
