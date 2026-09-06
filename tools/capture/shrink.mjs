#!/usr/bin/env node
/**
 * Re-encode the frames that only flash past.
 *
 * A step's settled frame is the one a reader actually looks at; the held keys,
 * the empty box, the half-typed label and the layout tween are on screen for
 * about an eighth of a second each. They can be a lot cheaper.
 *
 * They are also stored at a smaller size: the page scales them back up for the
 * eighth of a second they are visible, and the frame the animation settles on
 * is full size and sharp.
 *
 *   node tools/capture/shrink.mjs [quality] [scale] [dir] [fleeting|rest|all]
 */
import {readdirSync, readFileSync, writeFileSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', 'site', 'assets', process.argv[4] ?? 'map');
const quality = Number(process.argv[2] ?? 0.45);
const scale = Number(process.argv[3] ?? 1);
const FLEETING = /-(target|blank|typing|tween|camera)\.webp$/;
const which = process.argv[5] ?? 'fleeting';
const PICK = {
  fleeting: name => FLEETING.test(name),
  rest: name => name.endsWith('-rest.webp'),
  all: () => true,
};
if (!PICK[which]) throw new Error(`unknown selection ${which}; use fleeting, rest or all`);

const files = readdirSync(dir).filter(name => name.endsWith('.webp')).filter(PICK[which]);
const before = files.reduce((total, name) => total + statSync(join(dir, name)).size, 0);

const browser = await chromium.launch({headless: true});
const page = await browser.newPage();
await page.goto('about:blank');
for (const name of files) {
  const source = readFileSync(join(dir, name)).toString('base64');
  const encoded = await page.evaluate(async ([data, q, factor]) => {
    const image = new Image();
    image.src = 'data:image/webp;base64,' + data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * factor);
    canvas.height = Math.round(image.naturalHeight * factor);
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', q).split(',')[1];
  }, [source, quality, scale]);
  writeFileSync(join(dir, name), Buffer.from(encoded, 'base64'));
}
await browser.close();

const after = files.reduce((total, name) => total + statSync(join(dir, name)).size, 0);
console.log(`${files.length} ${which} frames: ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB at q${quality} x${scale}`);
