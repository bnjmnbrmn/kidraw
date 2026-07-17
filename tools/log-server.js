// Tiny log collector: receives POSTed log messages, writes to tools/debug.log.
// Also mirrors the app's localStorage draft: POST /draft overwrites
// tools/draft-mirror.json (GET /draft reads it back), so an agent on the box
// can see the graph currently being edited in any browser session.
// Usage: node tools/log-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'debug.log');
const DRAFT_FILE = path.join(__dirname, 'draft-mirror.json');
const PORT = 9222;

// Clear log on startup
fs.writeFileSync(LOG_FILE, '');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = (req.url || '/').split('?')[0];

  if (url === '/draft' && req.method === 'GET') {
    fs.readFile(DRAFT_FILE, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (url === '/draft') {
        fs.writeFileSync(DRAFT_FILE, body);
      } else {
        const line = `${new Date().toISOString()} ${body}\n`;
        fs.appendFileSync(LOG_FILE, line);
      }
      res.writeHead(200);
      res.end();
    });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Log server port :${PORT} is already in use; assuming a log collector is running.`);
    process.exit(0);
  }
  throw err;
});

// Loopback only: remote pages reach this through the nginx /debug-log proxy,
// so the raw port never needs to be exposed on the public interface.
server.listen(PORT, '127.0.0.1', () => console.log(`Log server on 127.0.0.1:${PORT}, writing to ${LOG_FILE}`));
