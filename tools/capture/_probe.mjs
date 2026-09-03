import {open, shooter} from './driver.mjs';
import {seed, grow, layout, focus, park} from './build.mjs';
const out = '/tmp/claude-1000/-home-bot-projects/bd3e84ab-8a6d-4a5e-b729-8a69312b0a76/scratchpad/portrait';
const [w, h] = process.argv[2].split('x').map(Number);
const {browser, page, scratch} = await open({width: w, height: h, scale: 1});
const shot = shooter(out, {type: 'webp', quality: 0.78, scratch});
await seed(page, 'Diagram editor'); await layout(page);
for (const [p, c] of [['Diagram editor', 'Technically, a Graph Editor'], ['Diagram editor', 'Comparable to'], ['Comparable to', 'Excalidraw']]) {
  await focus(page, p); await grow(page, c, {parent: p, refocus: () => focus(page, p)}); await layout(page);
}
await focus(page, 'Comparable to');
await park(page);
await shot(page, `p${w}x${h}`);
await browser.close();
