#!/usr/bin/env node
// Renders the bulge / curvature / bends explainer figures as PNGs.
//
// Reproducible: `node notes/assets/desiderata-metrics/render.mjs`. Each example
// is the same polyline used in notes/desiderata-bulge-curvature-bends.md. We
// draw the straight chord (what bulge measures against), the polyline the
// metrics actually see (segments + vertices), and a callout for the worst-case
// bulge point, then screenshot each SVG to a PNG via headless Chromium.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- the examples (chord (0,0)->(300,0), matching the note's table) ---
const EXAMPLES = [
  { id: 'a-straight', title: 'A — straight line',
    poly: [{ x: 0, y: 0 }, { x: 300, y: 0 }] },
  { id: 'b-sharp-detour', title: 'B — one sharp detour',
    poly: [{ x: 0, y: 0 }, { x: 150, y: 120 }, { x: 300, y: 0 }] },
  { id: 'c-gentle-arc', title: 'C — one gentle arc',
    poly: [{ x: 0, y: 0 }, { x: 150, y: 35 }, { x: 300, y: 0 }] },
  { id: 'd-zigzags', title: 'D — four small zigzags',
    poly: [{ x: 0, y: 0 }, { x: 60, y: 8 }, { x: 120, y: -8 },
           { x: 180, y: 8 }, { x: 240, y: -8 }, { x: 300, y: 0 }] },
  { id: 'e-staircase', title: 'E — staircase (two right angles)',
    poly: [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 80 }, { x: 300, y: 80 }] },
];

// --- metric formulas (copied from edge-routing-metrics.ts) ---
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function perpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (len < 1e-6) return dist(p, a);
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len;
}
function bulgeInfo(poly) {
  const s = poly[0], e = poly[poly.length - 1], chord = dist(s, e);
  let worst = null, max = 0;
  for (let i = 1; i < poly.length - 1; i++) {
    const d = perpDist(poly[i], s, e);
    if (d > max) { max = d; worst = poly[i]; }
  }
  return { ratio: chord ? max / chord : 0, worst, chord };
}
function curvature(poly) {
  let sum = 0, max = 0;
  for (let i = 1; i < poly.length - 1; i++) {
    const a = poly[i - 1], b = poly[i], c = poly[i + 1];
    const d1x = b.x - a.x, d1y = b.y - a.y, d2x = c.x - b.x, d2y = c.y - b.y;
    const l1 = Math.hypot(d1x, d1y) || 1, l2 = Math.hypot(d2x, d2y) || 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, (d1x * d2x + d1y * d2y) / (l1 * l2))));
    sum += ang; max = Math.max(max, ang);
  }
  return { sum, max };
}

/** Foot of the perpendicular from p onto line a->b. */
function projectOnto(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

const W = 580, H = 340;
const PAD_X = 70, PAD_TOP = 64, PAD_BOTTOM = 70;

function fit(poly) {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  const drawW = W - 2 * PAD_X, drawH = H - PAD_TOP - PAD_BOTTOM;
  const scale = Math.min(drawW / spanX, drawH / spanY);
  const offX = PAD_X + (drawW - spanX * scale) / 2 - minX * scale;
  const offY = PAD_TOP + (drawH - spanY * scale) / 2 - minY * scale;
  return p => ({ x: offX + p.x * scale, y: offY + p.y * scale });
}

function svg(ex) {
  const s = fit(ex.poly);
  const pts = ex.poly.map(s);
  const first = pts[0], last = pts[pts.length - 1];
  const b = bulgeInfo(ex.poly);
  const c = curvature(ex.poly);
  const bends = ex.poly.length - 2;

  const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const interior = pts.slice(1, -1)
    .map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="#2563eb"/>`)
    .join('');

  // bulge callout
  let bulge = '';
  if (b.worst) {
    const wScreen = s(b.worst);
    const foot = s(projectOnto(b.worst, ex.poly[0], ex.poly[ex.poly.length - 1]));
    bulge =
      `<line x1="${foot.x.toFixed(1)}" y1="${foot.y.toFixed(1)}" ` +
      `x2="${wScreen.x.toFixed(1)}" y2="${wScreen.y.toFixed(1)}" ` +
      `stroke="#ea580c" stroke-width="2" stroke-dasharray="4 3"/>` +
      `<text x="${(wScreen.x + 8).toFixed(1)}" y="${((wScreen.y + foot.y) / 2).toFixed(1)}" ` +
      `font-size="13" fill="#ea580c">bulge ${b.ratio.toFixed(3)}</text>`;
  }

  const stat = `bends ${bends}   ·   bulge ${b.ratio.toFixed(3)}   ·   ` +
    `total curv ${(c.sum * 180 / Math.PI).toFixed(0)}°   ·   max curv ${(c.max * 180 / Math.PI).toFixed(0)}°`;

  return `<svg id="${ex.id}" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="28" y="36" font-size="20" font-weight="600" fill="#0f172a">${ex.title}</text>
  <!-- chord -->
  <line x1="${first.x.toFixed(1)}" y1="${first.y.toFixed(1)}" x2="${last.x.toFixed(1)}" y2="${last.y.toFixed(1)}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 5"/>
  <text x="${((first.x + last.x) / 2).toFixed(1)}" y="${(Math.max(first.y, last.y) + 26).toFixed(1)}" font-size="12" fill="#94a3b8" text-anchor="middle">straight chord</text>
  <!-- polyline the metric sees -->
  <polyline points="${polyPts}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  ${bulge}
  ${interior}
  <!-- endpoints -->
  <circle cx="${first.x.toFixed(1)}" cy="${first.y.toFixed(1)}" r="7" fill="#0f172a"/>
  <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="7" fill="#0f172a"/>
  <text x="${first.x.toFixed(1)}" y="${(first.y - 13).toFixed(1)}" font-size="12" fill="#0f172a" text-anchor="middle">src</text>
  <text x="${last.x.toFixed(1)}" y="${(last.y - 13).toFixed(1)}" font-size="12" fill="#0f172a" text-anchor="middle">dst</text>
  <!-- stats -->
  <text x="28" y="${H - 26}" font-size="15" fill="#334155">${stat}</text>
</svg>`;
}

async function main() {
  const blocks = EXAMPLES.map(svg).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${blocks}</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' });
    for (const ex of EXAMPLES) {
      const el = await page.$(`#${ex.id}`);
      await el.screenshot({ path: join(__dirname, `${ex.id}.png`) });
      console.log(`wrote ${ex.id}.png`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
