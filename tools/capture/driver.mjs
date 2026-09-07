/**
 * Shared harness for driving the running KiDraw app and capturing frames.
 * Key dispatch follows tools/playwright-screenshot.js: bracket scopes hold a
 * key down, so `[a l]` means "hold Add, press l, release Add".
 */
import {chromium} from '@playwright/test';

export const SPECIAL = {
  Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace',
  Shift: 'Shift', Control: 'Control', Backslash: '\\', Space: ' ',
};

// Held-key submenus animate in. Pressing the next key before the surface is
// ready silently lands it on the previous menu, which is how a grow ends up
// making a disconnected box, so these waits are deliberately generous.
const HOLD_AFTER_DOWN = 260;
const BETWEEN_TOKENS = 150;
const PRESS_HOLD_MS = 60;

function tokenize(s) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf.length) { out.push(buf); buf = ''; } };
  for (const ch of s) {
    if (ch === '[' || ch === ']') { flush(); out.push(ch); }
    else if (/\s/.test(ch)) flush();
    else buf += ch;
  }
  flush();
  return out;
}

const norm = token => (token in SPECIAL ? SPECIAL[token] : token);

export async function keys(page, sequence) {
  const tokens = tokenize(sequence);
  const held = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i++];
    if (token === '[') {
      const key = norm(tokens[i++]);
      await page.keyboard.down(key);
      held.push(key);
      await page.waitForTimeout(HOLD_AFTER_DOWN);
    } else if (token === ']') {
      await page.keyboard.up(held.pop());
      await page.waitForTimeout(HOLD_AFTER_DOWN);
    } else if (token.endsWith(':down')) {
      const key = norm(token.slice(0, -5));
      await page.keyboard.down(key);
      held.push(key);
      await page.waitForTimeout(HOLD_AFTER_DOWN);
    } else if (token.endsWith(':up')) {
      const key = norm(token.slice(0, -3));
      await page.keyboard.up(key);
      const at = held.indexOf(key);
      if (at >= 0) held.splice(at, 1);
      await page.waitForTimeout(HOLD_AFTER_DOWN);
    } else {
      const key = norm(token);
      await page.keyboard.down(key);
      await page.waitForTimeout(PRESS_HOLD_MS);
      await page.keyboard.up(key);
      await page.waitForTimeout(BETWEEN_TOKENS);
    }
  }
  while (held.length) await page.keyboard.up(held.pop());
}

export async function open({width = 1280, height = 800, url = 'http://localhost:4200', scale = 1} = {}) {
  // This box has under 4GB and is also running the dev server, so a capture
  // has been killed for memory more than once. One renderer, a bounded JS
  // heap, and no shared-memory file to run out of.
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--renderer-process-limit=1',
      '--js-flags=--max-old-space-size=256',
      '--disable-extensions',
      '--disable-background-networking',
    ],
  });
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: scale});
  // The captures are for a dark page, and the app remembers the choice.
  await context.addInitScript(() => window.localStorage.setItem('kidraw-theme', 'dark'));
  // A dev-server error draws a Vite overlay across the whole page, and a run
  // that is filming the page films that too: a permission error on a file
  // nothing in this project reads once landed in the middle of the map. Take
  // it out the moment it appears, and keep a count so the run can say so.
  await context.addInitScript(() => {
    window.__viteOverlays = 0;
    const strip = () => {
      for (const overlay of document.querySelectorAll('vite-error-overlay')) {
        window.__viteOverlays++;
        overlay.remove();
      }
    };
    const watch = () => {
      new MutationObserver(strip).observe(document.documentElement, {childList: true, subtree: true});
      strip();
    };
    if (document.documentElement) watch();
    else document.addEventListener('readystatechange', watch, {once: true});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, {waitUntil: 'networkidle'});
  await page.waitForSelector('app-drawing-area canvas', {timeout: 20000});
  await page.waitForTimeout(900);
  return {browser, page, errors};
}

/** How many dev-server error overlays have been taken off the page. Anything
 *  above zero means the run was filming a broken dev server. */
export const overlaysSeen = page => page.evaluate(() => window.__viteOverlays ?? 0);
