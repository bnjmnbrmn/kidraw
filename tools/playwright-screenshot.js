#!/usr/bin/env node
/*
 * tools/playwright-screenshot.js
 *
 * Drive the kidraw dev app at http://localhost:4200 with a headless Chromium
 * (Playwright) and capture a PNG screenshot. Intended for ad-hoc use by
 * Claude Code agents iterating on the diagram (e.g. routing, layout tweaks).
 *
 * Usage:
 *   node tools/playwright-screenshot.js --name <name> [options]
 *   npm run screenshot -- --name <name> [options]
 *
 * Options:
 *   --name <name>          Output basename (saved to tools/screenshots/<name>.png).
 *                          Required.
 *   --sample <id>          Sample-graph id from DemoDataService (e.g. nudge-multi,
 *                          basic, classes, files, modes, nudge-fan, nudge-converge).
 *                          Selected via the header <select.sample-graph-select>
 *                          and dispatched as a `change` event so Angular's
 *                          (change) handler fires.
 *   --keys <sequence>      Whitespace-separated list of keys to press in `normal`
 *                          mode after the sample loads. Each token is one
 *                          keydown+keyup with a brief delay between events so the
 *                          keymenu state machine can settle. Special tokens:
 *                            Enter, Escape, Tab, Backspace, Shift, Control,
 *                            Backslash, Space.
 *                          Any other single character is sent verbatim.
 *                          Hold semantics: kidraw submenus require the trigger
 *                          key to stay DOWN while the action key is pressed. Use
 *                          `[a b ...]` to express "hold a while pressing b ...,
 *                          then release a". Brackets can nest:
 *                            --keys "[b p]"   open Layout submenu, press p
 *                                            (apply Charged Spring Edges).
 *                            --keys "[w [s d]]"   hold w, hold s, press d, ...
 *                          A token can also include `:down` or `:up` suffix for
 *                          explicit half-presses (rarely needed):
 *                            --keys "b:down p b:up".
 *   --url <url>            Override dev-server URL (default http://localhost:4200).
 *   --wait <ms>            Extra ms to wait after keystrokes before screenshot
 *                          (default 800). Useful for animated layouts.
 *   --width <n>            Viewport width (default 1600).
 *   --height <n>           Viewport height (default 1000).
 *   --full-page            Capture full page instead of viewport.
 *   --headed               Run with a visible browser window (debug).
 *
 * Keystroke dispatch:
 *   Keys are dispatched against `document.body` (the focused element after page
 *   load) using Playwright's keyboard API, which produces real KeyboardEvent
 *   instances with `key`, `code`, `keyCode` populated. KeymenuComponent listens
 *   on `document:keydown` / `document:keyup` HostListeners, so these are picked
 *   up exactly like a human key press.
 *
 * Exit codes:
 *   0 on success, non-zero on any failure (with diagnostic on stderr).
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

function parseArgs(argv) {
  const args = {
    name: null,
    sample: null,
    keys: '',
    url: 'http://localhost:4200',
    wait: 800,
    width: 1600,
    height: 1000,
    fullPage: false,
    headed: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--name': args.name = next(); break;
      case '--sample': args.sample = next(); break;
      case '--keys': args.keys = next(); break;
      case '--url': args.url = next(); break;
      case '--wait': args.wait = parseInt(next(), 10); break;
      case '--width': args.width = parseInt(next(), 10); break;
      case '--height': args.height = parseInt(next(), 10); break;
      case '--full-page': args.fullPage = true; break;
      case '--headed': args.headed = true; break;
      case '-h':
      case '--help':
        process.stdout.write(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 50).join('\n') + '\n');
        process.exit(0);
      default:
        console.error(`Unknown arg: ${a}`);
        process.exit(2);
    }
  }
  if (!args.name) {
    console.error('Missing required --name <name>');
    process.exit(2);
  }
  return args;
}

// Map our token -> Playwright key name. Anything not in this table is sent verbatim
// (single chars like 'a', 'b', 'p', ';' work as-is in Playwright).
const SPECIAL_KEYS = {
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Shift: 'Shift',
  Control: 'Control',
  Backslash: '\\',
  Space: ' ',
};

function normalizeKey(token) {
  if (token in SPECIAL_KEYS) return SPECIAL_KEYS[token];
  return token;
}

/** Tokenize a key-sequence string into a flat array of tokens. Brackets
 *  '[' and ']' become their own tokens; everything else is whitespace-split. */
