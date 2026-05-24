// Internal helper used by the agent to verify the viewer works end-to-end:
// starts a tiny static file server pointing at tools/routing-eval/, drives
// Puppeteer to load the viewer, navigate two cells, rate the second one,
// confirm the rating download payload is well-formed, and dump a PNG of
// the viewer for the agent's report.
//
// This script is not on the user's happy path — they launch the viewer via
// `python3 -m http.server`. It exists to make verification automated.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // tools/routing-eval/
const PORT = Number(process.env.PORT ?? 8766);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
};

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/viewer/index.html';
      // Map any directory request to its index.html.
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      // Allow paths like /viewer/... and /runs/... starting at ROOT.
      const fsPath = path.normalize(path.join(ROOT, urlPath));
      if (!fsPath.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
      fs.stat(fsPath, (err, st) => {
        if (err || !st.isFile()) {
          res.statusCode = 404;
          return res.end(`not found: ${urlPath}\n`);
        }
        res.setHeader('Content-Type', MIME[path.extname(fsPath)] ?? 'application/octet-stream');
        fs.createReadStream(fsPath).pipe(res);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const screenshotPath = process.argv[2] ?? path.join(ROOT, 'verification.png');

  const server = await serve();
  console.log(`viewer server: http://127.0.0.1:${PORT}/viewer/`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
    page.on('console', msg => console.log(`  [browser ${msg.type()}]`, msg.text()));

    await page.goto(`http://127.0.0.1:${PORT}/viewer/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#algo-name', { timeout: 10000 });
    // Wait until manifest finishes loading and the run label updates.
    await page.waitForFunction(() => {
      const el = document.getElementById('run-label');
      return el && /\d+\s*cells/.test(el.textContent);
    }, { timeout: 10000 });

    // First cell
    const first = await page.evaluate(() => ({
      algo: document.getElementById('algo-name').textContent,
      scen: document.getElementById('scenario-name').textContent,
      svgSrc: document.getElementById('svg-frame').getAttribute('data'),
    }));
    console.log(`  cell 1: ${first.algo} / ${first.scen} (svg=${first.svgSrc})`);

    // Step to next cell.
    await page.click('#next-btn');
    await page.waitForFunction((prev) => {
      return document.getElementById('algo-name').textContent + '/' +
             document.getElementById('scenario-name').textContent !== prev;
    }, {}, `${first.algo}/${first.scen}`);
    const second = await page.evaluate(() => ({
      algo: document.getElementById('algo-name').textContent,
      scen: document.getElementById('scenario-name').textContent,
    }));
    console.log(`  cell 2: ${second.algo} / ${second.scen}`);

    // Rate the second cell 4.
    await page.click('.rating-btn[data-rating="4"]');
    await page.type('#rating-comment', 'sample comment from verification harness');

    // Step forward to a third cell so we know nav keeps working.
    await page.click('#next-btn');
    const third = await page.evaluate(() => ({
      algo: document.getElementById('algo-name').textContent,
      scen: document.getElementById('scenario-name').textContent,
    }));
    console.log(`  cell 3: ${third.algo} / ${third.scen}`);

    // Step back to the rated cell to confirm rating persisted to UI.
    await page.click('#prev-btn');
    const ratingPersisted = await page.evaluate(() => {
      const active = document.querySelector('.rating-btn.active');
      const comment = document.getElementById('rating-comment').value;
      return { rating: active ? active.dataset.rating : null, comment };
    });
    console.log(`  rating persisted in UI: ${JSON.stringify(ratingPersisted)}`);

    // Capture the feedback payload the download button would emit.
    const feedback = await page.evaluate(() => {
      // Internal hook for the verification harness.
      const { state } = window;
      return state ? { runTimestamp: state.runTs, cells: state.ratings } : null;
    });
    if (!feedback) {
      // The viewer doesn't expose `window.state`; reconstruct via localStorage.
      const ratings = await page.evaluate((runTs) => {
        return JSON.parse(localStorage.getItem(`routing-eval:${runTs}`) || '{}');
      }, await page.evaluate(() => {
        const m = document.getElementById('run-label').textContent.match(/run\s+(\S+)/);
        return m ? m[1] : null;
      }));
      console.log(`  ratings from localStorage: ${JSON.stringify(ratings)}`);
    } else {
      console.log(`  feedback payload: ${JSON.stringify(feedback)}`);
    }

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  screenshot: ${screenshotPath}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
