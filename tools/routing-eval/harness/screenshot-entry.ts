// Browser bundle entry for faithful screenshots. Unlike bundle-entry.ts
// (which aliases da-node / da-edge to pure-geometry fakes), this imports the
// REAL DANode / DAEdge with real Konva and renders a scenario's geometry into
// a real Konva stage. Because the app renders every edge as exactly
// `Konva.Arrow(points = getPathPoints(), tension = 0.5)`, replaying the
// geometry through these same classes is pixel-identical to KiDraw's canvas —
// not an approximation like the SVG path.
//
// esbuild bundles this as an IIFE that attaches `renderScenario` to `window`.
// The Puppeteer driver (render-screens.mjs) calls it per cell, then
// screenshots the container div.

import Konva from 'konva';
import { DANode } from '../../../src/app/drawing-area/da-node';
import { DAEdge } from '../../../src/app/drawing-area/da-edge';

interface GeomNode {
  id: string;
  x: number;
  y: number;
  shape?: string;
}

interface GeomEdge {
  id: string;
  src: string;
  dest: string;
  controlPoints: { x: number; y: number }[];
  smoothRendering?: boolean;
}

interface Geometry {
  nodes: GeomNode[];
  edges: GeomEdge[];
}

// Match render-svg.mjs framing: graph bbox + a fixed margin.
const PAD = 60;
// Black-on-white to match the harness's neutral palette (no theme).
const COLORS = { fill: 'white', stroke: 'black', text: 'black' };

function renderScenario(
  containerId: string, geometry: Geometry, showWaypoints = true,
): { width: number; height: number } {
  const container = document.getElementById(containerId)!;

  // Build real nodes first so edges can reference them.
  const nodeById = new Map<string, DANode>();
  for (const gn of geometry.nodes) {
    const node = new DANode(gn.x, gn.y, gn.id, gn.id, COLORS, (gn.shape as any) ?? 'box');
    nodeById.set(gn.id, node);
  }

  // Build edges and replay their control points + smoothing.
  const edges: DAEdge[] = [];
  for (const ge of geometry.edges) {
    const src = nodeById.get(ge.src)!;
    const dest = nodeById.get(ge.dest)!;
    const edge = new DAEdge(src, dest, '', ge.id, { stroke: COLORS.stroke, fill: COLORS.stroke });
    edge.setControlPoints(ge.controlPoints.map(p => ({ x: p.x, y: p.y })));
    edge.setSmoothRendering(!!ge.smoothRendering);
    // Show the router's control points as waypoint glyphs (same call the app
    // makes after routing), so screenshots reveal where the bends sit.
    if (showWaypoints) edge.promoteToWaypoints();
    edges.push(edge);
  }

  // Frame: bbox over node boxes AND edge geometry, padded on all sides.
  // Edge curves routinely bulge well outside the node bbox; framing to nodes
  // alone clips the very routing we're trying to judge. Include each edge's
  // rendered polyline points so the whole curve stays in frame.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const node of nodeById.values()) {
    const g = node.konvaGroup;
    grow(g.x(), g.y());
    grow(g.x() + node.NODE_WIDTH, g.y() + node.NODE_HEIGHT);
  }
  for (const edge of edges) {
    for (const p of edge.getPathPoints()) grow(p.x, p.y);
  }
  const width = (maxX - minX) + PAD * 2;
  const height = (maxY - minY) + PAD * 2;

  const stage = new Konva.Stage({ container: containerId, width, height });
  const layer = new Konva.Layer();
  // Shift so the padded bbox origin maps to (0,0).
  layer.position({ x: -(minX - PAD), y: -(minY - PAD) });

  // Edges under nodes (nodes draw on top), matching the SVG order.
  for (const edge of edges) layer.add(edge.group);
  for (const node of nodeById.values()) layer.add(node.konvaGroup);

  stage.add(layer);
  layer.draw();

  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  return { width, height };
}

(window as any).renderScenario = renderScenario;