function tokenizeKeys(s) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf.length) { out.push(buf); buf = ''; } };
  for (const ch of s) {
    if (ch === '[' || ch === ']') {
      flush();
      out.push(ch);
    } else if (/\s/.test(ch)) {
      flush();
    } else {
      buf += ch;
    }
  }
  flush();
  return out;
}

/** Walk the bracket-aware token stream and dispatch keydown/keyup events.
 *  - 'foo' inside any context: press+release (keydown then keyup).
 *  - 'foo:down' / 'foo:up': explicit half-press.
 *  - '[' opens a hold scope: the next token (head) is held DOWN through the
 *    matching ']', and inner tokens are dispatched while head is down.
 *  - ']' releases the scope's head.
 *  Nested brackets supported. */
async function dispatchKeySequence(page, sequence) {
  const tokens = tokenizeKeys(sequence);
  const stack = []; // keys currently held by enclosing brackets, innermost last
  let i = 0;
  const HOLD_AFTER_DOWN = 60;
  const BETWEEN_TOKENS = 140;
  const PRESS_HOLD_MS = 40;

  while (i < tokens.length) {
    const tok = tokens[i++];
    if (tok === '[') {
      if (i >= tokens.length) throw new Error('unmatched [');
      const head = tokens[i++];
      const key = normalizeKey(head);
      await page.keyboard.down(key);
      stack.push(key);
      await page.waitForTimeout(HOLD_AFTER_DOWN);
      continue;
    }
    if (tok === ']') {
      const key = stack.pop();
      if (!key) throw new Error('unmatched ]');
      await page.keyboard.up(key);
      await page.waitForTimeout(HOLD_AFTER_DOWN);
      continue;
    }
    if (tok.endsWith(':down')) {
      await page.keyboard.down(normalizeKey(tok.slice(0, -':down'.length)));
      await page.waitForTimeout(HOLD_AFTER_DOWN);
      continue;
    }
    if (tok.endsWith(':up')) {
      await page.keyboard.up(normalizeKey(tok.slice(0, -':up'.length)));
      await page.waitForTimeout(HOLD_AFTER_DOWN);
      continue;
    }
    // Plain press: keydown, hold briefly, keyup.
    const key = normalizeKey(tok);
    await page.keyboard.down(key);
    await page.waitForTimeout(PRESS_HOLD_MS);
    await page.keyboard.up(key);
    await page.waitForTimeout(BETWEEN_TOKENS);
  }

  // Safety: release anything left held (shouldn't happen with balanced brackets).
  while (stack.length > 0) {
    await page.keyboard.up(stack.pop());
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.join(__dirname, 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${args.name}.png`);

  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({
    viewport: { width: args.width, height: args.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.error('[page error]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console error]', msg.text());
  });

  try {
    await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for the Konva stage canvas to mount inside #mainDrawingArea.
    await page.waitForSelector('#mainDrawingArea canvas', { timeout: 15000 });
    // A small extra delay lets Angular finish its initial change-detection passes.
    await page.waitForTimeout(300);

    if (args.sample) {
      // Select the sample graph via the header <select> and dispatch a change
      // event so Angular's (change) binding fires onSampleGraphChange().
      const ok = await page.evaluate((id) => {
        const sel = document.querySelector('select.sample-graph-select');
        if (!sel) return { ok: false, reason: 'sample select not found' };
        const opt = Array.from(sel.options).find(o => o.value === id);
        if (!opt) return { ok: false, reason: `unknown sample id: ${id}` };
        sel.value = id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      }, args.sample);
      if (!ok.ok) {
        console.error(`Failed to load sample: ${ok.reason}`);
        process.exit(3);
      }
      // Sample graph builds nodes/edges synchronously then batchDraws — small
      // wait gives the canvas a frame to paint.
      await page.waitForTimeout(400);
    }

    // Make sure focus is on body so keymenu's document-level keydown listeners fire.
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      document.body.focus();
    });

    if (args.keys && args.keys.trim().length > 0) {
      await dispatchKeySequence(page, args.keys);
    }

    // Final settle (animations, charged-spring iterations, etc.)
    await page.waitForTimeout(args.wait);

    await page.screenshot({ path: outPath, fullPage: args.fullPage });

    const size = fs.statSync(outPath).size;
    console.log(`screenshot: ${outPath} (${size} bytes)`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error('FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
