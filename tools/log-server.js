// Tiny log collector: receives POSTed log messages, writes to tools/debug.log
// Usage: node tools/log-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'debug.log');
const PORT = 9222;

// Clear log on startup
fs.writeFileSync(LOG_FILE, '');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const line = `${new Date().toISOString()} ${body}\n`;
      fs.appendFileSync(LOG_FILE, line);
      res.writeHead(200);
      res.end();
    });
  }
}).listen(PORT, () => console.log(`Log server on :${PORT}, writing to ${LOG_FILE}`));
