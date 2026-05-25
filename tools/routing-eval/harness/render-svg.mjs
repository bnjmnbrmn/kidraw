// Tiny SVG renderer for a scenario's routed graph. Output is a complete
// SVG document the viewer can <object>-embed and the user can right-click
// "Save As" to get a stand-alone PNG via the browser.
//
// Conventions:
//   - viewBox sized to the graph bbox plus a margin.
//   - Node bboxes drawn as rects (matching the harness's box-shape default).
//   - Edges drawn as polylines (matches the live Konva.Arrow when tension=0).
//   - Last segment of each edge gets an arrowhead marker.
//   - Pure SVG; no fonts beyond a generic sans-serif.

function bbox(nodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const x = n.konvaGroup.x();
    const y = n.konvaGroup.y();
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + n.NODE_WIDTH  > maxX) maxX = x + n.NODE_WIDTH;
    if (y + n.NODE_HEIGHT > maxY) maxY = y + n.NODE_HEIGHT;
  }
  return { minX, minY, maxX, maxY };
}

export function renderSvg({ nodes, edges, algorithm, scenario }) {
  const pad = 60;
  const b = bbox(nodes);
  const vbX = b.minX - pad;
  const vbY = b.minY - pad;
  const vbW = (b.maxX - b.minX) + pad * 2;
  const vbH = (b.maxY - b.minY) + pad * 2;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`,
  );
  parts.push(`<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="black"/>
    </marker>
  </defs>`);
  parts.push(`<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="white"/>`);

  // Edges first, so nodes draw on top.
  for (const e of edges) {
    let path;
    if (e.srcNode === e.destNode) {
      // Self-loop: routers leave it alone; render the four-point loop.
      path = e.getPathPoints();
    } else {
      path = e.getPathPoints();
    }
    if (path.length < 2) continue;
    const usesSmooth = !!e.smoothRendering && path.length >= 3;
    const d = usesSmooth ? buildSmoothPath(path) : buildPolylinePath(path);
    parts.push(`<path d="${d}" fill="none" stroke="black" stroke-width="2" marker-end="url(#arrow)"/>`);
  }

  for (const n of nodes) {
    const x = n.konvaGroup.x();
    const y = n.konvaGroup.y();
    parts.push(
      `<rect x="${x}" y="${y}" width="${n.NODE_WIDTH}" height="${n.NODE_HEIGHT}" fill="white" stroke="black" stroke-width="2"/>`,
    );
    parts.push(
      `<text x="${x + n.NODE_WIDTH / 2}" y="${y + n.NODE_HEIGHT / 2}" font-size="16" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" fill="black">${escapeXml(n.id)}</text>`,
    );
  }

  // Caption strip in the corner for stand-alone viewing.
  parts.push(
    `<text x="${vbX + 10}" y="${vbY + 22}" font-size="14" font-family="sans-serif" fill="#444">${escapeXml(algorithm)} • ${escapeXml(scenario)}</text>`,
  );

  parts.push('</svg>');
  return parts.join('\n');
}

function buildPolylinePath(points) {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

/** Catmull-Rom-style smoothing equivalent to Konva.Arrow with tension=0.5.
 *  We approximate by interpolating with quadratic curves between midpoints,
 *  which yields a visually similar smooth path. The actual on-screen rendering
 *  uses Konva's tension parameter; this is a reasonable visual approximation
 *  for SVG export. */
function buildSmoothPath(points) {
  if (points.length < 3) return buildPolylinePath(points);
  const out = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    out.push(`Q ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`);
  }
  const last = points[points.length - 1];
  out.push(`L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`);
  return out.join(' ');
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
