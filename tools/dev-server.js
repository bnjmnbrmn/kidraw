#!/usr/bin/env node
// Start the local log collector and Angular dev server together.
// Passes any extra args through to `ng serve`, e.g.:
//   npm start -- --port 4225

const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extraArgs = process.argv.slice(2);

const children = [];
let shuttingDown = false;

function start(command, args, name) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  children.push({ child, name });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (name === 'ng serve') {
      shutdown(code ?? (signal ? 1 : 0));
    }
  });
  return child;
}

function shutdown(exitCode = 0) {
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) child.kill();
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start(process.execPath, [path.join('tools', 'log-server.js')], 'log server');
start(process.execPath, [
  path.join('node_modules', '@angular', 'cli', 'bin', 'ng.js'),
  'serve',
  ...extraArgs,
], 'ng serve');
