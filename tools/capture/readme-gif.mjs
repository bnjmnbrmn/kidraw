#!/usr/bin/env node
/**
 * The README's animation: twenty seconds of KiDraw, driven with real keys.
 *
 *   node tools/capture/readme-gif.mjs            # frames + timing into .capture/readme
 *   uvx --with pillow python tools/capture/make-gif.py .capture/readme docs/readme-demo.gif
 *
 * An empty canvas; tap Add and type a label; hold Add and aim to grow two
 * connected boxes; hold Layout for a tree. The on-screen keyboard is visible
 * throughout, since it is the thing a newcomer has not seen before.
 *
 * Frames come from Chromium's screencast (a frame per paint), each stamped
 * with when it arrived, so the GIF plays at the speed it happened, with dead
 * time between paints capped by make-gif.py.
 */
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open, keys} from './driver.mjs';
import {typeFilm} from './gestures.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] ?? join(root, '.capture', 'readme');
rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});

const {browser, page, errors} = await open({width: 1100, height: 700});
await page.evaluate(() => { window.confirm = () => true; });
await page.evaluate(() => {
  const da = window.ng.getComponent(document.querySelector('app-drawing-area'));
  da.handleCommand({kind: 'NEW_GRAPH'});
});
await page.waitForTimeout(600);

const frames = [];
const client = await page.context().newCDPSession(page);
client.on('Page.screencastFrame', async event => {
  const file = join(out, `f${String(frames.length).padStart(5, '0')}.jpg`);
  writeFileSync(file, Buffer.from(event.data, 'base64'));
  frames.push({file, at: Date.now()});
  await client.send('Page.screencastFrameAck', {sessionId: event.sessionId}).catch(() => {});
});
await client.send('Page.startScreencast', {format: 'jpeg', quality: 90, maxWidth: 1100, maxHeight: 700});

const pause = ms => page.waitForTimeout(ms);
/** A still moment the viewer should see: the screencast sends nothing while
 *  nothing paints, so mark it for make-gif.py to hold. */
const holds = [];
const hold = async ms => { holds.push({at: Date.now(), ms}); await pause(ms); };

await hold(900);
await keys(page, 'a');
await pause(350);
await typeFilm(page, 'Write the README', {perChar: 70});
await hold(500);
await keys(page, '[a l]');
await pause(450);
await typeFilm(page, 'Record a GIF', {perChar: 70});
await hold(500);
await keys(page, '[a j]');
await pause(450);
await typeFilm(page, 'Ship it', {perChar: 70});
await hold(700);
await keys(page, '[b j]');
await pause(1500);
await hold(2200);

await client.send('Page.stopScreencast');
writeFileSync(join(out, 'timing.json'), JSON.stringify({frames, holds}, null, 1));
console.log(`${frames.length} frames${errors.length ? `, page errors: ${errors.join('; ')}` : ''}`);
await browser.close();
